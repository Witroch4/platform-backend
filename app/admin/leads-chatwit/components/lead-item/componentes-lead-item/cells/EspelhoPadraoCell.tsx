import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookOpen, Check, Loader2 } from "lucide-react";
import type { CellProps } from "../types";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface EspelhoPadrao {
  id: string;
  especialidade: string;
  nome: string;
  descricao?: string;
  textoMarkdown?: string;
  isAtivo: boolean;
  totalUsos: number;
  processado: boolean;
  aguardandoProcessamento: boolean;
}

interface EspelhoPadraoCellProps extends CellProps {
  usuarioId: string;
  onEspelhoPadraoChange: (leadId: string, especialidade: string | null) => void;
  espelhosPadrao?: EspelhoPadrao[];
  loadingEspelhosPadrao?: boolean;
}

const especialidadeLabels: { [key: string]: string } = {
  'ADMINISTRATIVO': 'Administrativo',
  'CIVIL': 'Civil',
  'CONSTITUCIONAL': 'Constitucional',
  'TRABALHO': 'Trabalho',
  'EMPRESARIAL': 'Empresarial',
  'PENAL': 'Penal',
  'TRIBUTARIO': 'Tributário',
};

export function EspelhoPadraoCell({ 
  lead, 
  usuarioId,
  onEspelhoPadraoChange,
  espelhosPadrao = [],
  loadingEspelhosPadrao = false
}: EspelhoPadraoCellProps) {
  const [atualizandoLead, setAtualizandoLead] = useState(false);
  const [especialidadeLocal, setEspecialidadeLocal] = useState<string | null>(lead.especialidade || null);

  // Só mostra se há imagens convertidas (mesma lógica do ImagesCell)
  if (!lead.arquivos.some(a => a.pdfConvertido)) {
    return <TableCell className="min-w-[120px] max-w-[160px] p-2 align-middle"></TableCell>;
  }

  // Sincronizar especialidade local com o prop
  useEffect(() => {
    setEspecialidadeLocal(lead.especialidade || null);
  }, [lead.especialidade]);

  const handleEspecialidadeChange = async (especialidade: string) => {
    try {
      setAtualizandoLead(true);
      
      const novaEspecialidade = especialidade === 'none' ? null : especialidade;
      
      // Atualizar estado local imediatamente para responsividade
      setEspecialidadeLocal(novaEspecialidade);
      
      // Atualizar a especialidade do lead no banco
      const response = await fetch(`/api/admin/leads-chatwit/atualizar-especialidade`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadId: lead.id,
          especialidade: novaEspecialidade,
        }),
      });

      if (!response.ok) {
        // Reverter estado local em caso de erro
        setEspecialidadeLocal(lead.especialidade || null);
        throw new Error("Erro ao atualizar especialidade do lead");
      }

      const result = await response.json();

      // EXECUTAR CALLBACK IMEDIATAMENTE
      onEspelhoPadraoChange(lead.id, novaEspecialidade);
      
      toast.success("Especialidade atualizada", { 
        description: `${especialidade === 'none' ? 'Removida' : especialidadeLabels[especialidade]}`,
        duration: 2000
      });
    } catch (error: any) {
      console.error("Erro ao atualizar especialidade:", error);
      toast.error("Erro", { description: "Não foi possível atualizar a especialidade do lead." });
    } finally {
      setAtualizandoLead(false);
    }
  };

  // Handler para bloquear apenas a propagação, sem interferir no funcionamento interno
  const handleStopPropagation = (e: React.MouseEvent | React.SyntheticEvent) => {
    e.stopPropagation();
  };

  // Handler mais específico para container - só previne propagação para a linha da tabela
  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Verificar se existe espelho padrão para a especialidade selecionada
  const espelhoPadraoSelecionado = especialidadeLocal 
    ? espelhosPadrao.find(ep => ep.especialidade === especialidadeLocal)
    : null;

  const temTextoProcessado = espelhoPadraoSelecionado?.textoMarkdown && 
    espelhoPadraoSelecionado.processado && 
    !espelhoPadraoSelecionado.aguardandoProcessamento;

  return (
    <TableCell 
      className="min-w-[120px] max-w-[160px] p-2 align-middle"
      onClick={handleContainerClick}
    >
      <div 
        className="flex flex-col gap-2" 
        onClick={handleContainerClick}
      >
        <Select
          value={especialidadeLocal || 'none'}
          onValueChange={handleEspecialidadeChange}
          disabled={loadingEspelhosPadrao || atualizandoLead}
        >
          <SelectTrigger className={`
            w-full h-8 transition-all duration-200 hover:shadow-sm
            ${loadingEspelhosPadrao || atualizandoLead 
              ? 'opacity-60 cursor-not-allowed bg-muted animate-pulse' 
              : 'hover:bg-accent/50 hover:border-accent-foreground/20 focus:ring-2 focus:ring-primary/20 focus:border-primary/40'
            }
          `}>
            <div className="flex items-center gap-2">
              {(loadingEspelhosPadrao || atualizandoLead) && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              <SelectValue 
                placeholder={
                  loadingEspelhosPadrao 
                    ? "Carregando..." 
                    : atualizandoLead 
                      ? "Atualizando..." 
                      : "Selecionar especialidade"
                } 
              />
            </div>
          </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-200 shadow-lg border-border/50">
            <SelectItem 
              value="none"
              className="hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer focus:bg-accent focus:text-accent-foreground"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">Nenhuma</span>
                {!especialidadeLocal && <Check className="h-3 w-3 text-green-500" />}
              </div>
            </SelectItem>
            {Object.entries(especialidadeLabels).map(([key, label]) => {
              const espelhoPadrao = espelhosPadrao.find(ep => ep.especialidade === key);
              const disponivel = espelhoPadrao?.isAtivo && espelhoPadrao.processado;
              const isSelected = especialidadeLocal === key;
              
              return (
                <SelectItem 
                  key={key} 
                  value={key} 
                  disabled={!disponivel}
                  className={`
                    transition-all duration-200 cursor-pointer
                    ${disponivel 
                      ? 'hover:bg-accent hover:text-accent-foreground hover:scale-[1.02] focus:bg-accent focus:text-accent-foreground' 
                      : 'opacity-50 cursor-not-allowed hover:bg-muted/30'
                    }
                    ${isSelected ? 'bg-primary/10 text-primary' : ''}
                  `}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`
                      font-medium transition-colors
                      ${disponivel ? 'text-foreground' : 'text-muted-foreground'}
                      ${isSelected ? 'text-primary font-semibold' : ''}
                    `}>
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      {disponivel && isSelected && (
                        <Check className="h-3 w-3 text-primary animate-pulse" />
                      )}
                      {disponivel && !isSelected && (
                        <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/40">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500 m-auto mt-0.5" />
                        </div>
                      )}
                      {!disponivel && (
                        <div className="flex items-center gap-1">
                          <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/40">
                            <div className="h-1.5 w-1.5 rounded-full bg-red-500 m-auto mt-0.5" />
                          </div>
                          <span className="text-xs text-muted-foreground">(Indisponível)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        
        {/* Badge de status */}
        {especialidadeLocal && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="flex items-center gap-1 hover:scale-105 transition-transform duration-200 cursor-help"
                  onClick={handleStopPropagation}
                >
                  <BookOpen className="h-3 w-3 transition-all duration-200 hover:text-primary hover:scale-110" />
                  <Badge 
                    variant={temTextoProcessado ? "default" : "secondary"} 
                    className="text-xs hover:shadow-sm transition-all duration-200"
                  >
                    {temTextoProcessado ? "Pronto" : "Sem texto"}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>
                  {temTextoProcessado 
                    ? `Espelho padrão de ${especialidadeLabels[especialidadeLocal]} está disponível`
                    : `Espelho padrão de ${especialidadeLabels[especialidadeLocal]} não possui texto processado`
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </TableCell>
  );
} 