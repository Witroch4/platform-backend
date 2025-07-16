'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { TrashIcon, PencilIcon } from 'lucide-react';

interface TemplatesTabProps {
  caixaId: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  components: any; 
}

const TemplatesTab = ({ caixaId }: TemplatesTabProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('UTILITY');
  const [bodyText, setBodyText] = useState('');

  const fetchTemplates = async () => {
    if (!caixaId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/atendimento/templates/${caixaId}`);
      if (!response.ok) throw new Error('Falha ao buscar templates.');
      const data = await response.json();
      setTemplates(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [caixaId]);

  const resetForm = () => {
    setId(null);
    setName('');
    setBodyText('');
    setCategory('UTILITY');
  };

  const handleEdit = (template: Template) => {
    setId(template.id);
    setName(template.name);
    setCategory(template.category);
    // Extrai o texto do corpo do template para o formulário
    const bodyComponent = template.components.find((c: any) => c.type === 'BODY');
    setBodyText(bodyComponent ? bodyComponent.text : '');
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      const response = await fetch(`/api/admin/atendimento/templates/${templateId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao excluir template.');
      }
      toast.success('Template excluído com sucesso!');
      fetchTemplates();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const components = [{ type: 'BODY', text: bodyText }];
      const response = await fetch(`/api/admin/atendimento/templates/${caixaId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, category, components })
      });

      if (response.ok) {
          toast.success(`Template ${id ? 'atualizado' : 'salvo'} com sucesso!`);
          resetForm();
          fetchTemplates();
      } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha ao salvar template.');
      }
    } catch (error) {
        toast.error((error as Error).message);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>{id ? 'Editar Template' : 'Novo Template'}</CardTitle>
                <CardDescription>Crie ou edite um template de mensagem do WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input placeholder="Nome do Template (ex: boas_vindas_1)" value={name} onChange={e => setName(e.target.value)} required />
                    <Textarea placeholder="Corpo do template. Use {{1}}, {{2}} para variáveis." value={bodyText} onChange={e => setBodyText(e.target.value)} required rows={5} />
                    <div className="flex gap-2">
                        <Button type="submit">{id ? 'Atualizar' : 'Salvar'} Template</Button>
                        {id && <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>}
                    </div>
                </form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Templates Salvos</CardTitle>
            </CardHeader>
            <CardContent>
                {loading && <p>Carregando...</p>}
                <div className="space-y-2">
                    {templates.map(t => (
                        <div key={t.id} className="border p-3 rounded-md flex justify-between items-center">
                            <span className="font-medium">{t.name}</span>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}><PencilIcon className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><TrashIcon className="h-4 w-4 text-red-500" /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    </div>
  );
};

export default TemplatesTab;