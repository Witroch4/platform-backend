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
import { Loader2, Plus, Trash2, Settings, Bot, Inbox, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

interface Inbox {
  id: string;
  name: string;
  channel_type: string;
}

interface AgenteDialogflow {
  id: string;
  nome: string;
  projectId: string;
  region: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CaixaEntrada {
  id: string;
  nome: string;
  chatwitAccountId: string; // Mudança de accountId para chatwitAccountId
  inboxId: string;
  inboxName: string;
  channelType: string;
  agentes: AgenteDialogflow[];
  createdAt: string;
  updatedAt: string;
}

export function DialogflowCaixasAgentes() {
  const [caixas, setCaixas] = useState<CaixaEntrada[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Estados para configuração do Chatwit
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configData, setConfigData] = useState({
    chatwitAccountId: '',
    chatwitAccessToken: '',
  });
  
  // Estados para caixas
  const [showCaixaDialog, setShowCaixaDialog] = useState(false);
  const [caixaFormData, setCaixaFormData] = useState({
    nome: '',
    chatwitAccountId: '', // Mudança de accountId para chatwitAccountId
    inboxId: '',
  });

  // Estados para agentes
  const [showAgenteDialog, setShowAgenteDialog] = useState(false);
  const [selectedCaixaId, setSelectedCaixaId] = useState<string>('');
  const [agenteFormData, setAgenteFormData] = useState({
    nome: '',
    projectId: '',
    credentials: '',
    region: 'global',
  });

  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    fetchCaixas();
    fetchInboxes();
    fetchConfig();
  }, []);

  const fetchCaixas = async () => {
    try {
      const response = await axios.get('/api/admin/dialogflow/caixas');
      setCaixas(response.data.caixas || []);
    } catch (error) {
      console.error('Erro ao buscar caixas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInboxes = async () => {
    try {
      const response = await axios.get('/api/admin/dialogflow/inboxes');
      setInboxes(response.data.inboxes || []);
    } catch (error) {
      console.error('Erro ao buscar inboxes:', error);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await axios.get('/api/admin/dialogflow/config');
      if (response.data.config?.chatwitAccountId) {
        setCaixaFormData(prev => ({
          ...prev,
          chatwitAccountId: response.data.config.chatwitAccountId
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (!configData.chatwitAccountId || !configData.chatwitAccessToken) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSaving(true);
      
      await axios.post('/api/admin/dialogflow/config', configData);
      toast.success('Configuração salva com sucesso');

      setShowConfigDialog(false);
      fetchInboxes(); // Recarregar inboxes com nova configuração
    } catch (error: any) {
      console.error('Erro ao salvar configuração:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCaixa = async () => {
    if (!caixaFormData.nome || !caixaFormData.chatwitAccountId || !caixaFormData.inboxId) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSaving(true);
      
      const selectedInbox = inboxes.find(inbox => inbox.id === caixaFormData.inboxId);
      const payload = {
        ...caixaFormData,
        accountId: caixaFormData.chatwitAccountId, // Mapear para accountId na API
        inboxName: selectedInbox?.name,
        channelType: selectedInbox?.channel_type,
      };

      await axios.post('/api/admin/dialogflow/caixas', payload);
      toast.success('Caixa configurada com sucesso');

      setShowCaixaDialog(false);
      setCaixaFormData({
        nome: '',
        chatwitAccountId: '',
        inboxId: '',
      });
      fetchCaixas();
    } catch (error: any) {
      console.error('Erro ao salvar caixa:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar caixa');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgente = async () => {
    if (!agenteFormData.nome || !agenteFormData.projectId || !agenteFormData.credentials) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        ...agenteFormData,
        caixaId: selectedCaixaId,
      };

      await axios.post('/api/admin/dialogflow/agentes', payload);
      toast.success('Agente criado com sucesso');

      setShowAgenteDialog(false);
      setAgenteFormData({
        nome: '',
        projectId: '',
        credentials: '',
        region: 'global',
      });
      fetchCaixas();
    } catch (error: any) {
      console.error('Erro ao salvar agente:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar agente');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCaixa = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta caixa? Todos os agentes serão removidos.')) return;

    try {
      await axios.delete(`/api/admin/dialogflow/caixas?id=${id}`);
      toast.success('Caixa excluída com sucesso');
      fetchCaixas();
    } catch (error: any) {
      console.error('Erro ao excluir caixa:', error);
      toast.error(error.response?.data?.error || 'Erro ao excluir caixa');
    }
  };

  const handleDeleteAgente = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este agente?')) return;

    try {
      await axios.delete(`/api/admin/dialogflow/agentes?id=${id}`);
      toast.success('Agente excluído com sucesso');
      fetchCaixas();
    } catch (error: any) {
      console.error('Erro ao excluir agente:', error);
      toast.error(error.response?.data?.error || 'Erro ao excluir agente');
    }
  };

  const handleToggleAgente = async (id: string, ativo: boolean) => {
    try {
      console.log('🔄 Alterando status do agente:', id, 'para:', !ativo);
      const response = await axios.patch(`/api/admin/dialogflow/agentes/${id}/toggle`);
      console.log('✅ Status alterado com sucesso:', response.data);
      toast.success(response.data.message || (!ativo ? 'Agente ativado' : 'Agente desativado'));
      fetchCaixas();
    } catch (error: any) {
      console.error('❌ Erro ao alterar status:', error);
      toast.error(error.response?.data?.error || 'Erro ao alterar status');
    }
  };

  const openAgenteDialog = (caixaId: string) => {
    setSelectedCaixaId(caixaId);
    setShowAgenteDialog(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Caixas de Entrada e Agentes Dialogflow</h3>
        <div className="flex gap-2">
          <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Configurar Chatwit
              </Button>
            </DialogTrigger>
          </Dialog>
          <Dialog open={showCaixaDialog} onOpenChange={setShowCaixaDialog}>
            <DialogTrigger asChild>
              <Button>
                <Inbox className="w-4 h-4 mr-2" />
                Nova Caixa
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Configurar Nova Caixa de Entrada</DialogTitle>
              <DialogDescription>
                Configure uma caixa de entrada para receber agentes Dialogflow
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome da Configuração</Label>
                <Input
                  id="nome"
                  value={caixaFormData.nome}
                  onChange={(e) => setCaixaFormData({ ...caixaFormData, nome: e.target.value })}
                  placeholder="Ex: WhatsApp Principal"
                />
              </div>

              <div>
                <Label htmlFor="accountId">ID da Conta Chatwit</Label>
                <Input
                  id="accountId"
                  value={caixaFormData.chatwitAccountId}
                  onChange={(e) => setCaixaFormData({ ...caixaFormData, chatwitAccountId: e.target.value })}
                  placeholder="Ex: 3"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Encontre na URL: https://chatwit.witdev.com.br/app/accounts/[ID]
                  {caixaFormData.chatwitAccountId && (
                    <span className="block text-green-600">
                      ✓ ID configurado: {caixaFormData.chatwitAccountId}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <Label htmlFor="inboxId">Selecionar Caixa de Entrada</Label>
                <Select
                  value={caixaFormData.inboxId}
                  onValueChange={(value) => setCaixaFormData({ ...caixaFormData, inboxId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma caixa de entrada" />
                  </SelectTrigger>
                  <SelectContent>
                    {inboxes.map((inbox) => (
                      <SelectItem key={inbox.id} value={inbox.id}>
                        {inbox.name} ({inbox.channel_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCaixaDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveCaixa} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Caixa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Lista de Caixas */}
      <div className="grid gap-6">
        {caixas.map((caixa) => (
          <Card key={caixa.id} className="border-2">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Inbox className="w-5 h-5" />
                    {caixa.nome}
                  </CardTitle>
                  <CardDescription>
                    {caixa.inboxName} ({caixa.channelType}) - Conta: {caixa.chatwitAccountId}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAgenteDialog(caixa.id)}
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    Adicionar Agente
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteCaixa(caixa.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {caixa.agentes.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum agente configurado. Clique em "Adicionar Agente" para começar.
                </p>
              ) : (
                <div className="space-y-3">
                  {caixa.agentes.map((agente) => (
                    <div key={agente.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Bot className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="font-medium">{agente.nome}</div>
                          <div className="text-sm text-muted-foreground">
                            Projeto: {agente.projectId} | Região: {agente.region}
                          </div>
                        </div>
                        {agente.ativo && (
                          <Badge variant="default" className="bg-green-500">
                            Ativo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`switch-${agente.id}`} className="text-sm">
                            {agente.ativo ? 'Ativo' : 'Inativo'}
                          </Label>
                          <Switch
                            id={`switch-${agente.id}`}
                            checked={agente.ativo}
                            onCheckedChange={() => handleToggleAgente(agente.id, agente.ativo)}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteAgente(agente.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog para Configuração do Chatwit */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar Acesso ao Chatwit</DialogTitle>
            <DialogDescription>
              Configure suas credenciais de acesso ao Chatwit para buscar as caixas de entrada
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="chatwitAccountId">ID da Conta Chatwit</Label>
              <Input
                id="chatwitAccountId"
                value={configData.chatwitAccountId}
                onChange={(e) => setConfigData({ ...configData, chatwitAccountId: e.target.value })}
                placeholder="Ex: 3"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Encontre na URL: https://chatwit.witdev.com.br/app/accounts/[ID]
              </p>
            </div>

            <div>
              <Label htmlFor="chatwitAccessToken">Token de Acesso Chatwit</Label>
              <div className="relative">
                <Input
                  id="chatwitAccessToken"
                  type={showToken ? "text" : "password"}
                  value={configData.chatwitAccessToken}
                  onChange={(e) => setConfigData({ ...configData, chatwitAccessToken: e.target.value })}
                  placeholder="Seu token de acesso do Chatwit"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  tabIndex={-1}
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? 'Ocultar token' : 'Exibir token'}
                >
                  {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Encontre em: Configurações → Integrações → API Access Token
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Agente */}
      <Dialog open={showAgenteDialog} onOpenChange={setShowAgenteDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Agente Dialogflow</DialogTitle>
            <DialogDescription>
              Configure um novo agente Dialogflow para esta caixa de entrada
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="nomeAgente">Nome do Agente</Label>
              <Input
                id="nomeAgente"
                value={agenteFormData.nome}
                onChange={(e) => setAgenteFormData({ ...agenteFormData, nome: e.target.value })}
                placeholder="Ex: Agente Principal"
              />
            </div>

            <div>
              <Label htmlFor="projectId">Dialogflow Project ID</Label>
              <Input
                id="projectId"
                value={agenteFormData.projectId}
                onChange={(e) => setAgenteFormData({ ...agenteFormData, projectId: e.target.value })}
                placeholder="Ex: meu-projeto-dialogflow"
              />
            </div>

            <div>
              <Label htmlFor="credentials">Dialogflow Project Key File</Label>
              <Textarea
                id="credentials"
                value={agenteFormData.credentials}
                onChange={(e) => setAgenteFormData({ ...agenteFormData, credentials: e.target.value })}
                placeholder="Cole aqui o conteúdo do arquivo JSON de credenciais"
                rows={6}
              />
            </div>

            <div>
              <Label htmlFor="region">Dialogflow Region</Label>
              <Select
                value={agenteFormData.region}
                onValueChange={(value) => setAgenteFormData({ ...agenteFormData, region: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global - Default</SelectItem>
                  <SelectItem value="asia-northeast1">AS-NE1 - Tokyo, Japan</SelectItem>
                  <SelectItem value="australia-southeast1">AU-SE1 - Sydney, Australia</SelectItem>
                  <SelectItem value="europe-west1">EU-W1 - St. Ghislain, Belgium</SelectItem>
                  <SelectItem value="europe-west2">EU-W2 - London, England</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAgenteDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAgente} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 