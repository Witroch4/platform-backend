"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  Settings,
  Bot,
  Inbox as InboxIcon,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/lib/utils";
import { CaixaCardSkeleton } from "./LoadingSkeletons";
import { useMtfData } from "../context/MtfDataProvider";

import type { 
  AgenteDialogflow, 
  ChatwitInbox, 
  InboxExterna
} from "@/types/dialogflow";
import { DIALOGFLOW_REGIONS } from "@/types/dialogflow";

// Tipos
type CaixaEntrada = ChatwitInbox;

type Inbox = InboxExterna;

interface DialogflowCaixasAgentesProps {
  onCaixaSelected: (id: string | null) => void;
}

// Botão para debug de agentes
function DebugAgentesButton() {
  const [loading, setLoading] = useState(false);

  const handleDebug = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/mtf-diamante/dialogflow/debug-agentes');
      const data = response.data;
      
      console.log('🔍 Debug Agentes:', data);
      
      toast.success(
        `Debug concluído! ${data.debug.totalCaixas} caixas, ${data.debug.totalAgentes} agentes. Veja o console.`
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || 'Erro no debug'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={handleDebug}
      disabled={loading}
      size="sm"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Settings className="w-4 h-4 mr-2" />
      )}
      Debug
    </Button>
  );
}

// Botão para sincronizar agentes da origem
function SincronizarAgentesButton({ onSincronizacao }: { onSincronizacao: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleSincronizar = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/admin/mtf-diamante/dialogflow/sync-agentes');
      const data = response.data;
      
      toast.success(
        `Sincronização concluída! ${data.resumo.totalAgentesAdicionados} agentes adicionados, ${data.resumo.totalAgentesAtualizados} atualizados.`
      );
      
      onSincronizacao();
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || 'Erro ao sincronizar agentes'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={handleSincronizar}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4 mr-2" />
      )}
      Sincronizar Agentes
    </Button>
  );
}

export function DialogflowCaixasAgentes({
  onCaixaSelected,
}: DialogflowCaixasAgentesProps) {
  const [selectedCaixaId, setSelectedCaixaId] = useState<string | null>(null);

  // Usando contexto de dados para cache persistente
  const { caixas, loadingCaixas: loading, refreshCaixas } = useMtfData();

  // Seleção automática apenas se não houver seleção
  useEffect(() => {
    if (!selectedCaixaId && caixas.length > 0) {
      const firstCaixaId = caixas[0].id;
      setSelectedCaixaId(firstCaixaId);
      onCaixaSelected(firstCaixaId);
    }
  }, [caixas.length, selectedCaixaId, onCaixaSelected]);

  const handleSelectCaixa = (id: string | null) => {
    setSelectedCaixaId(id);
    onCaixaSelected(id);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button disabled>
            <Plus className="w-4 h-4 mr-2" /> Adicionar Caixa
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CaixaCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <DebugAgentesButton />
        <SincronizarAgentesButton onSincronizacao={refreshCaixas} />
        <AdicionarCaixaDialog
          onCaixaAdicionada={refreshCaixas}
          caixasConfiguradas={caixas}
        />
      </div>

      {caixas.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
          <p className="font-semibold">Nenhuma caixa de entrada configurada.</p>
          <p className="text-sm">
            Clique em "Adicionar Caixa" para sincronizar com sua conta Chatwit.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {caixas.map((caixa) => (
            <CaixaCard
              key={caixa.id}
              caixa={caixa}
              isSelected={selectedCaixaId === caixa.id}
              onSelect={handleSelectCaixa}
              onUpdate={refreshCaixas}
              refreshCaixas={refreshCaixas}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Card de Caixa de Entrada
function CaixaCard({
  caixa,
  isSelected,
  onSelect,
  onUpdate,
  refreshCaixas,
}: {
  caixa: CaixaEntrada;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: () => void;
  refreshCaixas: () => Promise<void>;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Impede que o clique no botão selecione o card
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await axios.delete(
        `/api/admin/mtf-diamante/dialogflow/caixas?id=${caixa.id}`
      );
      toast.success("Caixa excluída com sucesso");
      onUpdate();
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error("Erro ao excluir caixa");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card
        className={cn(
          "cursor-pointer transition-all",
          isSelected
            ? "border-primary ring-2 ring-primary"
            : "hover:border-gray-400"
        )}
        onClick={() => onSelect(caixa.id)}
      >
        {isSelected && (
          <div className="absolute top-2 right-2 text-primary">
            <CheckCircle2 />
          </div>
        )}
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <InboxIcon className="w-5 h-5" />
                {caixa.nome}
              </CardTitle>
              <CardDescription>
                {caixa.channelType}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleDeleteClick}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <h4 className="font-semibold mb-2 text-sm">Agentes Dialogflow</h4>
          <div className="space-y-2">
            {(!caixa.agentes || caixa.agentes.length === 0) ? (
              <p className="text-muted-foreground text-xs">
                Nenhum agente configurado.
              </p>
            ) : (
              (caixa.agentes || []).map((agente) => (
                <AgenteItem
                  key={agente.id}
                  agente={agente}
                  onUpdate={onUpdate}
                  refreshCaixas={refreshCaixas}
                />
              ))
            )}
          </div>
          <div className="mt-4">
            <AdicionarAgenteDialog
              caixaId={caixa.id}
              onAgenteAdicionado={onUpdate}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta caixa? Todos os agentes serão
              removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Item de Agente
function AgenteItem({
  agente,
  onUpdate,
  refreshCaixas,
}: {
  agente: AgenteDialogflow;
  onUpdate: () => void;
  refreshCaixas: () => Promise<void>;
}) {
  // Usando o contexto para acessar a função setCaixas
  const { caixas, setCaixas } = useMtfData();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Função para fazer o pessimistic update (espera API antes de mudar UI)
  const handlePessimisticToggle = (toggledAgentId: string) => {
    console.log('🔍 [Frontend] handlePessimisticToggle chamado para agente:', toggledAgentId);
    
    // Encontrar o agente atual para determinar se deve ativar ou desativar
    const caixaAtual = caixas.find((c) =>
      (c.agentes || []).some((a) => a.id === toggledAgentId)
    );
    const agenteAtual = caixaAtual?.agentes?.find(
      (a) => a.id === toggledAgentId
    );

    if (!agenteAtual || !caixaAtual) {
      console.log('❌ [Frontend] Agente ou caixa não encontrado');
      return;
    }

    const estadoOriginal = agenteAtual.ativo; // Guarda o estado original

    console.log('🔍 [Frontend] Estado do agente:', {
      agenteId: agenteAtual.id,
      agenteNome: agenteAtual.nome,
      estadoOriginal: estadoOriginal
    });

    // Chama a API primeiro, depois atualiza a UI
    handleToggleAgenteWithState(toggledAgentId, estadoOriginal);
  };

  // Função que recebe o estado original do agente
  const handleToggleAgenteWithState = (toggledAgentId: string, estadoOriginal: boolean) => {
    const togglePromise = async () => {
      // Debug: Log do estado original do agente
      console.log('🔍 [Frontend] Estado ORIGINAL do agente antes do toggle:', {
        agenteId: toggledAgentId,
        estadoOriginal: estadoOriginal,
        acao: estadoOriginal ? 'DESATIVAR (DELETE)' : 'ATIVAR (POST)'
      });

      // 1. FAZ A CHAMADA À API PRIMEIRO.
      // Se o agente estava ativo, usa DELETE para desativar
      // Se o agente estava inativo, usa POST para ativar
      const response = estadoOriginal
        ? await axios.delete(
            `/api/admin/mtf-diamante/dialogflow/agentes/${toggledAgentId}/toggle`
          )
        : await axios.post(
            `/api/admin/mtf-diamante/dialogflow/agentes/${toggledAgentId}/toggle`
          );

      console.log('🔍 [Frontend] Resposta da API:', {
        status: response.status,
        method: estadoOriginal ? 'DELETE' : 'POST',
        data: response.data
      });

      // 2. SUCESSO! A API NÃO DEU ERRO.
      // AGORA atualiza a UI localmente (sem recarregar do servidor)
      const deveAtivar = !estadoOriginal;
      
      setCaixas((currentCaixas) => {
        const newCaixas = currentCaixas.map((c) => {
          // Encontrar a caixa que contém o agente
          const agenteNaCaixa = (c.agentes || []).find((a) => a.id === toggledAgentId);
          if (!agenteNaCaixa) return c; // Não é a caixa atual

          const newAgentes = (c.agentes || []).map((agente) => {
            if (agente.id === toggledAgentId) {
              // Atualiza o agente clicado com o novo estado e hookId da resposta
              return { 
                ...agente, 
                ativo: deveAtivar,
                hookId: response.data.agente?.hookId || null
              };
            }
            if (deveAtivar) {
              // Se estamos ativando um agente, desativamos todos os outros
              return { ...agente, ativo: false, hookId: null };
            }
            return agente;
          });

          return { ...c, agentes: newAgentes };
        });

        return newCaixas;
      });

      // 3. Retorna os dados da resposta para a mensagem de sucesso do toast.
      return response.data;
    };

    // 4. CHAMA O TOAST.PROMISE com a função que criamos.
    toast.promise(togglePromise(), {
      loading: estadoOriginal ? "Desativando agente..." : "Ativando agente...",
      success: (data) => {
        return data.message || "Status alterado com sucesso!";
      },
      error: (err) => {
        return err.response?.data?.error || "Falha ao alterar o status do agente.";
      },
    });
  };

  const handleDeleteAgente = async () => {
    const deletePromise = axios.delete(
      `/api/admin/mtf-diamante/dialogflow/agentes/${agente.id}`
    );

    toast.promise(deletePromise, {
      loading: "Excluindo agente...",
      success: () => {
        onUpdate();
        setShowDeleteDialog(false);
        return "Agente excluído com sucesso!";
      },
      error: "Erro ao excluir agente",
    });
  };

  return (
    <>
      <div className="flex items-center justify-between p-2 border rounded-lg text-sm">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-500" />
          <span className="font-medium">{agente.nome}</span>
          {agente.ativo && (
            <Badge variant="default" className="bg-green-500 h-5">
              Ativo
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={`switch-${agente.id}`}
            checked={agente.ativo}
            onCheckedChange={() => handlePessimisticToggle(agente.id)}
          />
          <EditarAgenteDialog agente={agente} onAgenteAtualizado={onUpdate} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o agente "{agente.nome}"? Esta ação
              não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteAgente}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Dialogs (Modais)
function AdicionarCaixaDialog({
  onCaixaAdicionada,
  caixasConfiguradas,
}: {
  onCaixaAdicionada: () => void;
  caixasConfiguradas: CaixaEntrada[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caixasExternas, setCaixasExternas] = useState<Inbox[]>([]);
  const [nomesInternos, setNomesInternos] = useState<{ [key: string]: string }>(
    {}
  );
  
  // Ref para controlar se já foi carregado
  const hasLoaded = useRef(false);

  const fetchCaixasExternas = async () => {
    // Evitar carregamento múltiplo
    if (hasLoaded.current && caixasExternas.length > 0) {
      console.log('🔍 [AdicionarCaixaDialog] Caixas externas já carregadas, pulando fetch');
      return;
    }
    
    console.log('🔄 [AdicionarCaixaDialog] Buscando caixas externas...');
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        "/api/admin/mtf-diamante/dialogflow/inboxes"
      );
      const idsConfigurados = new Set(caixasConfiguradas.map((c) => c.inboxId));
      const disponiveis = (response.data.inboxes || []).filter(
        (inbox: Inbox) => !idsConfigurados.has(inbox.id.toString())
      );
      setCaixasExternas(disponiveis);
      hasLoaded.current = true;
      console.log(`✅ [AdicionarCaixaDialog] ${disponiveis.length} caixas externas disponíveis`);
    } catch (err) {
      console.error('❌ [AdicionarCaixaDialog] Erro ao buscar caixas externas:', err);
      setError(
        "Falha ao buscar caixas do Chatwit. Verifique a configuração de acesso."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAdicionarCaixa = async (caixa: Inbox) => {
    const nomeInterno = nomesInternos[caixa.id] || caixa.name;
    const promise = axios.post("/api/admin/mtf-diamante/dialogflow/caixas", {
      nome: nomeInterno,
      accountId: caixa.account_id,
      inboxId: caixa.id.toString(),
      inboxName: caixa.name,
      channelType: caixa.channel_type,
    });
    toast.promise(promise, {
      loading: `Adicionando caixa...`,
      success: () => {
        // Aguardar um pouco antes de atualizar para garantir que o agente foi criado
        setTimeout(() => {
          onCaixaAdicionada();
        }, 500);
        setOpen(false);
        return `Caixa "${nomeInterno}" adicionada com sucesso!`;
      },
      error: "Erro ao adicionar a caixa.",
    });
  };

  // Resetar estado quando o dialog abre/fecha
  useEffect(() => {
    if (open) {
      // Resetar estado quando abrir
      hasLoaded.current = false;
      setCaixasExternas([]);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button onClick={fetchCaixasExternas}>
          <Plus className="w-4 h-4 mr-2" /> Adicionar Caixa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sincronizar Novas Caixas de Entrada</DialogTitle>
          <DialogDescription>
            Listando caixas de entrada da sua conta Chatwit que ainda não foram
            configuradas.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {error && <div className="text-red-500 text-center">{error}</div>}
          {!loading && !error && caixasExternas.length === 0 && (
            <div className="text-center text-gray-500">
              <p>
                Todas as caixas de entrada disponíveis já foram configuradas.
              </p>
            </div>
          )}
          {!loading &&
            !error &&
            caixasExternas.map((caixa) => (
              <div
                key={caixa.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h4 className="font-medium">{caixa.name}</h4>
                  <p className="text-sm text-gray-500">{caixa.channel_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nome interno (opcional)"
                    value={nomesInternos[caixa.id] || ""}
                    onChange={(e) =>
                      setNomesInternos((prev) => ({
                        ...prev,
                        [caixa.id]: e.target.value,
                      }))
                    }
                    className="w-40"
                  />
                  <Button onClick={() => handleAdicionarCaixa(caixa)}>
                    Adicionar
                  </Button>
                </div>
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdicionarAgenteDialog({
  caixaId,
  onAgenteAdicionado,
}: {
  caixaId: string;
  onAgenteAdicionado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    projectId: "",
    credentials: "",
    region: "global",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Debug: Log dos dados que serão enviados
      console.log('🔍 [Frontend] Dados para criação de agente:', {
        nome: formData.nome,
        projectId: formData.projectId,
        region: formData.region,
        inboxId: caixaId
      });

      await axios.post("/api/admin/mtf-diamante/dialogflow/agentes", {
        ...formData,
        inboxId: caixaId,
      });
      toast.success("Agente adicionado com sucesso!");
      onAgenteAdicionado();
      setOpen(false);
      setFormData({
        nome: "",
        projectId: "",
        credentials: "",
        region: "global",
      });
    } catch (error) {
      toast.error("Erro ao adicionar agente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="w-4 h-4 mr-2" /> Novo Agente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Agente Dialogflow</DialogTitle>
          <DialogDescription>
            Configure um novo agente Dialogflow para esta caixa de entrada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Agente</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, nome: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="projectId">Project ID</Label>
            <Input
              id="projectId"
              value={formData.projectId}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, projectId: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="credentials">Credenciais JSON</Label>
            <Textarea
              id="credentials"
              value={formData.credentials}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  credentials: e.target.value,
                }))
              }
              placeholder="Cole aqui o JSON das credenciais do Google Cloud"
              rows={6}
              required
            />
          </div>
          <div>
            <Label htmlFor="region">Região</Label>
            <Select
              value={formData.region}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, region: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIALOGFLOW_REGIONS.map((region) => (
                  <SelectItem key={region.value} value={region.value}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditarAgenteDialog({
  agente,
  onAgenteAtualizado,
}: {
  agente: AgenteDialogflow;
  onAgenteAtualizado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: agente.nome,
    projectId: agente.projectId,
    region: agente.region,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.patch(
        `/api/admin/mtf-diamante/dialogflow/agentes/${agente.id}`,
        formData
      );
      toast.success("Agente atualizado com sucesso!");
      onAgenteAtualizado();
      setOpen(false);
    } catch (error) {
      toast.error("Erro ao atualizar agente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Agente Dialogflow</DialogTitle>
          <DialogDescription>
            Atualize as configurações do agente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Agente</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, nome: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="projectId">Project ID</Label>
            <Input
              id="projectId"
              value={formData.projectId}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, projectId: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="region">Região</Label>
            <Select
              value={formData.region}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, region: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIALOGFLOW_REGIONS.map((region) => (
                  <SelectItem key={region.value} value={region.value}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Atualizar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
