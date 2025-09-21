import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileUp } from "lucide-react";
import type { PdfCellProps } from "../types";
import { openExternalUrl } from "../utils";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { DeleteFileButton } from "@/app/admin/leads-chatwit/components/delete-file-button";

interface PdfCellExtendedProps extends Omit<PdfCellProps, 'onUnificar'> {
  onUnificar: (leadId: string) => void;
  onContextMenuAction: (action: ContextAction, data?: any) => void;
  onDeleteFile: (fileId: string, type: "arquivo" | "pdf" | "imagem") => Promise<void>;
  onReloadAfterDelete: () => void;
}

export function PdfCell({ 
  lead, 
  onUnificar, 
  isUnifying,
  onContextMenuAction,
  onDeleteFile,
  onReloadAfterDelete 
}: PdfCellExtendedProps) {
  if (lead.pdfUnificado) {
    return (
      <TableCell className="min-w-[70px] max-w-[100px] p-2 align-middle">
        <LeadContextMenu
          contextType="pdf"
          onAction={onContextMenuAction}
          data={{ id: lead.id, type: "pdf" }}
        >
          <div 
            className="relative hover:bg-accent hover:text-accent-foreground flex items-center w-[60px] h-[60px] justify-center group mx-auto cursor-pointer"
            onClick={() => openExternalUrl(lead.pdfUnificado || "")}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <img 
                    src="/pdf.svg" 
                    alt="PDF" 
                    className="w-full h-full object-contain"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>PDF Unificado</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DeleteFileButton 
              onDelete={() => onDeleteFile(lead.id, "pdf")}
              fileType="pdf"
              onSuccess={onReloadAfterDelete}
            />
          </div>
        </LeadContextMenu>
      </TableCell>
    );
  }

  return (
    <TableCell className="min-w-[70px] max-w-[100px] p-2 align-middle">
      <Button
        variant="outline"
        
        onClick={() => onUnificar(lead.id)}
        disabled={isUnifying}
        className="w-full text-xs px-2 py-1 h-auto min-h-8"
      >
        <FileUp className="h-4 w-4 mr-1" />
        Unificar
      </Button>
    </TableCell>
  );
} 