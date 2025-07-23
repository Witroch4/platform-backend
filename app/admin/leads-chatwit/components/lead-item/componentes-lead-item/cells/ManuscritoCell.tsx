import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit3 } from "lucide-react";
import type { ManuscritoCellProps } from "../types";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";

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
    <TableCell className="min-w-[90px] max-w-[130px] p-2 align-middle">
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
          className="w-full text-xs px-2 py-1 h-auto min-h-8"
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