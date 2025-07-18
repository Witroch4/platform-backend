'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, Plus, Trash2, Edit, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DisparoMensagemDialog } from './DisparoMensagemDialog';

interface WhatsAppConfig {
  id?: string;
  phoneNumberId: string;
  token: string;
  chavePix?: string;
  nomeEscritorio?: string;
}

interface MtfDiamanteLote {
  id?: string;
  numero: number;
  nome: string;
  valor: string;
  dataInicio: Date;
  dataFim: Date;
  isActive: boolean;
}

interface ConfiguracoesLoteTabProps {
  configPadrao: WhatsAppConfig | null;
  onUpdate: () => void; // Função para recarregar os dados na página pai
}

const ConfiguracoesLoteTab = ({ configPadrao, onUpdate }: ConfiguracoesLoteTabProps) => {
  const [config, setConfig] = useState<WhatsAppConfig>({
    phoneNumberId: '',
    token: '',
    chavePix: '57944155000101',
    nomeEscritorio: 'Dra. Amanda Sousa Advocacia e Consultoria Jurídica™'
  });
  const [lotes, setLotes] = useState<MtfDiamanteLote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (configPadrao) {
      setConfig(configPadrao);
    }
    fetchLotes();
  }, [configPadrao]);

  const fetchLotes = async () => {
    try {
      const response = await fetch('/api/admin/mtf-diamante/lotes');
      if (response.ok) {
        const data = await response.json();
        setLotes(data.lotes || []);
      }
    } catch (error) {
      console.error('Erro ao buscar lotes:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/mtf-diamante/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Envia sem caixaId para salvar como configuração global
        body: JSON.stringify({
          phoneNumberId: config.phoneNumberId,
          token: config.token,
          chavePix: config.chavePix,
          nomeEscritorio: config.nomeEscritorio
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao salvar configurações globais.');
      }

      toast.success('Configurações globais salvas com sucesso!');
      onUpdate(); // Notifica o componente pai para recarregar os dados
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração Padrão e WhatsApp Global</CardTitle>
          <CardDescription>
            Estas configurações se aplicam a todas as caixas de entrada que não possuem uma configuração específica (Geral e WhatsApp Padrão).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chavePix">Chave PIX (até 15 caracteres)</Label>
              <Input
                id="chavePix"
                name="chavePix"
                value={config.chavePix || ''}
                onChange={handleChange}
                placeholder="57944155000101"
                maxLength={15}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomeEscritorio">Nome do Escritório</Label>
              <Input
                id="nomeEscritorio"
                name="nomeEscritorio"
                value={config.nomeEscritorio || ''}
                onChange={handleChange}
                placeholder="Dra. Amanda Sousa Advocacia e Consultoria Jurídica™"
                required
              />
            </div>
            <Separator className="my-4" />
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                name="phoneNumberId"
                value={config.phoneNumberId}
                onChange={handleChange}
                placeholder="ID do Número de Telefone da Meta"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Token de Acesso Permanente</Label>
              <Input
                id="token"
                name="token"
                type="password"
                value={config.token}
                onChange={handleChange}
                placeholder="Seu token de acesso da API do WhatsApp"
                required
              />
            </div>
            <Button type="submit">Salvar Configurações Globais</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Configuração de Lotes MTF Diamante</CardTitle>
              <CardDescription>
                Configure os lotes que serão utilizados nas mensagens interativas do sistema.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <DisparoMensagemDialog />
              <AdicionarLoteDialog onLoteAdicionado={fetchLotes} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lotes.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>Nenhum lote configurado.</p>
              <p className="text-sm">Clique em "Adicionar Lote" para criar um novo lote.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lotes.map((lote) => (
                <LoteCard key={lote.id} lote={lote} onUpdate={fetchLotes} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Componente para exibir um card de lote
function LoteCard({ lote, onUpdate }: { lote: MtfDiamanteLote, onUpdate: () => void }) {
  const handleToggleActive = async () => {
    try {
      const response = await fetch(`/api/admin/mtf-diamante/lotes/${lote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !lote.isActive }),
      });

      if (response.ok) {
        toast.success('Status do lote atualizado!');
        onUpdate();
      } else {
        throw new Error('Erro ao atualizar status');
      }
    } catch (error) {
      toast.error('Erro ao atualizar status do lote');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este lote?')) return;

    try {
      const response = await fetch(`/api/admin/mtf-diamante/lotes/${lote.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Lote excluído com sucesso!');
        onUpdate();
      } else {
        throw new Error('Erro ao excluir lote');
      }
    } catch (error) {
      toast.error('Erro ao excluir lote');
    }
  };

  return (
    <Card className={cn("transition-all", lote.isActive ? "border-green-200 bg-green-50/50" : "border-gray-200 bg-gray-50/50")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">Lote {lote.numero}</span>
                <span className="text-sm text-gray-500">•</span>
                <span className="font-medium">{lote.nome}</span>
              </div>
              <div className="text-lg font-bold text-green-600">{lote.valor}</div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>Início: {format(new Date(lote.dataInicio), 'dd/MM/yyyy', { locale: ptBR })}</span>
              <span>•</span>
              <span>Fim: {format(new Date(lote.dataFim), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor={`active-${lote.id}`} className="text-sm">Ativo</Label>
              <Switch
                id={`active-${lote.id}`}
                checked={lote.isActive}
                onCheckedChange={handleToggleActive}
              />
            </div>
            <EditarLoteDialog lote={lote} onLoteAtualizado={onUpdate} />
            <Button variant="ghost" size="icon" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Componente para adicionar novo lote
function AdicionarLoteDialog({ onLoteAdicionado }: { onLoteAdicionado: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    numero: 1,
    nome: '',
    valor: '',
    dataInicio: new Date(),
    dataFim: new Date(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/mtf-diamante/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success('Lote adicionado com sucesso!');
        onLoteAdicionado();
        setOpen(false);
        setFormData({
          numero: 1,
          nome: '',
          valor: '',
          dataInicio: new Date(),
          dataFim: new Date(),
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao adicionar lote');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Lote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Novo Lote</DialogTitle>
          <DialogDescription>
            Configure um novo lote para ser usado nas mensagens interativas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero">Número do Lote</Label>
              <Input
                id="numero"
                type="number"
                min="1"
                value={formData.numero}
                onChange={(e) => setFormData(prev => ({ ...prev, numero: parseInt(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                value={formData.valor}
                onChange={(e) => setFormData(prev => ({ ...prev, valor: e.target.value }))}
                placeholder="R$ 287,90"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nome">Nome do Lote</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Primeiro Lote, Lote Premium"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataInicio && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataInicio ? format(formData.dataInicio, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataInicio}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataInicio: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Data de Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataFim && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataFim ? format(formData.dataFim, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataFim}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataFim: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Adicionar Lote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Componente para editar lote existente
function EditarLoteDialog({ lote, onLoteAtualizado }: { lote: MtfDiamanteLote, onLoteAtualizado: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    numero: lote.numero,
    nome: lote.nome,
    valor: lote.valor,
    dataInicio: new Date(lote.dataInicio),
    dataFim: new Date(lote.dataFim),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/mtf-diamante/lotes/${lote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success('Lote atualizado com sucesso!');
        onLoteAtualizado();
        setOpen(false);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao atualizar lote');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Edit className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Lote</DialogTitle>
          <DialogDescription>
            Atualize as informações do lote.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero">Número do Lote</Label>
              <Input
                id="numero"
                type="number"
                min="1"
                value={formData.numero}
                onChange={(e) => setFormData(prev => ({ ...prev, numero: parseInt(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                value={formData.valor}
                onChange={(e) => setFormData(prev => ({ ...prev, valor: e.target.value }))}
                placeholder="R$ 287,90"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nome">Nome do Lote</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Primeiro Lote, Lote Premium"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataInicio && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataInicio ? format(formData.dataInicio, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataInicio}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataInicio: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Data de Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataFim && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataFim ? format(formData.dataFim, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataFim}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataFim: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Atualizar Lote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ConfiguracoesLoteTab;