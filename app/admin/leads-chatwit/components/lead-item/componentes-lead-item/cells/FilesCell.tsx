import { TableCell } from "@/components/ui/table";
import type { FileCellProps } from "../types";
import { getFileTypeIcon, openExternalUrl } from "../utils";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { DeleteFileButton } from "@/app/admin/leads-chatwit/components/delete-file-button";
import { FileText, File } from "lucide-react";

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

  return (
    <TableCell className="min-w-[100px] max-w-[150px] p-2 align-middle">
      <div className="grid grid-cols-3 gap-2">
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
          <span className="text-sm text-muted-foreground col-span-3">Sem arquivos</span>
        )}
      </div>
    </TableCell>
  );
} 