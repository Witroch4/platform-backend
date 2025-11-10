"use client";

import { TableCell } from "@/components/ui/table";
import type { FileCellProps } from "../types";
import { getFileTypeIcon, openExternalUrl } from "../utils";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { DeleteFileButton } from "@/app/admin/leads-chatwit/components/delete-file-button";
import { FileText, File, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface FilesCellProps extends FileCellProps {
  onContextMenuAction: (action: ContextAction, data?: any) => void;
  onDeleteFile: (fileId: string, type: "arquivo" | "pdf" | "imagem") => Promise<void>;
  onReloadAfterDelete: () => void;
}

export function FilesCell({ 
  lead, 
  onContextMenuAction,
  onDeleteFile,
  onReloadAfterDelete 
}: FilesCellProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renderIcon = (fileType: string) => {
    const iconData = getFileTypeIcon(fileType);
    
    if (iconData.icon === "Image") {
      return (
        <img 
          src="/imagicon.svg" 
          alt="Imagem" 
          className="w-full h-full object-contain"
        />
      );
    }
    
    const IconComponent = iconData.icon === "FileText" ? FileText : File;
    return <IconComponent className="w-full h-full" />;
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('leadId', lead.id);
      
      // Adicionar todos os arquivos ao FormData
      Array.from(files).forEach((file) => {
        formData.append('files', file);
      });

      const uploadPromise = fetch('/api/admin/leads-chatwit/upload-files', {
        method: 'POST',
        body: formData,
      }).then(async (response) => {
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Erro ao fazer upload');
        }
        return response.json();
      });

      toast.promise(uploadPromise, {
        loading: `Enviando ${files.length} arquivo(s)...`,
        success: (data) => {
          onReloadAfterDelete(); // Recarregar os dados
          return `${data.files.length} arquivo(s) enviado(s) com sucesso`;
        },
        error: (err) => err.message || 'Erro ao fazer upload',
      });

      await uploadPromise;
    } catch (error) {
      console.error('[FilesCell] Erro ao fazer upload:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    handleFileUpload(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files);
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <TableCell className="min-w-[100px] max-w-[150px] p-2 align-middle">
      <div 
        className={`grid grid-cols-3 gap-2 ${
          lead.arquivos.length === 0 
            ? 'border-2 border-dashed rounded-lg p-4 transition-colors ' + 
              (isDragging 
                ? 'border-primary bg-primary/10' 
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50')
            : ''
        }`}
        onDragOver={lead.arquivos.length === 0 ? handleDragOver : undefined}
        onDragLeave={lead.arquivos.length === 0 ? handleDragLeave : undefined}
        onDrop={lead.arquivos.length === 0 ? handleDrop : undefined}
      >
        {lead.arquivos.length > 0 ? (
          lead.arquivos.map((arquivo) => (
            <LeadContextMenu
              key={arquivo.id}
              contextType="arquivo"
              onAction={onContextMenuAction}
              data={{ id: arquivo.id, type: "arquivo" }}
            >
              <div 
                className="relative hover:bg-accent hover:text-accent-foreground w-[36px] h-[36px] flex items-center justify-center group cursor-pointer"
                onClick={() => openExternalUrl(arquivo.dataUrl)}
              >
                {renderIcon(arquivo.fileType)}
                <DeleteFileButton 
                  onDelete={() => onDeleteFile(arquivo.id, "arquivo")}
                  fileType="arquivo"
                  fileName={arquivo.fileType}
                  onSuccess={onReloadAfterDelete}
                />
              </div>
            </LeadContextMenu>
          ))
        ) : (
          <div className="col-span-3 flex flex-col items-center justify-center gap-2 min-h-[80px]">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={isUploading}
            />
            
            <Upload className="h-6 w-6 text-muted-foreground" />
            
            <p className="text-xs text-muted-foreground text-center">
              {isUploading ? 'Enviando...' : 'Arraste arquivos ou'}
            </p>
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClickUpload}
              disabled={isUploading}
              className="h-7 text-xs"
            >
              Escolher arquivos
            </Button>
          </div>
        )}
      </div>
    </TableCell>
  );
} 