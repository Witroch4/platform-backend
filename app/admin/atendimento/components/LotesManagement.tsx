'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Edit, Trash2, CalendarIcon, Power } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface LoteOab {
  id: string;
  nome: string;
  valor: number;
  valorAnalise: number;
  chavePix: string;
  dataInicio: string;
  dataFim: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export function LotesManagement() {
  const [lotes, setLotes] = useState<LoteOab[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingLote, setEditingLote] = useState<LoteOab | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    valor: '',
    valorAnalise: '',
    chavePix: '',
    dataInicio: new Date(),
    dataFim: new Date(),
  });

  useEffect(() => {
    fetchLotes();
  }, []);

  const fetchLotes = async () => {
    try {
      const response = await axios.get('/api/admin/lotes');
      setLotes(response.data.lotes || []);
    } catch (error) {
      console.error('Erro ao buscar lotes:', error);
      toast.error('Erro ao carregar lotes');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.valor || !formData.valorAnalise || !formData.chavePix) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        ...formData,
        valor: parseFloat(formData.valor.replace('R$', '').replace(',', '.')),
        valorAnalise: parseFloat(formData.valorAnalise.replace('R$', '').replace(',', '.')),
        id: editingLote?.id
      };

      if (editingLote) {
        await axios.put(`/api/admin/lotes/${editingLote.id}`, payload);
        toast.success('Lote atualizado com sucesso');
      } else {
        await axios.post('/api/admin/lotes', payload);
        toast.success('Lote criado com sucesso');
      }

      setShowDialog(false);
      setEditingLote(null);
      setFormData({
        nome: '',
        valor: '',
        valorAnalise: '',
        chavePix: '',
        dataInicio: new Date(),
        dataFim: new Date(),
      });
      fetchLotes();
    } catch (error: any) {
      console.error('Erro ao salvar lote:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar lote');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (lote: LoteOab) => {
    setEditingLote(lote);
    setFormData({
      nome: lote.nome,
      valor: lote.valor.toString(),
      valorAnalise: lote.valorAnalise.toString(),
      chavePix: lote.chavePix,
      dataInicio: new Date(lote.dataInicio),
      dataFim: new Date(lote.dataFim),
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este lote?')) return;

    try {
      await axios.delete(`/api/admin/lotes/${id}`);
      toast.success('Lote excluído com sucesso');
      fetchLotes();
    } catch (error: any) {
      console.error('Erro ao excluir lote:', error);
      toast.error(error.response?.data?.error || 'Erro ao excluir lote');
    }
  };

  const handleToggleActive = async (id: string, ativo: boolean) => {
    try {
      await axios.patch(`/api/admin/lotes/${id}/toggle`, { ativo });
      toast.success(ativo ? 'Lote ativado' : 'Lote desativado');
      fetchLotes();
    } catch (error: any) {
      console.error('Erro ao alterar status:', error);
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
        <h3 className="text-lg font-semibold">Lotes Configurados</h3>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Lote
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingLote ? 'Editar Lote' : 'Novo Lote OAB'}
              </DialogTitle>
              <DialogDescription>
                Configure um novo lote de vendas
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome do Lote</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Lote Premium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="valor">Valor do Lote</Label>
                  <Input
                    id="valor"
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                    placeholder="Ex: 297.90"
                  />
                </div>
                <div>
                  <Label htmlFor="valorAnalise">Valor da Análise</Label>
                  <Input
                    id="valorAnalise"
                    value={formData.valorAnalise}
                    onChange={(e) => setFormData({ ...formData, valorAnalise: e.target.value })}
                    placeholder="Ex: 27.90"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="chavePix">Chave PIX</Label>
                <Input
                  id="chavePix"
                  value={formData.chavePix}
                  onChange={(e) => setFormData({ ...formData, chavePix: e.target.value })}
                  placeholder="Ex: 57944155000101"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de Início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.dataInicio && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dataInicio ? format(formData.dataInicio, "PPP", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.dataInicio}
                        onSelect={(date) => date && setFormData({ ...formData, dataInicio: date })}
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
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.dataFim && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dataFim ? format(formData.dataFim, "PPP", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.dataFim}
                        onSelect={(date) => date && setFormData({ ...formData, dataFim: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lotes.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Nenhum lote configurado</p>
            </CardContent>
          </Card>
        ) : (
          lotes.map((lote) => (
            <Card key={lote.id} className={cn(
              "relative",
              lote.ativo && "ring-2 ring-primary"
            )}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {lote.nome}
                      <Badge variant={lote.ativo ? 'default' : 'secondary'}>
                        {lote.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Valor: R$ {lote.valor.toFixed(2).replace('.', ',')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(lote.id, !lote.ativo)}
                    >
                      <Power className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(lote)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(lote.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Análise:</span> R$ {lote.valorAnalise.toFixed(2).replace('.', ',')}
                  </div>
                  <div>
                    <span className="font-medium">PIX:</span> {lote.chavePix}
                  </div>
                  <div>
                    <span className="font-medium">Período:</span> {format(new Date(lote.dataInicio), "dd/MM/yyyy")} - {format(new Date(lote.dataFim), "dd/MM/yyyy")}
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