'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

interface Inbox {
  id: string;
  name: string;
  channel_type: string;
}

interface IntegracaoDialogflow {
  id: string;
  nome: string;
  chatwitAccountId: string; // Mudança de accountId para chatwitAccountId
  projectId: string;
  credentials: string;
  region: string;
  inboxId?: string;
  inboxName?: string;
  hookId?: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export function DialogflowIntegrations() {
  const [integracoes, setIntegracoes] = useState<IntegracaoDialogflow[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingIntegracao, setEditingIntegracao] = useState<IntegracaoDialogflow | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    chatwitAccountId: '', // Mudança de accountId para chatwitAccountId
    projectId: '',
    credentials: '',
    region: 'global',
    inboxId: '',
  });

  useEffect(() => {
    fetchIntegracoes();
    fetchInboxes();
    fetchConfig(); // Buscar configuração para preencher chatwitAccountId
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get('/api/admin/dialogflow/config');
      if (response.data.config?.chatwitAccountId) {
        setFormData(prev => ({
          ...prev,
          chatwitAccountId: response.data.config.chatwitAccountId
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
    }
  };

  const fetchIntegracoes = async () => {
    try {
      const response = await axios.get('/api/admin/dialogflow/integracoes');
      setIntegracoes(response.data.integracoes || []);
    } catch (error) {
      console.error('Erro ao buscar integrações:', error);
      toast.error('Erro ao carregar integrações');
    } finally {
      setLoading(false);
    }
  };

  const fetchInboxes = async () => {
    try {
      const response = await axios.get('/api/admin/dialogflow/inboxes');
      setInboxes(response.data.inboxes || []);
    } catch (error) {
      console.error('Erro ao buscar caixas de entrada:', error);
      toast.error('Erro ao carregar caixas de entrada');
    }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.chatwitAccountId || !formData.projectId || !formData.credentials) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSaving(true);
      
      const selectedInbox = inboxes.find(inbox => inbox.id === formData.inboxId);
      const payload = {
        ...formData,
        accountId: formData.chatwitAccountId, // Mapear para accountId na API
        inboxName: selectedInbox?.name,
        id: editingIntegracao?.id
      };

      if (editingIntegracao) {
        await axios.put(`/api/admin/dialogflow/integracoes/${editingIntegracao.id}`, payload);
        toast.success('Integração atualizada com sucesso');
      } else {
        await axios.post('/api/admin/dialogflow/integracoes', payload);
        toast.success('Integração criada com sucesso');
      }

      setShowDialog(false);
      setEditingIntegracao(null);
      setFormData({
        nome: '',
        chatwitAccountId: '',
        projectId: '',
        credentials: '',
        region: 'global',
        inboxId: '',
      });
      fetchIntegracoes();
    } catch (error: any) {
      console.error('Erro ao salvar integração:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar integração');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (integracao: IntegracaoDialogflow) => {
    setEditingIntegracao(integracao);
    setFormData({
      nome: integracao.nome,
      chatwitAccountId: integracao.chatwitAccountId || '', // Usar chatwitAccountId
      projectId: integracao.projectId,
      credentials: integracao.credentials,
      region: integracao.region,
      inboxId: integracao.inboxId || '',
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta integração?')) return;

    try {
      console.log('🗑️ Excluindo integração:', id);
      const response = await axios.delete(`/api/admin/dialogflow/integracoes?id=${id}`);
      console.log('✅ Integração excluída com sucesso:', response.data);
      toast.success('Integração excluída com sucesso');
      fetchIntegracoes();
    } catch (error: any) {
      console.error('❌ Erro ao excluir integração:', error);
      toast.error(error.response?.data?.error || 'Erro ao excluir integração');
    }
  };

  const handleToggleActive = async (id: string, ativo: boolean) => {
    try {
      console.log('🔄 Alterando status da integração:', id, 'para:', !ativo);
      const response = await axios.patch(`/api/admin/dialogflow/integracoes/${id}/toggle`);
      console.log('✅ Status alterado com sucesso:', response.data);
      toast.success(response.data.message || (!ativo ? 'Integração ativada' : 'Integração desativada'));
      fetchIntegracoes();
    } catch (error: any) {
      console.error('❌ Erro ao alterar status:', error);
      toast.error(error.response?.data?.error || 'Erro ao alterar status');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Integrações Configuradas</h3>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nova Integração
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingIntegracao ? 'Editar Integração' : 'Nova Integração Dialogflow'}
              </DialogTitle>
              <DialogDescription>
                Configure uma nova integração com o Dialogflow
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome da Integração</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Integração Principal"
                />
              </div>

              <div>
                <Label htmlFor="accountId">ID da Conta Chatwit</Label>
                <Input
                  id="accountId"
                  value={formData.chatwitAccountId}
                  onChange={(e) => setFormData({ ...formData, chatwitAccountId: e.target.value })}
                  placeholder="Ex: 3"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Encontre na URL: https://chatwit.witdev.com.br/app/accounts/[ID]
                  {formData.chatwitAccountId && (
                    <span className="block text-green-600">
                      ✓ ID configurado: {formData.chatwitAccountId}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <Label htmlFor="projectId">Dialogflow Project ID</Label>
                <Input
                  id="projectId"
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  placeholder="Ex: meu-projeto-dialogflow"
                />
              </div>

              <div>
                <Label htmlFor="credentials">Dialogflow Project Key File</Label>
                <Textarea
                  id="credentials"
                  value={formData.credentials}
                  onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                  placeholder="Cole aqui o conteúdo do arquivo JSON de credenciais"
                  rows={6}
                />
              </div>

              <div>
                <Label htmlFor="region">Dialogflow Region</Label>
                <Select
                  value={formData.region}
                  onValueChange={(value) => setFormData({ ...formData, region: value })}
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

              <div>
                <Label htmlFor="inboxId">Selecionar Caixa de Entrada</Label>
                <Select
                  value={formData.inboxId}
                  onValueChange={(value) => setFormData({ ...formData, inboxId: value })}
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
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {integracoes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Nenhuma integração configurada</p>
            </CardContent>
          </Card>
        ) : (
          integracoes.map((integracao) => (
            <Card key={integracao.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {integracao.nome}
                      <Badge variant={integracao.ativo ? 'default' : 'secondary'}>
                        {integracao.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Projeto: {integracao.projectId} | Conta: {integracao.chatwitAccountId}
                      {integracao.inboxName && ` | Caixa: ${integracao.inboxName}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(integracao.id, !integracao.ativo)}
                    >
                      <Power className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(integracao)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(integracao.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Região:</span> {integracao.region}
                  </div>
                  <div>
                    <span className="font-medium">Hook ID:</span> {integracao.hookId || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Criado em:</span> {new Date(integracao.createdAt).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Atualizado em:</span> {new Date(integracao.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
} 