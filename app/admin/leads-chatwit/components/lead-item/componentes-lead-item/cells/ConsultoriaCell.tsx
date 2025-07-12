import { TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CellProps } from "../types";

interface ConsultoriaCellProps extends CellProps {
  consultoriaAtiva: boolean;
  isUploadingEspelho: boolean;
  onConsultoriaToggle: (ativo: boolean) => void;
}

export function ConsultoriaCell({ 
  consultoriaAtiva, 
  isUploadingEspelho, 
  onConsultoriaToggle 
}: ConsultoriaCellProps) {
  return (
    <TableCell className="min-w-[80px] max-w-[120px] p-2 align-middle">
      <div className="flex items-center justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={consultoriaAtiva}
                  onCheckedChange={onConsultoriaToggle}
                  disabled={isUploadingEspelho}
                />
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