'use client';

import { useState, useCallback, useEffect } from 'react';
import { openaiService } from '@/services/openai';
import { toast } from 'sonner';

export interface GeneratedImage {
  id: string;
  imageData?: string; // Base64 - opcional agora
  imageUrl?: string; // URL do MinIO
  thumbnailUrl?: string; // URL da thumbnail
  prompt: string;
  revisedPrompt?: string;
  timestamp: number;
  createdAt?: string;
}

export interface ImageGenerationOptions {
  model?: 'gpt-image-1' | 'dall-e-3' | 'dall-e-2';
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'low' | 'medium' | 'high' | 'hd' | 'auto';
  background?: 'auto' | 'transparent' | 'opaque';
  useResponsesApi?: boolean;
  sessionId?: string;
}

export const useImageGeneration = (sessionId?: string) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Carregar imagens da sessão atual ao inicializar
  useEffect(() => {
    if (sessionId) {
      loadSessionImages(sessionId);
    }
  }, [sessionId]);

  const loadSessionImages = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/chatwitia/images/save?sessionId=${sessionId}&limit=50`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.images) {
          const images: GeneratedImage[] = data.images.map((img: any) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            thumbnailUrl: img.thumbnailUrl,
            prompt: img.prompt,
            revisedPrompt: img.revisedPrompt,
            timestamp: new Date(img.createdAt).getTime(),
            createdAt: img.createdAt
          }));
          
          setGeneratedImages(images);
          console.log(`Carregadas ${images.length} imagens da sessão ${sessionId}`);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar imagens da sessão:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveImageToMinIO = useCallback(async (
    imageData: string,
    prompt: string,
    revisedPrompt?: string,
    sessionId?: string,
    model = 'gpt-image-1'
  ): Promise<GeneratedImage | null> => {
    try {
      console.log(`Salvando imagem no MinIO: "${prompt.substring(0, 50)}..."`);
      
      const response = await fetch('/api/chatwitia/images/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData,
          prompt,
          revisedPrompt,
          sessionId,
          model
        })
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.image) {
        const savedImage: GeneratedImage = {
          id: data.image.id,
          imageUrl: data.image.imageUrl,
          thumbnailUrl: data.image.thumbnailUrl,
          prompt: data.image.prompt,
          revisedPrompt: data.image.revisedPrompt,
          timestamp: new Date(data.image.createdAt).getTime(),
          createdAt: data.image.createdAt
        };
        
        console.log(`Imagem salva com sucesso: ${savedImage.imageUrl}`);
        return savedImage;
      }
      
      return null;
    } catch (error: any) {
      console.error('Erro ao salvar imagem no MinIO:', error);
      toast.error(`Erro ao salvar imagem: ${error.message}`);
      return null;
    }
  }, []);

  const generateImage = useCallback(async (
    prompt: string, 
    options: ImageGenerationOptions = {}
  ): Promise<GeneratedImage[]> => {
    if (!prompt.trim()) {
      const errorMessage = 'Prompt não pode estar vazio';
      setError(errorMessage);
      toast.error(errorMessage);
      return [];
    }

    setIsGenerating(true);
    setError(null);

    try {
      console.log(`Gerando imagem com prompt: "${prompt.substring(0, 50)}..."`);
      
      const defaultOptions: ImageGenerationOptions = {
        model: 'gpt-image-1',
        size: '1024x1024',
        quality: 'auto',
        background: 'auto',
        useResponsesApi: false,
        sessionId: sessionId
      };

      const mergedOptions = { ...defaultOptions, ...options };

      let response;
      
      if (mergedOptions.useResponsesApi) {
        // Usar Responses API para conversas mais interativas
        response = await openaiService.generateImageWithResponses(prompt, {
          model: mergedOptions.model === 'gpt-image-1' ? 'gpt-4.1-mini' : 'gpt-4o',
          quality: mergedOptions.quality,
          size: mergedOptions.size,
          background: mergedOptions.background
        });
        
        // Processar resposta da Responses API
        const images: GeneratedImage[] = [];
        
        if (response.images && Array.isArray(response.images)) {
          for (const [index, img] of response.images.entries()) {
            // Salvar no MinIO
            const savedImage = await saveImageToMinIO(
              img.result,
              prompt,
              img.revised_prompt,
              mergedOptions.sessionId,
              mergedOptions.model
            );
            
            if (savedImage) {
              images.push(savedImage);
            } else {
              // Fallback para base64 se o salvamento falhar
              images.push({
                id: img.id || `generated-${Date.now()}-${index}`,
                imageData: img.result,
                prompt: prompt,
                revisedPrompt: img.revised_prompt,
                timestamp: Date.now()
              });
            }
          }
        }
        
        if (images.length > 0) {
          setGeneratedImages(prev => [...images, ...prev]);
          toast.success(`${images.length} imagem(ns) gerada(s) e salva(s) com sucesso!`);
        }
        
        return images;
      } else {
        // Usar Image API diretamente
        response = await openaiService.generateImage(prompt, {
          model: mergedOptions.model,
          size: mergedOptions.size,
          quality: mergedOptions.quality,
          background: mergedOptions.background,
          n: 1
        });

        const images: GeneratedImage[] = [];
        
        if (response.success && response.data && Array.isArray(response.data)) {
          for (const [index, imageItem] of response.data.entries()) {
            // Salvar no MinIO
            const savedImage = await saveImageToMinIO(
              imageItem.b64_json,
              prompt,
              imageItem.revised_prompt || prompt,
              mergedOptions.sessionId,
              mergedOptions.model
            );
            
            if (savedImage) {
              images.push(savedImage);
            } else {
              // Fallback para base64 se o salvamento falhar
              images.push({
                id: `generated-${Date.now()}-${index}`,
                imageData: imageItem.b64_json,
                prompt: prompt,
                revisedPrompt: imageItem.revised_prompt || prompt,
                timestamp: Date.now()
              });
            }
          }
        }

        if (images.length > 0) {
          setGeneratedImages(prev => [...images, ...prev]);
          toast.success(`${images.length} imagem(ns) gerada(s) e salva(s) com sucesso!`);
        } else {
          throw new Error('Nenhuma imagem foi gerada');
        }
        
        return images;
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro desconhecido ao gerar imagem';
      console.error('Erro na geração de imagem:', error);
      
      setError(errorMessage);
      toast.error(`Erro ao gerar imagem: ${errorMessage}`);
      
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [sessionId, saveImageToMinIO]);

  const clearImages = useCallback(() => {
    setGeneratedImages([]);
    setError(null);
  }, []);

  const removeImage = useCallback((imageId: string) => {
    setGeneratedImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  const getImageById = useCallback((imageId: string) => {
    return generatedImages.find(img => img.id === imageId);
  }, [generatedImages]);

  const refreshSessionImages = useCallback(() => {
    if (sessionId) {
      loadSessionImages(sessionId);
    }
  }, [sessionId, loadSessionImages]);

  return {
    generateImage,
    isGenerating,
    generatedImages,
    error,
    isLoading,
    clearImages,
    removeImage,
    getImageById,
    refreshSessionImages
  };
}; 