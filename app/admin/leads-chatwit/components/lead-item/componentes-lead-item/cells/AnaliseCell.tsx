import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, FileText, FileCheck, Loader2 } from "lucide-react";
import { CellProps } from "../types";
import { LeadContextMenu, ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";

interface AnaliseCellProps extends CellProps {
  localAnaliseState: {
    analiseUrl?: string;
    aguardandoAnalise: boolean;
    analisePreliminar?: any;
    analiseValidada: boolean;
  };
  consultoriaAtiva: boolean;
  isEnviandoAnalise: boolean;
  refreshKey: number;
  onContextMenuAction: (action: ContextAction, data?: any) => void;
  onAnaliseClick: () => void;
}

export function AnaliseCell({ 
  lead,
  localAnaliseState,
  consultoriaAtiva,
  isEnviandoAnalise,
  refreshKey,
  onContextMenuAction,
  onAnaliseClick
}: AnaliseCellProps) {
  // Só mostrar a célula se tiver manuscrito E espelho processados
  const temManuscrito = lead.provaManuscrita && 
    (typeof lead.provaManuscrita === 'string' ? lead.provaManuscrita.length > 0 : 
     Array.isArray(lead.provaManuscrita) ? lead.provaManuscrita.length > 0 : 
     typeof lead.provaManuscrita === 'object' && lead.provaManuscrita !== null);

  const temEspelho = lead.textoDOEspelho && 
    (typeof lead.textoDOEspelho === 'string' ? lead.textoDOEspelho.length > 0 : 
     Array.isArray(lead.textoDOEspelho) ? lead.textoDOEspelho.length > 0 : 
     typeof lead.textoDOEspelho === 'object' && lead.textoDOEspelho !== null);

  // Se não tiver manuscrito E espelho, não mostrar a célula
  if (!temManuscrito || !temEspelho) {
    return <TableCell className="w-[120px] p-2 align-middle"></TableCell>;
  }

  return (
    <TableCell className="w-[120px] p-2 align-middle">
      <LeadContextMenu
        contextType="analise"
        onAction={onContextMenuAction}
        data={{
          id: lead.id,
          analiseUrl: localAnaliseState.analiseUrl,
          aguardandoAnalise: localAnaliseState.aguardandoAnalise,
          analisePreliminar: localAnaliseState.analisePreliminar,
          analiseValidada: localAnaliseState.analiseValidada
        }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={onAnaliseClick}
          disabled={isEnviandoAnalise}
          className="whitespace-nowrap w-full"
          key={`analise-btn-${refreshKey}`}
        >
          {isEnviandoAnalise ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Processando...
            </>
          ) : localAnaliseState.analiseUrl ? (
            <>
              <Eye className="h-4 w-4 mr-1" />
              Ver Análise
            </>
          ) : localAnaliseState.analiseValidada ? (
            <>
              <FileCheck className="h-4 w-4 mr-1" />
              Análise Validada Espere
            </>
          ) : localAnaliseState.analisePreliminar ? (
            <>
              <FileText className="h-4 w-4 mr-1" />
              Pré-Análise
            </>
          ) : localAnaliseState.aguardandoAnalise ? (
            <>
              <Loader2 className="h-4 w-4 mr-1" />
              Aguardando
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-1" />
              {consultoriaAtiva ? "Analisar Simulado" : "Analisar Prova"}
            </>
          )}
        </Button>
      </LeadContextMenu>
    </TableCell>
  );
} 