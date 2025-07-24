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
  ExternalLink,
  File as FileIcon
} from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface MinIOMediaFile {
  id: string;
  file?: File;
  progress: number;
  status: 'uploading' | 'success' | 'error' | 'waiting';
  url?: string; // URL do MinIO
  mime_type?: string;
  error?: string;
}

interface MinIOMediaUploadProps {
  uploadedFiles: MinIOMediaFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<MinIOMediaFile[]>>;
  allowedTypes?: string[]; // e.g. ['video/mp4', 'image/jpeg']
  maxSizeMB?: number;
  title?: string;
  description?: string;
  maxFiles?: number;
  onUploadComplete?: (file: MinIOMediaFile) => void;
}

export default function MinIOMediaUpload({
  uploadedFiles,
  setUploadedFiles,
  allowedTypes = ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/jpg'],
  maxSizeMB = 16,
  title = "Upload para MinIO",
  description = "Faça upload de mídia para armazenamento",
  maxFiles = 1,
  onUploadComplete,
}: MinIOMediaUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  
  // Log mudanças nos arquivos para debug
  useEffect(() => {
    console.log('[MinIOMediaUpload] Estado dos arquivos atualizado:', uploadedFiles);
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
      const newFiles: MinIOMediaFile[] = filesToAdd.map(file => ({
        id: Math.random().toString(36).substring(2, 11),
        file,
        progress: 0,
        status: 'waiting',
        mime_type: file.type,
      }));

      setUploadedFiles(prev => [...prev, ...newFiles]);

      // Iniciar upload automaticamente
      for (const fileData of newFiles) {
        uploadFileToMinIO(fileData);
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
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: maxFiles - uploadedFiles.length,
    maxSize: maxSizeMB * 1024 * 1024,
    disabled: isUploading || uploadedFiles.length >= maxFiles,
  });

  // Função para fazer upload do arquivo apenas para o MinIO
  const uploadFileToMinIO = async (fileData: MinIOMediaFile) => {
    if (!fileData.file) return;
    
    setIsUploading(true);
    
    // Atualizar status para uploading
    setUploadedFiles(prev => 
      prev.map(f => f.id === fileData.id ? { ...f, status: 'uploading' } : f)
    );

    try {
      const formData = new FormData();
      formData.append("file", fileData.file);
      formData.append("destination", "minio"); // Apenas MinIO
      
      const response = await axios.post("/api/upload-media", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded / (progressEvent.total ?? 0)) * 100
          );

          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === fileData.id ? { ...f, progress } : f
            )
          );
        },
      });
      
      if (!response.data.success) {
        throw new Error("Falha ao fazer upload para MinIO: " + response.data.error);
      }
      
      // Arquivo enviado com sucesso para o MinIO
      const minioUrl = response.data.url;
      console.log(`[MinIOMediaUpload] URL do MinIO obtida: ${minioUrl}`);
      
      const updatedFile = {
        ...fileData,
        progress: 100,
        status: 'success' as const,
        url: minioUrl,
        mime_type: fileData.file.type,
      };
      
      // Atualizar estado com o arquivo atualizado
      setUploadedFiles(prev => {
        console.log(`[MinIOMediaUpload] Atualizando arquivos após upload para MinIO`);
        console.log(`[MinIOMediaUpload] Arquivo atual:`, prev.find(f => f.id === fileData.id));
        console.log(`[MinIOMediaUpload] Novo arquivo:`, updatedFile);
        
        const newFiles = prev.map(f => 
          f.id === fileData.id ? {...updatedFile} : {...f}
        );
        
        // Propagar mudança para o componente pai
        if (onUploadComplete) {
          console.log(`[MinIOMediaUpload] Notificando componente pai sobre upload concluído`);
          console.log(`[MinIOMediaUpload] URL do MinIO: ${minioUrl}`);
          
          setTimeout(() => {
            onUploadComplete(updatedFile);
          }, 100);
        }
        
        return newFiles;
      });

      console.log(`[MinIOMediaUpload] Upload completo: ${fileData.file.name}`);
      console.log(`[MinIOMediaUpload] URL MinIO: ${minioUrl}`);
      
      toast.success(`Upload completo: ${fileData.file.name}`);
    } catch (error: any) {
      console.error(`Erro ao fazer upload para MinIO: ${fileData.file.name}`, error);
      
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
        description: error.message || "Não foi possível completar o upload para o MinIO",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground mb-2">{description}</p>
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
              <span className="font-semibold">Arraste arquivos para upload</span>
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
                        ) : file.mime_type?.includes("application") ? (
                          <FileIcon className="h-10 w-10 text-red-500" />
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
                            <span className="text-muted-foreground">Enviando...</span>
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
                              Upload concluído
                            </span>
                          </div>
                          {file.url && (
                            <div className="mt-1 flex items-center">
                              <a 
                                href={file.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-500 hover:underline flex items-center"
                              >
                                <span>Visualizar arquivo</span>
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