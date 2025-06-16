import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit3 } from "lucide-react";
import { ManuscritoCellProps } from "../types";
import { LeadContextMenu, ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";

interface ManuscritoCellExtendedProps extends ManuscritoCellProps {
  manuscritoProcessadoLocal: boolean;
  isDigitando: boolean;
  refreshKey: number;
  localManuscritoState: {
    manuscritoProcessado: boolean;
    aguardandoManuscrito: boolean;
    provaManuscrita: any;
  };
  onContextMenuAction: (action: ContextAction, data?: any) => void;
  onDigitarClick: () => void;
}

export function ManuscritoCell({ 
  lead,
  manuscritoProcessadoLocal,
  isDigitando,
  refreshKey,
  localManuscritoState,
  onContextMenuAction,
  onDigitarClick
}: ManuscritoCellExtendedProps) {
  return (
    <TableCell className="w-[100px] p-2 align-middle">
      <LeadContextMenu
        contextType="manuscrito"
        onAction={onContextMenuAction}
        data={{
          id: lead.id,
          manuscritoProcessado: localManuscritoState.manuscritoProcessado,
          aguardandoManuscrito: localManuscritoState.aguardandoManuscrito
        }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={onDigitarClick}
          disabled={isDigitando}
          className="whitespace-nowrap w-full"
          key={`manuscrito-btn-${refreshKey}`}
        >
          {localManuscritoState.aguardandoManuscrito ? (
            <>
              <Edit3 className="h-4 w-4 mr-1 animate-spin" />
              Aguardando
            </>
          ) : localManuscritoState.manuscritoProcessado ? (
            <>
              <Edit3 className="h-4 w-4 mr-1" />
              Editar Manuscrito
            </>
          ) : (
            <>
              <Edit3 className={`h-4 w-4 mr-1 ${isDigitando ? "animate-spin" : ""}`} />
              {isDigitando ? "Processando..." : "Digitar Manuscrito"}
            </>
          )}
        </Button>
      </LeadContextMenu>
    </TableCell>
  );
} 