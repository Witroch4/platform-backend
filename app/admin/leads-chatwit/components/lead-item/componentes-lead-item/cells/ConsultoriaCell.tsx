import { TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellProps } from "../types";

interface ConsultoriaCellProps extends CellProps {
  consultoriaAtiva: boolean;
  isUploadingEspelho: boolean;
  onConsultoriaToggle: (ativo: boolean) => void;
  onDelete?: () => void;
}

export function ConsultoriaCell({ 
  consultoriaAtiva, 
  isUploadingEspelho, 
  onConsultoriaToggle,
  onDelete
}: ConsultoriaCellProps) {
  return (
    <TableCell className="min-w-[80px] max-w-[120px] p-2 align-middle">
      <div className="flex items-center justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center space-x-6">
                <Switch
                  checked={consultoriaAtiva}
                  onCheckedChange={onConsultoriaToggle}
                  disabled={isUploadingEspelho}
                />
                {onDelete && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-accent/50 transition-opacity"
                      >
                        <MoreVertical className="h-3 w-3" />
                        <span className="sr-only">Abrir menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={onDelete}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir Lead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{consultoriaAtiva ? "Consultoria fase 2 ativa" : "Consultoria fase 2 inativa"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </TableCell>
  );
} 