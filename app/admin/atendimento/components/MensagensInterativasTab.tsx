'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrashIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';

interface MensagensInterativasTabProps {
  caixaId: string;
}

interface Botao {
  id?: string;
  titulo: string;
}

interface Mensagem {
  id: string;
  nome: string;
  texto: string;
  headerTipo?: string | null;
  headerConteudo?: string | null;
  rodape?: string | null;
  botoes: Botao[];
}

const MensagensInterativasTab = ({ caixaId }: MensagensInterativasTabProps) => {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [id, setId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [headerTipo, setHeaderTipo] = useState<string | null>(null);
  const [headerConteudo, setHeaderConteudo] = useState('');
  const [rodape, setRodape] = useState('');
  const [botoes, setBotoes] = useState<Botao[]>([{ titulo: '' }]);

  const fetchMensagens = async () => {
    if (!caixaId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/atendimento/mensagens-interativas/${caixaId}`);
      if (!response.ok) throw new Error('Falha ao buscar mensagens.');
      const data = await response.json();
      setMensagens(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMensagens();
  }, [caixaId]);

  const resetForm = () => {
    setId(null);
    setNome('');
    setTexto('');
    setHeaderTipo(null);
    setHeaderConteudo('');
    setRodape('');
    setBotoes([{ titulo: '' }]);
  };

  const handleEdit = (msg: Mensagem) => {
    setId(msg.id);
    setNome(msg.nome);
    setTexto(msg.texto);
    setHeaderTipo(msg.headerTipo || null);
    setHeaderConteudo(msg.headerConteudo || '');
    setRodape(msg.rodape || '');
    setBotoes(msg.botoes.length > 0 ? msg.botoes.map(b => ({...b})) : [{ titulo: '' }]);
  };

  const handleDelete = async (mensagemId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta mensagem?')) return;
    try {
      const response = await fetch(`/api/admin/atendimento/mensagens-interativas/${mensagemId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao excluir mensagem.');
      }
      toast.success('Mensagem excluída com sucesso!');
      fetchMensagens();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleBotaoChange = (index: number, value: string) => {
    const novosBotoes = [...botoes];
    novosBotoes[index].titulo = value;
    setBotoes(novosBotoes);
  };

  const addBotao = () => {
    if (botoes.length < 3) {
      setBotoes([...botoes, { titulo: '' }]);
    }
  };

  const removeBotao = (index: number) => {
    if (botoes.length > 1) {
        const novosBotoes = botoes.filter((_, i) => i !== index);
        setBotoes(novosBotoes);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/admin/atendimento/mensagens-interativas/${caixaId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id, 
            nome, 
            texto, 
            headerTipo, 
            headerConteudo, 
            rodape, 
            botoes: botoes.filter(b => b.titulo) 
          })
      });

      if (response.ok) {
          toast.success(`Mensagem ${id ? 'atualizada' : 'salva'} com sucesso!`);
          resetForm();
          fetchMensagens();
      } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha ao salvar mensagem.');
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>{id ? 'Editar Mensagem' : 'Nova Mensagem Interativa'}</CardTitle>
                <CardDescription>Crie ou edite uma mensagem com botões de resposta.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input placeholder="Nome da Mensagem (ex: Menu Principal)" value={nome} onChange={e => setNome(e.target.value)} required />
                    <Textarea placeholder="Corpo da mensagem..." value={texto} onChange={e => setTexto(e.target.value)} required />
                    <Select onValueChange={v => setHeaderTipo(v === 'null' ? null : v)} value={headerTipo || 'null'}>
                        <SelectTrigger><SelectValue placeholder="Tipo de Cabeçalho (Opcional)" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="null">Nenhum</SelectItem>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="image">Imagem</SelectItem>
                        </SelectContent>
                    </Select>
                    {headerTipo && <Input placeholder={headerTipo === 'text' ? "Texto do cabeçalho" : "URL da Imagem"} value={headerConteudo} onChange={e => setHeaderConteudo(e.target.value)} />}
                    <Input placeholder="Rodapé (Opcional)" value={rodape} onChange={e => setRodape(e.target.value)} />
                    
                    <div>
                        <label className="text-sm font-medium">Botões (até 3)</label>
                        {botoes.map((botao, index) => (
                            <div key={index} className="flex items-center space-x-2 mt-2">
                                <Input placeholder={`Título do Botão ${index + 1}`} value={botao.titulo} onChange={e => handleBotaoChange(index, e.target.value)} required/>
                                {botoes.length > 1 && <Button type="button" variant="destructive" size="icon" onClick={() => removeBotao(index)}><TrashIcon className="h-4 w-4" /></Button>}
                            </div>
                        ))}
                        {botoes.length < 3 && <Button type="button" variant="outline" size="sm" onClick={addBotao} className="mt-2">Adicionar Botão</Button>}
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit">{id ? 'Atualizar' : 'Salvar'} Mensagem</Button>
                      {id && <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>}
                    </div>
                </form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Mensagens Salvas</CardTitle>
            </CardHeader>
            <CardContent>
                {loading && <p>Carregando...</p>}
                <div className="space-y-2">
                    {mensagens.map(msg => (
                        <div key={msg.id} className="border p-3 rounded-md flex justify-between items-center">
                            <span className="font-medium">{msg.nome}</span>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(msg)}><PencilIcon className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(msg.id)}><TrashIcon className="h-4 w-4 text-red-500" /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    </div>
  );
};

export default MensagensInterativasTab;