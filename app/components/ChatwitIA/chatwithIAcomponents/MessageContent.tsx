// app/components/ChatwitIA/chatwithIAcomponents/MessageContent.tsx
"use client";

//import { CodeProps } from "react-markdown/lib/ast-to-react";

// ESTRATÉGIA ANTI-PISCAR DE IMAGENS:
// =================================
// Para evitar o "piscar" das imagens durante a geração:
// 1. Usa o mesmo componente GeneratedImage para progresso e imagem final
// 2. Key estável baseada no src da imagem (não no index)
// 3. Transição suave via props isProgress, sem re-mount do elemento <img>
// 4. Mantém o mesmo base64 durante toda a sessão (priorizando sobre URLs do MinIO)
// 5. PRÉ-CARREGAMENTO: Quando imagem final é diferente da parcial, pré-carrega 
//    "nos bastidores" e só troca quando pronta, eliminando 100% do piscar

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import CodeBlock from "./CodeBlock";
import { FileIcon, Download, Eye, Copy, MessageSquare, Image as ImageIcon, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  content: string;
  isStreaming?: boolean;
  onImageReference?: (imageUrl: string, prompt?: string, openaiFileId?: string) => void;
}

// Componente moderno para preview de imagem carregada (similar ao ChatGPT)
const ImagePreview: React.FC<{ 
  imageUrl: string; 
  filename: string;
  fileId?: string;
  onImageReference?: (imageUrl: string, prompt?: string, openaiFileId?: string) => void;
}> = React.memo(({ imageUrl, filename, fileId, onImageReference }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullImageLoaded, setFullImageLoaded] = useState(false);

  // Cache da URL completa para evitar múltiplas chamadas
  const [cachedFullImageUrl, setCachedFullImageUrl] = useState<string | null>(null);

  // Tentar obter URL da thumbnail se disponível
  const getThumbnailUrl = (url: string) => {
    // Se já contém thumb_, usar como está
    if (url.includes('thumb_')) {
      return url;
    }
    
    // Para URLs do MinIO, tentar gerar thumbnail URL
    if (url.includes('objstoreapi.witdev.com.br') || url.includes('objstore.witdev.com.br')) {
      const parts = url.split('/');
      if (parts.length > 0) {
        const filename = parts[parts.length - 1];
        parts[parts.length - 1] = `thumb_${filename}`;
        return parts.join('/');
      }
    }
    
    // Se não conseguir gerar thumbnail, usar URL original
    return url;
  };

  const thumbnailUrl = getThumbnailUrl(imageUrl);
  const displayUrl = hasError ? imageUrl : thumbnailUrl;

  // 🔧 OTIMIZAÇÃO: Preparar URL completa apenas quando modal é aberto
  const getFullImageUrl = () => {
    if (cachedFullImageUrl) {
      return cachedFullImageUrl;
    }
    
    // Se fileId existe e não é URL completa, construir URL da API
    if (fileId && !imageUrl.startsWith('http')) {
      const fullUrl = `/api/chatwitia/files/${fileId}/content`;
      setCachedFullImageUrl(fullUrl);
      return fullUrl;
    }
    
    // Usar imageUrl diretamente
    setCachedFullImageUrl(imageUrl);
    return imageUrl;
  };

  // 🔧 NOVA FUNÇÃO: Obter URL completa para cópia (com domínio)
  const getFullUrlForCopy = () => {
    // Se é uma URL relativa da API, adicionar o domínio
    if (imageUrl.startsWith('/api/')) {
      return `${window.location.origin}${imageUrl}`;
    }
    
    // Se já é uma URL completa, retornar como está
    return imageUrl;
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    // Se erro na thumbnail, tentar URL original
    if (!hasError && thumbnailUrl !== imageUrl) {
      setHasError(true);
    }
  };

  const handleReference = () => {
    if (onImageReference) {
      // 🔧 MELHORIA: Priorizar imageUrl real, mas incluir informações do fileId se disponível
      let urlForReference = imageUrl;
      
      // Se temos fileId, tentar usar uma URL mais específica para busca
      if (fileId && !imageUrl.startsWith('http')) {
        // Se imageUrl não é uma URL completa e temos fileId, usar a URL construída
        urlForReference = imageUrl; // Manter a URL construída para busca
        console.log(`🔍 ImagePreview - Usando URL construída para busca: ${urlForReference}`);
        console.log(`🔍 ImagePreview - FileId disponível: ${fileId}`);
      } else if (imageUrl.startsWith('http')) {
        // Se temos URL completa, usar ela diretamente
        console.log(`🔍 ImagePreview - Usando URL direta: ${urlForReference}`);
      }
      
      onImageReference(urlForReference, `Análise da imagem: ${filename}`, fileId);
      toast.success('Imagem referenciada para próxima mensagem');
    }
  };

  // 🔧 NOVO: Pré-carregar imagem completa quando modal abre
  const handleDialogOpen = () => {
    setIsExpanded(true);
    if (!fullImageLoaded) {
      const fullUrl = getFullImageUrl();
      const img = new Image();
      img.onload = () => {
        setFullImageLoaded(true);
        console.log(`✅ Imagem completa pré-carregada: ${filename}`);
      };
      img.onerror = () => {
        console.error(`❌ Erro ao pré-carregar: ${filename}`);
        setFullImageLoaded(true); // Marcar como "carregado" mesmo com erro
      };
      img.src = fullUrl;
    }
  };

  return (
    <>
      <div className="inline-flex items-center gap-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-3 my-2 max-w-sm">
        {/* Thumbnail da imagem */}
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 bg-slate-200 dark:bg-slate-600 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
            {isLoading && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            
            {!hasError ? (
              <img
                src={displayUrl}
                alt={filename}
                className={`w-full h-full object-cover cursor-pointer transition-opacity ${
                  isLoading ? 'opacity-0' : 'opacity-100'
                }`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                onClick={handleDialogOpen}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-700">
                <ImageIcon className="w-6 h-6 text-slate-400" />
              </div>
            )}
          </div>
        </div>

        {/* Informações da imagem */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <ImageIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
              {filename}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Imagem carregada
          </p>
          
          {/* Botões de ação */}
          <div className="flex gap-1">
            <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDialogOpen}
                  className="h-6 px-2 text-xs hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Ver
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] p-0">
                <DialogHeader className="p-4 border-b">
                  <DialogTitle className="text-lg font-semibold truncate pr-4">
                    {filename}
                  </DialogTitle>
                  <DialogDescription>
                    Visualização da imagem em tamanho completo
                  </DialogDescription>
                </DialogHeader>
                
                {/* Área da imagem com loading */}
                <div className="p-4 flex justify-center items-center min-h-[400px] max-h-[calc(90vh-160px)] overflow-auto">
                  {!fullImageLoaded ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Carregando imagem...</span>
                    </div>
                  ) : (
                    <img
                      src={getFullImageUrl()}
                      alt={filename}
                      className="max-w-full max-h-full object-contain rounded"
                      style={{ maxHeight: 'calc(90vh - 200px)' }}
                    />
                  )}
                </div>
                
                {/* Footer com botões */}
                <div className="p-4 border-t bg-muted/30">
                  <div className="flex gap-3 justify-center flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          // 🔧 BUSCAR URL REAL DO STORAGE usando nova API
                          let urlToCopy = imageUrl;
                          
                          // Se for uma URL da API interna, buscar a URL real do MinIO
                          if (imageUrl.includes('/api/chatwitia/files/')) {
                            try {
                              // Extrair o fileId da URL
                              const fileIdMatch = imageUrl.match(/\/files\/([^\/]+)\//);
                              if (fileIdMatch) {
                                const extractedFileId = fileIdMatch[1];
                                const response = await fetch(`/api/chatwitia/files/${extractedFileId}/storage-url`);
                                if (response.ok) {
                                  const data = await response.json();
                                  urlToCopy = data.storageUrl || imageUrl;
                                  console.log('📋 URL do storage obtida:', urlToCopy);
                                } else {
                                  console.warn('⚠️ Não foi possível obter URL do storage, usando URL da API');
                                  urlToCopy = `${window.location.origin}${imageUrl}`;
                                }
                              }
                            } catch (error) {
                              console.error('❌ Erro ao buscar URL do storage:', error);
                              urlToCopy = `${window.location.origin}${imageUrl}`;
                            }
                          } else if (imageUrl.startsWith('/')) {
                            // URL relativa, adicionar domínio
                            urlToCopy = `${window.location.origin}${imageUrl}`;
                          }
                          
                          await navigator.clipboard.writeText(urlToCopy);
                          toast.success('URL copiada!');
                        } catch (error) {
                          toast.error('Erro ao copiar URL');
                        }
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar URL
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch(getFullImageUrl());
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = filename;
                          a.click();
                          window.URL.revokeObjectURL(url);
                          toast.success('Download iniciado!');
                        } catch (error) {
                          toast.error('Erro ao baixar imagem');
                        }
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar
                    </Button>
                    
                    {onImageReference && (
                      <Button
                        size="sm"
                        onClick={() => {
                          handleReference();
                          setIsExpanded(false);
                        }}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Analisar esta imagem
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {onImageReference && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReference}
                    className="h-6 px-2 text-xs hover:bg-slate-200 dark:hover:bg-slate-600"
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Analisar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Referenciar para análise</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </>
  );
});

const GeneratedImage: React.FC<{ 
  src: string; 
  alt: string; 
  prompt?: string; 
  onAspectRatioDetected?: (aspectRatio: string) => void;
  sharedAspectRatio?: string;
  isProgress?: boolean;
  onReference?: (imageUrl: string, prompt?: string, openaiFileId?: string) => void;
}> = React.memo(({ 
  src, 
  alt, 
  prompt,
  onAspectRatioDetected,
  sharedAspectRatio = '1 / 1',
  isProgress = false,
  onReference
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<string>('1 / 1');

  // Estado para o pré-carregamento
  const [displaySrc, setDisplaySrc] = useState(src);
  const [isPreloading, setIsPreloading] = useState(false);
  
  // Usar aspecto detectado ou compartilhado
  const aspectRatio = naturalAspectRatio !== '1 / 1' ? naturalAspectRatio : sharedAspectRatio;

  // Efeito para pré-carregar quando src muda (mas não na primeira renderização)
  useEffect(() => {
    if (displaySrc !== src) {
      setIsPreloading(true);
      
      const preloadImg = new Image();
      preloadImg.onload = () => {
        setDisplaySrc(src);
        setIsPreloading(false);
      };
      preloadImg.onerror = () => {
        console.error(`Erro ao pré-carregar nova imagem: ${src}`);
        setIsPreloading(false);
      };
      preloadImg.src = src;
    }
  }, [src, displaySrc]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    const aspectRatioString = `${aspectRatio.toFixed(3)} / 1`;
    setNaturalAspectRatio(aspectRatioString);
    setIsLoading(false);
    
    if (onAspectRatioDetected) {
      onAspectRatioDetected(aspectRatioString);
    }
    
    console.log(`🖼️ Imagem carregada com sucesso - Dimensões: ${img.naturalWidth}x${img.naturalHeight}, Aspect Ratio: ${aspectRatio.toFixed(3)}`);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error(`❌ Erro ao carregar imagem: ${src}`);
    setIsLoading(false);
    
    // Se for uma thumbnail que falhou, tentar a URL original
    const img = e.currentTarget;
    if (src.includes('_thumb.') && src !== displaySrc) {
      console.log(`🔄 Tentando URL original após falha da thumbnail`);
      const originalUrl = src.replace(/_thumb\.(jpg|jpeg|png|webp)/, '.$1');
      setDisplaySrc(originalUrl);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(displaySrc);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `imagem-gerada-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Imagem baixada com sucesso!');
    } catch (error) {
      console.error('Erro ao baixar imagem:', error);
      toast.error('Erro ao baixar imagem');
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(displaySrc);
      toast.success('URL da imagem copiada!');
    } catch (error) {
      console.error('Erro ao copiar URL:', error);
      toast.error('Erro ao copiar URL');
    }
  };

  const handleReference = () => {
    if (onReference) {
      onReference(displaySrc, prompt || alt, undefined);
      toast.success('Imagem referenciada para próxima mensagem');
    }
  };

  // 🔧 NOVA FUNÇÃO: Obter URL completa para cópia (com domínio)
  const getFullUrlForCopy = () => {
    // Se é uma URL relativa da API, adicionar o domínio
    if (displaySrc.startsWith('/api/')) {
      return `${window.location.origin}${displaySrc}`;
    }
    
    // Se já é uma URL completa, retornar como está
    return displaySrc;
  };

  // Key estável baseada no src original para evitar re-mount
  const stableKey = `image-${src}`;

  return (
    <>
      <div 
        key={stableKey}
        className="relative group my-4 w-full max-w-2xl mx-auto"
      >
        {/* Container da imagem com aspect ratio dinâmico */}
        <div 
          className={`
            relative overflow-hidden rounded-xl bg-muted border border-border
            transition-all duration-200 hover:shadow-md
            ${isProgress ? 'opacity-75' : 'opacity-100'}
          `}
          style={{ aspectRatio }}
        >
          {/* Indicador de carregamento/progresso */}
          {(isLoading || isPreloading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-muted-foreground">
                  {isProgress ? 'Gerando...' : isPreloading ? 'Atualizando...' : 'Carregando...'}
                </span>
              </div>
            </div>
          )}
          
          {/* Imagem */}
          <img
            src={displaySrc}
            alt={alt}
            className={`
              w-full h-full object-cover cursor-pointer
              transition-all duration-200
              ${isLoading || isPreloading ? 'opacity-0' : 'opacity-100'}
              group-hover:scale-[1.02]
            `}
            onLoad={handleImageLoad}
            onError={handleImageError}
            onClick={() => setIsExpanded(true)}
          />
          
          {/* Overlay com botões (aparece no hover) */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="flex gap-2">
              <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
                <DialogTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(true);
                    }}
                    className="bg-white/90 hover:bg-white text-black"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[95vh] p-0">
                  <DialogHeader className="p-4 border-b">
                    <DialogTitle className="text-lg font-semibold truncate pr-4">
                      {alt}
                    </DialogTitle>
                    <DialogDescription>
                      Visualização da imagem gerada em tamanho completo
                    </DialogDescription>
                  </DialogHeader>
                  
                  {/* Área da imagem */}
                  <div className="p-4 flex justify-center items-center min-h-[500px] max-h-[calc(95vh-160px)] overflow-auto">
                    <img
                      src={displaySrc}
                      alt={alt}
                      className="max-w-full max-h-full object-contain rounded"
                      style={{ maxHeight: 'calc(95vh - 200px)' }}
                    />
                  </div>
                  
                  {/* Footer com botões */}
                  <div className="p-4 border-t bg-muted/30">
                    <div className="flex gap-3 justify-center flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            // 🔧 BUSCAR URL REAL DO STORAGE usando nova API
                            let urlToCopy = displaySrc;
                            
                            // Se for uma URL da API interna, buscar a URL real do MinIO
                            if (displaySrc.includes('/api/chatwitia/files/')) {
                              try {
                                // Extrair o fileId da URL
                                const fileIdMatch = displaySrc.match(/\/files\/([^\/]+)\//);
                                if (fileIdMatch) {
                                  const extractedFileId = fileIdMatch[1];
                                  const response = await fetch(`/api/chatwitia/files/${extractedFileId}/storage-url`);
                                  if (response.ok) {
                                    const data = await response.json();
                                    urlToCopy = data.storageUrl || displaySrc;
                                    console.log('📋 URL do storage obtida:', urlToCopy);
                                  } else {
                                    console.warn('⚠️ Não foi possível obter URL do storage, usando URL da API');
                                    urlToCopy = `${window.location.origin}${displaySrc}`;
                                  }
                                }
                              } catch (error) {
                                console.error('❌ Erro ao buscar URL do storage:', error);
                                urlToCopy = `${window.location.origin}${displaySrc}`;
                              }
                            } else if (displaySrc.startsWith('/')) {
                              // URL relativa, adicionar domínio
                              urlToCopy = `${window.location.origin}${displaySrc}`;
                            }
                            
                            await navigator.clipboard.writeText(urlToCopy);
                            toast.success('URL copiada!');
                          } catch (error) {
                            toast.error('Erro ao copiar URL');
                          }
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar URL
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar
                      </Button>
                      
                      {onReference && (
                        <Button
                          size="sm"
                          onClick={() => {
                            handleReference();
                            setIsExpanded(false);
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Analisar esta imagem
                        </Button>
                      )}
                    </div>
                    
                    {/* Prompt da imagem se disponível */}
                    {prompt && (
                      <div className="mt-3 pt-3 border-t text-sm text-muted-foreground text-center">
                        <strong>Prompt:</strong> {prompt}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload();
                    }}
                    className="bg-white/90 hover:bg-white text-black"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Baixar imagem</TooltipContent>
              </Tooltip>
              
              {onReference && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReference();
                      }}
                      className="bg-white/90 hover:bg-white text-black"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Referenciar imagem</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        
        {/* Caption com prompt se disponível */}
        {prompt && !isProgress && (
          <div className="mt-2 text-sm text-muted-foreground text-center px-4">
            {prompt}
          </div>
        )}
      </div>
    </>
  );
});

// Tipos para as partes do conteúdo
type ContentPart = {
  type: 'text' | 'image' | 'image_preview';
  content?: string;
  alt?: string;
  src?: string;
  filename?: string;
  imageUrl?: string;
  prompt?: string;
  isProgress?: boolean;
  fileId?: string;
};

export default React.memo(function MessageContent({ content, isStreaming = false, onImageReference }: Props) {
  // 🔧 NOVA LÓGICA: Detectar tipos de arquivo baseado no nome e file_id
  const detectFileType = (filename: string, fileId: string): 'image' | 'pdf' | 'other' => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    const pdfExtensions = ['.pdf'];
    
    const lowerFilename = filename.toLowerCase();
    
    if (imageExtensions.some(ext => lowerFilename.includes(ext))) {
      return 'image';
    }
    if (pdfExtensions.some(ext => lowerFilename.includes(ext))) {
      return 'pdf';
    }
    return 'other';
  };

  // 🔧 NOVA LÓGICA: Detectar diferentes tipos de arquivos anexados
  const hasImageReference = content.includes('[') && content.includes('](file_id:') && 
    /\[([^\]]*\.(png|jpg|jpeg|gif|webp|bmp|svg)[^\]]*)\]\(file_id:/i.test(content);
  const hasPdfReference = content.includes('[') && content.includes('](file_id:') && 
    /\[([^\]]*\.pdf[^\]]*)\]\(file_id:/i.test(content);
  const hasOtherFileReference = content.includes('[') && content.includes('](file_id:') && 
    !hasImageReference && !hasPdfReference;

  // Processar conteúdo para extrair imagens geradas, previews de imagem e arquivos - usar useMemo para evitar re-computações
  const contentParts = useMemo((): ContentPart[] => {
    // Log inicial para debug
    console.log('🔍 MessageContent - Processando conteúdo:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
    
    // Regex para detectar imagens markdown ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)\)/g;
    
    // 🔧 NOVA REGEX: Detectar file_id com URLs de imagem para preview
    const imageFileIdRegex = /\[([^\]]+)\]\(file_id:(https?:\/\/[^\s)]+)\)/g;
    
    // 🔧 NOVA REGEX: Detectar referências de arquivos via file_id
    const fileIdRegex = /\[([^\]]+)\]\(file_id:([^)]+)\)/g;
    
    const parts: ContentPart[] = [];
    const processedContent = content;
    let lastIndex = 0;

    // Log apenas se houver mudança no conteúdo
    const hasImages = content.includes('![');
    const hasImagePreviews = content.includes('[') && content.includes('](file_id:http');
    const hasFileReferences = content.includes('[') && content.includes('](file_id:');
    
    console.log('🔍 MessageContent - Detecções iniciais:', {
      hasImages,
      hasImagePreviews, 
      hasFileReferences,
      contentLength: content.length
    });
    
    // 1. Primeiro processar previews de imagem (file_id com URLs diretas)
    let match;
    while ((match = imageFileIdRegex.exec(processedContent)) !== null) {
      console.log('🖼️ Encontrou imageFileId:', match[1], '→', match[2]);
      
      // Adicionar texto antes do preview
      if (match.index > lastIndex) {
        const textBefore = processedContent.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({
            type: 'text',
            content: textBefore
          });
        }
      }

      const filename = match[1] || 'Imagem';
      const imageUrl = match[2] || '';

      // Adicionar preview de imagem
      parts.push({
        type: 'image_preview',
        filename: filename,
        imageUrl: imageUrl
      });

      lastIndex = match.index + match[0].length;
    }

    // 2. Processar referências de arquivos via file_id (novos uploads)
    const remainingContent = processedContent.slice(lastIndex);
    lastIndex = 0;
    
    while ((match = fileIdRegex.exec(remainingContent)) !== null) {
      const filename = match[1] || 'Arquivo';
      const fileId = match[2] || '';
      const fileType = detectFileType(filename, fileId);
      
      console.log('📁 Encontrou fileId:', filename, '→', fileId, 'tipo:', fileType);
      
      // Adicionar texto antes do arquivo
      if (match.index > lastIndex) {
        const textBefore = remainingContent.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({
            type: 'text',
            content: textBefore
          });
        }
      }

      // 🔧 NOVA LÓGICA: Renderizar baseado no tipo de arquivo
      if (fileType === 'image') {
        // Para imagens, criar um preview especial
        console.log('🖼️ Criando preview para imagem:', filename);
        parts.push({
          type: 'image_preview',
          filename: filename,
          imageUrl: fileId.startsWith('http') ? fileId : `/api/chatwitia/files/${fileId}/content`,
          fileId: fileId
        });
      } else {
        // Para PDFs e outros arquivos, manter como referência textual
        console.log('📄 Mantendo como texto para arquivo:', filename, 'tipo:', fileType);
        parts.push({
          type: 'text',
          content: `**[ARQUIVO: ${filename}]**`
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // 3. Processar imagens markdown no conteúdo restante
    const finalRemainingContent = remainingContent.slice(lastIndex);
    lastIndex = 0;
    
    while ((match = imageRegex.exec(finalRemainingContent)) !== null) {
      // Adicionar texto antes da imagem
      if (match.index > lastIndex) {
        const textBefore = finalRemainingContent.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({
            type: 'text',
            content: textBefore
          });
        }
      }

      // Determinar se é uma imagem parcial/progresso
      const alt = match[1] || 'Imagem gerada';
      const src = match[2] || '';
      const isProgress = alt.includes('Gerando imagem') || alt.includes('sendo gerada');

      // Adicionar imagem
      parts.push({
        type: 'image',
        alt: alt,
        src: src,
        prompt: alt && alt.includes('Imagem gerada') && !isProgress ? alt : undefined,
        isProgress: isProgress
      });

      lastIndex = match.index + match[0].length;
    }

    // Adicionar texto restante
    const finalText = finalRemainingContent.slice(lastIndex).trim();
    if (finalText) {
      parts.push({
        type: 'text',
        content: finalText
      });
    }

    // Se não há partes específicas, usar o conteúdo como texto
    const result = parts.length > 0 ? parts : [{ type: 'text' as const, content: content }];
    
    // Log apenas se houver arquivos processados
    if (hasImages || hasImagePreviews || hasFileReferences || result.filter(p => p.type === 'image' || p.type === 'image_preview').length > 0) {
      console.log('📊 MessageContent - Final processed parts:', result.length, 'parts');
      console.log('🖼️ MessageContent - Image parts:', result.filter(p => p.type === 'image').length);
      console.log('🖼️ MessageContent - Image preview parts:', result.filter(p => p.type === 'image_preview').length);
      console.log('📄 MessageContent - File references found:', hasFileReferences);
    }
    
    return result;
  }, [content]);

  const proseClass = useMemo(() => 
    "prose prose-gemini dark:prose-invert max-w-none break-words " +
    "w-full min-w-0 overflow-wrap-anywhere " +
    (isStreaming ? "stream-content" : "stream-complete")
  , [isStreaming]);

  return (
    <div className={`${proseClass} w-full min-w-0`} style={{ 
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap'
    }}>
      {/* 🔧 ATUALIZADO: Mostrar indicador baseado no tipo de arquivo */}
      {hasPdfReference && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md mb-3">
          <FileIcon size={18} className="text-blue-500" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Arquivo PDF anexado à mensagem
          </span>
        </div>
      )}

      {hasImageReference && (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md mb-3">
          <ImageIcon size={18} className="text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">
            Imagem anexada à mensagem
          </span>
        </div>
      )}

      {hasOtherFileReference && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-md mb-3">
          <FileIcon size={18} className="text-gray-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Arquivo anexado à mensagem
          </span>
        </div>
      )}

      {contentParts.map((part, index) => {
        if (part.type === 'image' && part.src && part.alt) {
          return (
            <GeneratedImage
              key={`generated-${index}-${part.src}`}
              src={part.src}
              alt={part.alt}
              prompt={part.prompt}
              isProgress={part.isProgress}
              onReference={onImageReference}
            />
          );
        } else if (part.type === 'image_preview' && part.imageUrl && part.filename) {
          return (
            <ImagePreview
              key={`preview-${index}-${part.imageUrl}`}
              imageUrl={part.imageUrl}
              filename={part.filename}
              fileId={part.fileId}
              onImageReference={onImageReference}
            />
          );
        } else if (part.type === 'text' && part.content) {
          // 🔧 ATUALIZADO: Não remover referências de arquivo, já processadas acima
          const textContent = part.content
            .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, ''); // Remove apenas imagens markdown já processadas
          
          if (!textContent.trim()) return null;

          return (
            <div key={index} className="w-full min-w-0" style={{ 
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap'
            }}>
              <ReactMarkdown
                // --------- plugins ----------
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
                // --------- componentes customizados ----------
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <CodeBlock
                        key={Math.random()}
                        language={match[1]}
                        value={String(children).replace(/\n$/, '')}
                        {...props}
                      />
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {textContent}
              </ReactMarkdown>
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
});
