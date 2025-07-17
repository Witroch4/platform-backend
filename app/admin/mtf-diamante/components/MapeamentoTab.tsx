'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { TrashIcon, PencilIcon } from 'lucide-react';

interface MapeamentoTabProps {
  caixaId: string;
}

interface Mapeamento {
  id: string;
  intentName: string;
  templateId?: string | null;
  mensagemInterativaId?: string | null;
  template?: { id: string; name: string };
  mensagemInterativa?: { id: string; nome: string };
}

interface Template {
  id: string;
  name: string;
}

interface MensagemInterativa {
  id: string;
  nome: string;
}

const MapeamentoTab = ({ caixaId }: MapeamentoTabProps) => {
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [mensagens, setMensagens] = useState<MensagemInterativa[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [id, setId] = useState<string | null>(null);
  const [intentName, setIntentName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedMensagem, setSelectedMensagem] = useState<string | null>(null);

  const fetchData = async () => {
    if (!caixaId) return;
    try {
      setLoading(true);
      const [mapResponse, msgResponse, templateResponse] = await Promise.all([
        fetch(`/api/admin/mtf-diamante/mapeamentos/${caixaId}`),
        fetch(`/api/admin/mtf-diamante/mensagens-interativas/${caixaId}`),
        fetch(`/api/admin/mtf-diamante/templates/${caixaId}`),
      ]);

      if (!mapResponse.ok) throw new Error('Falha ao buscar mapeamentos.');
      if (!msgResponse.ok) throw new Error('Falha ao buscar mensagens interativas.');
      if (!templateResponse.ok) throw new Error('Falha ao buscar templates.');

      const mapData = await mapResponse.json();
      const msgData = await msgResponse.json();
      const templateData = await templateResponse.json();

      setMapeamentos(mapData);
      setMensagens(msgData);
      setTemplates(templateData);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [caixaId]);

  const resetForm = () => {
    setId(null);
    setIntentName('');
    setSelectedTemplate(null);
    setSelectedMensagem(null);
  };

  const handleEdit = (mapeamento: Mapeamento) => {
    setId(mapeamento.id);
    setIntentName(mapeamento.intentName);
    setSelectedTemplate(mapeamento.templateId || null);
    setSelectedMensagem(mapeamento.mensagemInterativaId || null);
  };

  const handleDelete = async (mappingId: string) => {
    if (!confirm('Tem certeza que deseja excluir este mapeamento?')) return;
    try {
      const response = await fetch(`/api/admin/mtf-diamante/mapeamentos/${mappingId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao excluir mapeamento.');
      }
      toast.success('Mapeamento excluído com sucesso!');
      fetchData(); // Refresh
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/admin/mtf-diamante/mapeamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          intentName,
          templateId: selectedTemplate,
          mensagemInterativaId: selectedMensagem,
          caixaId, // Adicionado caixaId ao body
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Falha ao salvar mapeamento.`);
      }
      toast.success('Mapeamento salvo com sucesso!');
      resetForm();
      fetchData();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{id ? 'Editar Mapeamento' : 'Novo Mapeamento de Intenção'}</CardTitle>
        <CardDescription>
          Associe uma intenção do Dialogflow a uma resposta automática (template ou mensagem interativa).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg">
          <Input
            placeholder="Nome da Intenção (ex: Default Welcome Intent)"
            value={intentName}
            onChange={(e) => setIntentName(e.target.value)}
            required
          />
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Label>Responder com Template</Label>
              <Select
                onValueChange={(value) => { setSelectedTemplate(value); setSelectedMensagem(null); }}
                value={selectedTemplate || ''}
                disabled={!!selectedMensagem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm font-medium self-end pb-2">OU</span>
            <div className="flex-1">
              <Label>Responder com Mensagem Interativa</Label>
              <Select
                onValueChange={(value) => { setSelectedMensagem(value); setSelectedTemplate(null); }}
                value={selectedMensagem || ''}
                disabled={!!selectedTemplate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma Mensagem" />
                </SelectTrigger>
                <SelectContent>
                  {mensagens.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit">{id ? 'Atualizar' : 'Salvar'} Mapeamento</Button>
            {id && <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>}
          </div>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Intenção</TableHead>
              <TableHead>Resposta Associada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mapeamentos.map((map) => (
              <TableRow key={map.id}>
                <TableCell className="font-medium">{map.intentName}</TableCell>
                <TableCell>
                  {map.template ? (
                    <span className="text-xs font-semibold bg-blue-100 text-blue-800 p-1 rounded">
                      TEMPLATE: {map.template.name}
                    </span>
                  ) : ''}
                  {map.mensagemInterativa ? (
                    <span className="text-xs font-semibold bg-green-100 text-green-800 p-1 rounded">
                      MENSAGEM: {map.mensagemInterativa.nome}
                    </span>
                  ) : ''}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(map)}>
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(map.id)}>
                    <TrashIcon className="h-4 w-4 text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default MapeamentoTab;