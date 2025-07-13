import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { CellProps } from "../types";
import { LeadContextMenu, ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { useState } from "react";
import { toast } from "sonner";

interface RecursoCellProps extends CellProps {
  localAnaliseState: {
    analiseUrl?: string;
    aguardandoAnalise: boolean;
    analisePreliminar?: any;
    analiseValidada: boolean;
  };
  localRecursoState: {
    recursoUrl?: string;
    aguardandoRecurso: boolean;
    recursoPreliminar?: any;
    recursoValidado: boolean;
  };
  isEnviandoRecurso: boolean;
  refreshKey: number;
  onContextMenuAction: (action: ContextAction, data?: any) => void;
  onRecursoClick: () => void;
}

export function RecursoCell({ 
  lead,
  localAnaliseState,
  localRecursoState,
  isEnviandoRecurso,
  refreshKey,
  onContextMenuAction,
  onRecursoClick
}: RecursoCellProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Verificar se tem análise preliminar
  const temAnalisePreliminar = Boolean(localAnaliseState.analisePreliminar);
  
  // Verificar se análise foi validada
  const analiseValidada = localAnaliseState.analiseValidada;
  
  // Verificar se já fez recurso
  const jaFezRecurso = Boolean(lead.fezRecurso);

  // Estados do recurso
  const temRecursoPreliminar = Boolean(localRecursoState.recursoPreliminar);
  const recursoValidado = localRecursoState.recursoValidado;
  const aguardandoRecurso = localRecursoState.aguardandoRecurso;
  const recursoUrl = localRecursoState.recursoUrl;

  // Determinar o estado do botão
  const podeEnviarRecurso = analiseValidada && temAnalisePreliminar && !isEnviandoRecurso && !isProcessing && !jaFezRecurso && !temRecursoPreliminar && !aguardandoRecurso;

  const handleRecursoClick = async () => {
    if (!podeEnviarRecurso) return;

    setIsProcessing(true);
    
    try {
      // Buscar o modelo de recurso
      const modeloResponse = await fetch("/api/admin/leads-chatwit/modelo-recurso");
      const modeloData = await modeloResponse.json();
      
      if (!modeloResponse.ok) {
        throw new Error("Erro ao buscar modelo de recurso");
      }

      const modeloRecurso = modeloData.modelo;
      
      if (!modeloRecurso || modeloRecurso.trim() === "") {
        throw new Error("Modelo de recurso não configurado. Configure um modelo primeiro.");
      }

      // Preparar dados para enviar ao sistema externo
      const recursoData = {
        leadID: lead.id,
        recurso: true,
        RecursoFinalizado: true,
        telefone: lead.phoneNumber,
        nome: lead.nomeReal || lead.name || "Lead sem nome",
        email: lead.email,
        modeloRecurso: modeloRecurso,
        analisePreliminar: localAnaliseState.analisePreliminar,
        analiseUrl: localAnaliseState.analiseUrl,
        leadData: {
          id: lead.id,
          nome: lead.nomeReal || lead.name,
          telefone: lead.phoneNumber,
          email: lead.email,
          especialidade: lead.especialidade,
          usuarioId: lead.usuarioId
        }
      };

      console.log("[Fazer Recurso] Enviando dados:", {
        leadId: lead.id,
        temModelo: Boolean(modeloRecurso),
        temAnalise: Boolean(localAnaliseState.analisePreliminar),
        analiseValidada: analiseValidada
      });

      // Enviar para o sistema externo
      const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recursoData),
      });

      const result = await response.json();

      if (response.ok) {
        // Marcar que o recurso foi feito
        await fetch("/api/admin/leads-chatwit/leads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: lead.id,
            fezRecurso: true,
            dataRecurso: new Date().toISOString(),
            _internal: true
          }),
        });

        toast.success("Recurso enviado", {
          description: "Recurso processado com sucesso!",
          duration: 3000
        });

        // Chamar callback para atualizar o lead
        onRecursoClick();
        
      } else {
        throw new Error(result.error || "Erro ao enviar recurso");
      }

    } catch (error: any) {
      console.error("Erro ao fazer recurso:", error);
      toast.error("Erro", {
        description: error.message || "Não foi possível enviar o recurso. Tente novamente.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <TableCell className="min-w-[100px] max-w-[140px] p-1 align-middle">
      <LeadContextMenu
        contextType="recurso"
        onAction={onContextMenuAction}
        data={{
          id: lead.id,
          fezRecurso: jaFezRecurso,
          analiseValidada: analiseValidada,
          temAnalisePreliminar: temAnalisePreliminar
        }}
      >
        {recursoUrl ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRecursoClick}
            className="w-full text-xs px-2 py-1 h-auto min-h-8"
            key={`recurso-btn-${refreshKey}`}
          >
            <FileText className="h-4 w-4 mr-1" />
            Ver Recurso
          </Button>
        ) : aguardandoRecurso ? (
          <Button
            variant="outline"
            size="sm"
            disabled={true}
            className="w-full text-xs px-2 py-1 h-auto min-h-8"
            key={`recurso-btn-${refreshKey}`}
          >
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            Aguardando Recurso
          </Button>
        ) : temRecursoPreliminar ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRecursoClick}
            className="w-full text-xs px-2 py-1 h-auto min-h-8"
            key={`recurso-btn-${refreshKey}`}
          >
            <FileText className="h-4 w-4 mr-1" />
            Validar Recurso
          </Button>
        ) : jaFezRecurso ? (
          <Button
            variant="outline"
            size="sm"
            disabled={true}
            className="w-full bg-green-50 border-green-200 text-green-700 opacity-80 text-xs px-2 py-1 h-auto min-h-8"
            key={`recurso-btn-${refreshKey}`}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Recurso Feito
          </Button>
        ) : !temAnalisePreliminar ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={true}
                  className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8"
                  key={`recurso-btn-${refreshKey}`}
                >
                  <AlertCircle className="h-4 w-4 mr-1 text-gray-500" />
                  Precisa de Análise
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-60">
                <p>É necessário ter uma análise preliminar para fazer o recurso.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : !analiseValidada ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={true}
                  className="w-full opacity-60 cursor-not-allowed text-xs px-2 py-1 h-auto min-h-8"
                  key={`recurso-btn-${refreshKey}`}
                >
                  <Shield className="h-4 w-4 mr-1 text-orange-500" />
                  Validar Análise
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-60">
                <p>A análise precisa ser validada antes de fazer o recurso.</p>
                <p className="text-muted-foreground mt-1">
                  Valide a análise preliminar primeiro.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecursoClick}
            disabled={isProcessing || isEnviandoRecurso}
            className="w-full text-xs px-2 py-1 h-auto min-h-8"
            key={`recurso-btn-${refreshKey}`}
          >
            {isProcessing || isEnviandoRecurso ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-1" />
                Fazer Recurso
              </>
            )}
          </Button>
        )}
      </LeadContextMenu>
    </TableCell>
  );
} 