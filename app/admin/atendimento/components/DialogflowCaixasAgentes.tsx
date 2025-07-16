'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Settings, Bot, Inbox as InboxIcon, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import axios, { type AxiosError } from 'axios';
import { cn } from '@/lib/utils';

// Tipos
interface AgenteDialogflow {
  id: string;
  nome: string;
  projectId: string;
  region: string;
  ativo: boolean;
}

interface CaixaEntrada {
  id: string;
  nome: string;
  inboxId: string;
  inboxName: string;
  chatwitAccountId: string;
  channelType: string;
  agentes: AgenteDialogflow[];
}

interface Inbox {
  id: string;
  name: string;
  channel_type: string;
}

interface DialogflowCaixasAgentesProps {
  onCaixaSelected: (id: string | null) => void;
}

export function DialogflowCaixasAgentes({ onCaixaSelected }: DialogflowCaixasAgentesProps) {
  const [caixas, setCaixas] = useState<CaixaEntrada[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaixaId, setSelectedCaixaId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/dialogflow/caixas');
      const fetchedCaixas = response.data.caixas || [];
      setCaixas(fetchedCaixas);

      // Lógica para manter ou definir a seleção
      if (selectedCaixaId && !fetchedCaixas.some((c: CaixaEntrada) => c.id === selectedCaixaId)) {
        const newSelection = fetchedCaixas.length > 0 ? fetchedCaixas[0].id : null;
        handleSelectCaixa(newSelection);
      } else if (!selectedCaixaId && fetchedCaixas.length > 0) {
        handleSelectCaixa(fetchedCaixas[0].id);
      }

    } catch (error) {
      console.error('Erro ao buscar caixas:', error);
      toast.error('Não foi possível carregar as caixas de entrada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectCaixa = (id: string | null) => {
    setSelectedCaixaId(id);
    onCaixaSelected(id);
  };

  if (loading) {
    return <div className="flex justify-center items-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AdicionarCaixaDialog onCaixaAdicionada={fetchData} caixasConfiguradas={caixas} />
      </div>

      {caixas.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
            <p className="font-semibold">Nenhuma caixa de entrada configurada.</p>
            <p className="text-sm">Clique em "Adicionar Caixa" para sincronizar com sua conta Chatwit.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {caixas.map((caixa) => (
            <CaixaCard 
              key={caixa.id} 
              caixa={caixa} 
              isSelected={selectedCaixaId === caixa.id}
              onSelect={handleSelectCaixa}
              onUpdate={fetchData}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Card de Caixa de Entrada
function CaixaCard({ caixa, isSelected, onSelect, onUpdate }: { caixa: CaixaEntrada, isSelected: boolean, onSelect: (id: string) => void, onUpdate: () => void }) {
  
  const handleDeleteCaixa = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Impede que o clique no botão selecione o card
    if (!confirm('Tem certeza que deseja excluir esta caixa? Todos os agentes serão removidos.')) return;
    try {
      await axios.delete(`/api/admin/dialogflow/caixas?id=${caixa.id}`);
      toast.success('Caixa excluída com sucesso');
      onUpdate();
    } catch (error) {
      toast.error('Erro ao excluir caixa');
    }
  };

  return (
    <Card 
      className={cn("cursor-pointer transition-all", isSelected ? "border-primary ring-2 ring-primary" : "hover:border-gray-400")}
      onClick={() => onSelect(caixa.id)}
    >
      {isSelected && <div className="absolute top-2 right-2 text-primary"><CheckCircle2 /></div>}
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="flex items-center gap-2"><InboxIcon className="w-5 h-5" />{caixa.nome}</CardTitle>
                <CardDescription>{caixa.inboxName} ({caixa.channelType})</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleDeleteCaixa}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <h4 className="font-semibold mb-2 text-sm">Agentes Dialogflow</h4>
        <div className="space-y-2">
            {caixa.agentes.length === 0 ? (
                <p className="text-muted-foreground text-xs">Nenhum agente configurado.</p>
            ) : (
                caixa.agentes.map(agente => <AgenteItem key={agente.id} agente={agente} onUpdate={onUpdate} />)
            )}
        </div>
        <div className="mt-4">
            <AdicionarAgenteDialog caixaId={caixa.id} onAgenteAdicionado={onUpdate} />
        </div>
      </CardContent>
    </Card>
  );
}

// Item de Agente
function AgenteItem({ agente, onUpdate }: { agente: AgenteDialogflow, onUpdate: () => void }) {
    
    const handleToggleAgente = async () => {
        try {
            const response = await axios.patch(`/api/admin/dialogflow/agentes/${agente.id}/toggle`);
            toast.success(response.data.message || 'Status alterado');
            onUpdate();
        } catch (error) {
            toast.error('Erro ao alterar status');
        }
    };

    return (
        <div className="flex items-center justify-between p-2 border rounded-lg text-sm">
            <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-500" />
                <span className="font-medium">{agente.nome}</span>
                {agente.ativo && <Badge variant="default" className="bg-green-500 h-5">Ativo</Badge>}
            </div>
            <div className="flex items-center gap-2">
                <Switch id={`switch-${agente.id}`} checked={agente.ativo} onCheckedChange={handleToggleAgente} />
                <EditarAgenteDialog agente={agente} onAgenteAtualizado={onUpdate} />
            </div>
        </div>
    );
}

// Dialogs (Modais)
function AdicionarCaixaDialog({ onCaixaAdicionada, caixasConfiguradas }: { onCaixaAdicionada: () => void, caixasConfiguradas: CaixaEntrada[] }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [caixasExternas, setCaixasExternas] = useState<any[]>([]);
    const [nomesInternos, setNomesInternos] = useState<{[key: string]: string}>({});

    const fetchCaixasExternas = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get('/api/admin/dialogflow/inboxes');
            const idsConfigurados = new Set(caixasConfiguradas.map(c => c.inboxId));
            const disponiveis = (response.data.inboxes || []).filter((inbox: any) => !idsConfigurados.has(inbox.id.toString()));
            setCaixasExternas(disponiveis);
        } catch (err) {
            setError("Falha ao buscar caixas do Chatwit. Verifique a configuração de acesso.");
        } finally {
            setLoading(false);
        }
    }

    const handleAdicionarCaixa = async (caixa: any) => {
        const nomeInterno = nomesInternos[caixa.id] || caixa.name;
        try {
            await axios.post('/api/admin/dialogflow/caixas', {
                nome: nomeInterno,
                accountId: caixa.account_id,
                inboxId: caixa.id.toString(),
                inboxName: caixa.name,
                channelType: caixa.channel_type
            });
            toast.success(`Caixa "${nomeInterno}" adicionada com sucesso!`);
            onCaixaAdicionada();
            setOpen(false);
        } catch (error) {
            toast.error("Erro ao adicionar a caixa.");
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button onClick={fetchCaixasExternas}><Plus className="w-4 h-4 mr-2" /> Adicionar Caixa</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Sincronizar Novas Caixas de Entrada</DialogTitle>
                    <DialogDescription>Listando caixas de entrada da sua conta Chatwit que ainda não foram configuradas.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Conteúdo do modal... */}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AdicionarAgenteDialog({ caixaId, onAgenteAdicionado }: { caixaId: string, onAgenteAdicionado: () => void }) {
    // Lógica do modal de adicionar agente...
    return <Button variant="outline" size="sm" className="w-full"><Plus className="w-4 h-4 mr-2" /> Novo Agente</Button>;
}

function EditarAgenteDialog({ agente, onAgenteAtualizado }: { agente: AgenteDialogflow, onAgenteAtualizado: () => void }) {
    // Lógica do modal de editar agente...
    return <Button variant="ghost" size="icon"><Settings className="w-4 h-4" /></Button>;
}