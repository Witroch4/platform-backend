"use client";

import axios from "axios";
import {
  Video,
  Image as ImageIcon,
  FileImage,
  UploadCloud,
  X,
  Check,
  Loader2,
  ExternalLink
} from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface MetaMediaFile {
  id: string;
  file?: File;
  progress: number;
  status: 'uploading' | 'success' | 'error' | 'waiting';
  url?: string; // URL original (MinIO)
  mediaHandle?: string; // Handle da API Meta
  mime_type?: string;
  error?: string;
}

interface MetaMediaUploadProps {
  uploadedFiles: MetaMediaFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<MetaMediaFile[]>>;
  allowedTypes?: string[]; // e.g. ['video/mp4', 'image/jpeg']
  maxSizeMB?: number;
  title?: string;
  description?: string;
  maxFiles?: number;
  onUploadComplete?: (mediaHandle: string, file: MetaMediaFile) => void;
}

export default function MetaMediaUpload({
  uploadedFiles,
  setUploadedFiles,
  allowedTypes = ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/jpg'],
  maxSizeMB = 16,
  title = "Upload para API Meta",
  description = "Faça upload de mídia para a API Meta (vídeos, imagens)",
  maxFiles = 1,
  onUploadComplete,
}: MetaMediaUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  
  // Log mudanças nos arquivos para debug
  useEffect(() => {
    console.log('[MetaMediaUpload] Estado dos arquivos atualizado:', uploadedFiles);
    
    // Verificar se algum arquivo tem URL e mediaHandle válidos
    const validFiles = uploadedFiles.filter(f => f.url && f.mediaHandle);
    console.log('[MetaMediaUpload] Arquivos válidos para template:', validFiles);
    
    // Log de estado para depuração
    if (uploadedFiles.length > 0) {
      localStorage.setItem('debug_uploadedFiles', JSON.stringify(uploadedFiles));
    }
  }, [uploadedFiles]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      // Verificar se já temos arquivos suficientes
      if (uploadedFiles.length >= maxFiles) {
        toast.error(`Máximo de ${maxFiles} arquivos permitidos`);
        return;
      }

      // Verificar tamanho e tipo dos arquivos
      const validFiles = acceptedFiles.filter(file => {
        // Verificar tamanho
        if (file.size > maxSizeMB * 1024 * 1024) {
          toast.error(`Arquivo ${file.name} excede o tamanho máximo de ${maxSizeMB}MB`);
          return false;
        }

        // Verificar tipo
        if (!allowedTypes.includes(file.type)) {
          toast.error(`Tipo de arquivo não permitido: ${file.type}`);
          return false;
        }

        return true;
      });

      // Se não há arquivos válidos, retornar
      if (validFiles.length === 0) return;

      // Se há limites, verificar quantos arquivos ainda podemos adicionar
      const remainingSlots = maxFiles - uploadedFiles.length;
      const filesToAdd = validFiles.slice(0, remainingSlots);

      // Adicionar arquivos à lista
      const newFiles: MetaMediaFile[] = filesToAdd.map(file => ({
        id: Math.random().toString(36).substring(2, 11),
        file,
        progress: 0,
        status: 'waiting',
        mime_type: file.type,
      }));

      setUploadedFiles(prev => [...prev, ...newFiles]);

      // Iniciar upload automaticamente
      for (const fileData of newFiles) {
        uploadFileToMetaApi(fileData);
      }
    },
    [uploadedFiles, maxFiles, maxSizeMB, allowedTypes, setUploadedFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxFiles: maxFiles - uploadedFiles.length,
    maxSize: maxSizeMB * 1024 * 1024,
    disabled: isUploading || uploadedFiles.length >= maxFiles,
  });

  // Função para fazer upload de uma URL existente do MinIO para a API Meta
  const uploadExistingUrlToMeta = async (url: string, mimeType: string) => {
    if (!url) return;
    
    // Criar um novo arquivo na lista
    const newFile: MetaMediaFile = {
      id: Math.random().toString(36).substring(2, 11),
      progress: 0,
      status: 'uploading',
      url,
      mime_type: mimeType,
    };
    
    setUploadedFiles(prev => [...prev, newFile]);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("fileUrl", url);
      formData.append("mimeType", mimeType);
      formData.append("destination", "meta");

      const response = await axios.post("/api/upload-media", formData);

      if (response.data && response.data.success) {
        const updatedFile = {
          ...newFile,
          progress: 100,
          status: 'success' as const,
          mediaHandle: response.data.mediaHandle,
          url: newFile.url, // Manter a URL original para exibição
        };
        
        setUploadedFiles(prev => {
          // Log para debug
          console.log(`[MetaMediaUpload] Atualizando arquivo após upload da URL para Meta API`);
          console.log(`[MetaMediaUpload] Arquivo atual:`, prev.find(f => f.id === newFile.id));
          console.log(`[MetaMediaUpload] Novo arquivo:`, updatedFile);
          
          // Criar uma cópia profunda do array para evitar problemas de referência
          const newFiles = prev.map(f => 
            f.id === newFile.id 
              ? {...updatedFile} // Garantir que é uma nova referência 
              : {...f} // Criar nova referência para outros arquivos também
          );
          
          // Propagar mudança para o componente pai imediatamente
          if (onUploadComplete) {
            // Importante: Para garantir que a URL esteja acessível durante a criação do template
            console.log(`[MetaMediaUpload] Notificando componente pai sobre upload concluído`);
            console.log(`[MetaMediaUpload] URL de MinIO salva para uso futuro: ${updatedFile.url}`);
            console.log(`[MetaMediaUpload] MediaHandle: ${response.data.mediaHandle}, MinIO URL: ${updatedFile.url}`);
            
            // Usar setTimeout para garantir que o estado tenha sido atualizado antes de chamar o callback
            setTimeout(() => {
              onUploadComplete(response.data.mediaHandle, updatedFile);
            }, 100);
          }
          
          return newFiles;
        });

        toast.success("Upload da URL concluído");
      } else {
        throw new Error(response.data.error || "Erro desconhecido no upload");
      }
    } catch (error: any) {
      console.error("Erro ao fazer upload da URL para API Meta:", error);
      
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === newFile.id
            ? {
                ...f,
                progress: 0,
                status: 'error',
                error: error.message || "Erro no upload",
              }
            : f
        )
      );

      toast.error("Erro no upload da URL", {
        description: error.message || "Não foi possível completar o upload para a API Meta",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Função para fazer upload do arquivo para o endpoint de upload da API Meta
  const uploadFileToMetaApi = async (fileData: MetaMediaFile) => {
    if (!fileData.file) return;
    
    setIsUploading(true);
    
    // Atualizar status para uploading
    setUploadedFiles(prev => 
      prev.map(f => f.id === fileData.id ? { ...f, status: 'uploading' } : f)
    );

    try {
      // Primeiro, fazer upload para o MinIO para obter a URL para preview
      const fileBuffer = await fileData.file.arrayBuffer();
      const formDataMinIO = new FormData();
      formDataMinIO.append("file", fileData.file);
      formDataMinIO.append("destination", "minio");
      
      const minioResponse = await axios.post("/api/upload-media", formDataMinIO, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded / (progressEvent.total ?? 0)) * 50
          ); // Metade do progresso total para o upload no MinIO

          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === fileData.id ? { ...f, progress } : f
            )
          );
        },
      });
      
      if (!minioResponse.data.success) {
        throw new Error("Falha ao fazer upload para MinIO: " + minioResponse.data.error);
      }
      
      // Agora temos a URL do MinIO para preview
      const minioUrl = minioResponse.data.url;
      console.log(`[MetaMediaUpload] URL do MinIO obtida: ${minioUrl}`);
      
      // Atualizar o arquivo com a URL do MinIO
      // Importante: Guardar uma cópia da URL aqui para evitar perda
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileData.id ? { ...f, url: minioUrl, progress: 50 } : f
        )
      );
      
      // Agora enviar para a API Meta
      const formDataMeta = new FormData();
      formDataMeta.append("fileUrl", minioUrl);
      formDataMeta.append("mimeType", fileData.file.type);
      formDataMeta.append("destination", "meta");

      const metaResponse = await axios.post("/api/upload-media", formDataMeta, {
        onUploadProgress: (progressEvent) => {
          const progress = 50 + Math.round(
            (progressEvent.loaded / (progressEvent.total ?? 0)) * 50
          ); // Segunda metade do progresso (50-100%)

          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === fileData.id ? { ...f, progress } : f
            )
          );
        },
      });

      // Se o upload foi bem-sucedido
      if (metaResponse.data && metaResponse.data.success) {
        // Criar uma cópia completa do objeto para preservar seus dados
        const updatedFile = {
          ...fileData,
          progress: 100,
          status: 'success' as const,
          mediaHandle: metaResponse.data.mediaHandle,
          url: minioUrl, // Usar a URL do MinIO para exibição - importante preservar
          mime_type: fileData.file.type,
        };
        
        // Atualizar estado com o arquivo atualizado
        setUploadedFiles(prev => {
          // Log para debug
          console.log(`[MetaMediaUpload] Atualizando arquivos após upload para Meta API`);
          console.log(`[MetaMediaUpload] Arquivo atual:`, prev.find(f => f.id === fileData.id));
          console.log(`[MetaMediaUpload] Novo arquivo:`, updatedFile);
          
          // Criar uma cópia profunda do array para evitar problemas de referência
          const newFiles = prev.map(f => 
            f.id === fileData.id 
              ? {...updatedFile} // Garantir que é uma nova referência 
              : {...f} // Criar nova referência para outros arquivos também
          );

          // Fallback: garantir que a UI não fique travada em "Aguardando upload..."
          // Se algum arquivo permanecer com status 'waiting' mas já houver mediaHandle, ajustar para success
          for (const f of newFiles) {
            if (f.status !== 'success' && (f as any).mediaHandle) {
              (f as any).status = 'success';
              (f as any).progress = 100;
            }
          }
          
          // Propagar mudança para o componente pai imediatamente
          if (onUploadComplete) {
            console.log(`[MetaMediaUpload] Notificando componente pai sobre upload concluído`);
            console.log(`[MetaMediaUpload] URL de MinIO salva para uso futuro: ${minioUrl}`);
            console.log(`[MetaMediaUpload] MediaHandle: ${metaResponse.data.mediaHandle}, MinIO URL: ${minioUrl}`);
            
            // Usar setTimeout para garantir que o estado tenha sido atualizado antes de chamar o callback
            setTimeout(() => {
              onUploadComplete(metaResponse.data.mediaHandle, updatedFile);
            }, 100);
          }
          
          return newFiles;
        });

        // Registrar a URL para debug
        console.log(`[MetaMediaUpload] Upload completo: ${fileData.file.name}`);
        console.log(`[MetaMediaUpload] URL MinIO: ${minioUrl}`);
        console.log(`[MetaMediaUpload] MediaHandle: ${metaResponse.data.mediaHandle}`);
        
        toast.success(`Upload completo: ${fileData.file.name}`);
      } else {
        throw new Error(metaResponse.data.error || "Erro desconhecido no upload para Meta API");
      }
    } catch (error: any) {
      console.error(`Erro ao fazer upload para API Meta: ${fileData.file.name}`, error);
      
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileData.id
            ? {
                ...f,
                progress: 0,
                status: 'error',
                error: error.message || "Erro no upload",
              }
            : f
        )
      );

      toast.error(`Erro no upload: ${fileData.file.name}`, {
        description: error.message || "Não foi possível completar o upload para a API Meta",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const [urlToUpload, setUrlToUpload] = useState("");
  const [mimeTypeToUpload, setMimeTypeToUpload] = useState("video/mp4");

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground mb-2">{description}</p>
        </div>

        {/* URL Input para upload de arquivos existentes */}
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 mb-4">
          <h4 className="text-sm font-medium mb-2">Upload de URL existente</h4>
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <ExternalLink className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
              <Input
                type="url"
                className="pl-10"
                placeholder="URL da mídia no MinIO (ex: https://objstoreapi.witdev.com.br/...)"
                value={urlToUpload}
                onChange={(e) => setUrlToUpload(e.target.value)}
                disabled={isUploading || uploadedFiles.length >= maxFiles}
              />
            </div>
            
            <div className="flex gap-2">
              <div className="w-32">
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  value={mimeTypeToUpload}
                  onChange={(e) => setMimeTypeToUpload(e.target.value)}
                  disabled={isUploading || uploadedFiles.length >= maxFiles}
                >
                  <option value="video/mp4">Vídeo (MP4)</option>
                  <option value="image/jpeg">Imagem (JPEG)</option>
                  <option value="image/png">Imagem (PNG)</option>
                </select>
              </div>
              <Button
                onClick={() => uploadExistingUrlToMeta(urlToUpload, mimeTypeToUpload)}
                disabled={!urlToUpload || isUploading || uploadedFiles.length >= maxFiles}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Enviar para API Meta
                  </>
                )}
              </Button>
            </div>
            
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Use esta opção para enviar uma URL já existente diretamente para a API Meta.
            </p>
          </div>
        </div>

        {/* Área de Drag & Drop */}
        <div
          {...getRootProps()}
          className={`relative flex flex-col items-center justify-center w-full py-8 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-[#262626] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            isDragActive ? "border-primary bg-primary/5" : "border-gray-300"
          } ${
            isUploading || uploadedFiles.length >= maxFiles ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <Input {...getInputProps()} />
          <div className="text-center">
            <div className="border p-2 rounded-md max-w-min mx-auto">
              <UploadCloud size={24} className="text-muted-foreground" />
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold">Arraste arquivos para a API Meta</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Clique para selecionar arquivos &#40;máximo {maxSizeMB}MB&#41;
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Formatos aceitos: {allowedTypes.map(type => type.split('/')[1].toUpperCase()).join(', ')}
            </p>
          </div>
        </div>

        {/* Arquivos em upload */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Arquivos</p>
            
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex justify-between gap-2 rounded-lg overflow-hidden border border-slate-100 bg-white dark:bg-[#262626] group hover:pr-0 pr-2 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center flex-1 p-2">
                    {/* Thumbnail ou ícone */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {file.mime_type?.includes('image') && file.url ? (
                          <img
                            src={file.url}
                            alt={file.file?.name || "Imagem"}
                            className="w-12 h-12 object-cover rounded-md cursor-pointer"
                          />
                        ) : file.mime_type?.includes("video") ? (
                          <Video className="h-10 w-10 text-blue-500" />
                        ) : file.mime_type?.includes("image") ? (
                          <FileImage className="h-10 w-10 text-green-500" />
                        ) : (
                          <ImageIcon className="h-10 w-10 text-gray-500" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{file.file?.name || file.url?.split("/").pop() || "Arquivo"}</p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Informações do arquivo */}
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.file?.name || file.url?.split("/").pop() || "Arquivo"}
                      </p>
                      
                      {file.status === 'uploading' && (
                        <div className="w-full space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Enviando para API Meta...</span>
                            <span>{file.progress}%</span>
                          </div>
                          <Progress 
                            value={file.progress} 
                            className={file.mime_type?.includes("video") ? "bg-blue-500" : "bg-green-500"}
                          />
                        </div>
                      )}
                      
                      {file.status === 'success' && (
                        <div className="flex flex-col text-xs text-green-500">
                          <div className="flex items-center">
                            <Check className="h-3 w-3 mr-1" />
                            <span className="truncate">
                              Processado com sucesso
                            </span>
                          </div>
                          {file.mediaHandle && (
                            <div className="text-muted-foreground">
                              <span className="font-mono text-[10px] truncate">
                                Handle: {file.mediaHandle.substring(0, 12)}...
                              </span>
                            </div>
                          )}
                          {file.url && (
                            <div className="mt-1 flex items-center">
                              <a 
                                href={file.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-500 hover:underline flex items-center"
                              >
                                <span>Visualizar {file.mime_type?.includes("video") ? "vídeo" : "imagem"}</span>
                                <ExternalLink className="h-2 w-2 ml-1" />
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {file.status === 'error' && (
                        <div className="text-xs text-red-500 truncate">
                          Erro: {file.error}
                        </div>
                      )}
                      
                      {file.status === 'waiting' && (
                        <div className="text-xs text-muted-foreground">
                          Aguardando upload...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botão de remoção */}
                  {file.status === 'uploading' ? (
                    <div className="flex items-center px-3">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      className="bg-red-500 text-white transition-all items-center justify-center cursor-pointer px-2 hidden group-hover:flex"
                      disabled={isUploading}
                      aria-label={`Remover ${file.file?.name || 'arquivo'}`}
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}