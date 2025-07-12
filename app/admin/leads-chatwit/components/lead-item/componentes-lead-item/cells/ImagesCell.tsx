import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw } from "lucide-react";
import { ImagesCellProps } from "../types";
import { LeadContextMenu, ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { DeleteFileButton } from "@/app/admin/leads-chatwit/components/delete-file-button";

interface ImagesCellExtendedProps extends Omit<ImagesCellProps, 'onConverter'> {
  onConverter: () => void;
  onContextMenuAction: (action: ContextAction, data?: any) => void;
  onDeleteFile: (fileId: string, type: "arquivo" | "pdf" | "imagem") => Promise<void>;
  onReloadAfterDelete: () => void;
  onShowGallery: () => void;
}

export function ImagesCell({ 
  lead, 
  onConverter, 
  isConverting,
  onContextMenuAction,
  onDeleteFile,
  onReloadAfterDelete,
  onShowGallery
}: ImagesCellExtendedProps) {
  // Só mostra se tem PDF unificado
  if (!lead.pdfUnificado) {
    return <TableCell className="min-w-[70px] max-w-[100px] p-2 align-middle"></TableCell>;
  }

  // Se já tem imagens convertidas
  if (lead.arquivos.some(a => a.pdfConvertido)) {
    return (
      <TableCell className="min-w-[70px] max-w-[100px] p-2 align-middle">
        <LeadContextMenu
          contextType="imagem"
          onAction={onContextMenuAction}
          data={{ id: lead.id, type: "imagem" }}
        >
          <div 
            className="relative hover:bg-accent hover:text-accent-foreground flex items-center w-[60px] h-[60px] justify-center group mx-auto cursor-pointer"
            onClick={onShowGallery}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <img 
                    src="/unifyimage.svg" 
                    alt="Imagens" 
                    className="w-full h-full object-contain"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>PDF Convertido em Imagens</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DeleteFileButton 
              onDelete={() => onDeleteFile(lead.id, "imagem")}
              fileType="imagem"
              onSuccess={onReloadAfterDelete}
            />
          </div>
        </LeadContextMenu>
      </TableCell>
    );
  }

  // Botão para converter
  return (
    <TableCell className="min-w-[70px] max-w-[100px] p-2 align-middle">
      <Button
        variant="outline"
        size="sm"
        onClick={onConverter}
        disabled={isConverting === lead.id}
        className="w-full text-xs px-2 py-1 h-auto min-h-8"
      >
        <RefreshCw className={`h-4 w-4 mr-1 ${isConverting === lead.id ? "animate-spin" : ""}`} />
        Converter
      </Button>
    </TableCell>
  );
} 