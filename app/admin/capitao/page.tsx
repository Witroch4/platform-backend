"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal, EllipsisVertical, Plus, Trash2, Settings2, Link2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Assistant = {
  id: string;
  name: string;
  description?: string | null;
  productName?: string | null;
  generateFaqs: boolean;
  captureMemories: boolean;
  createdAt: string;
};

export default function CaptainAssistantsPage() {
  const router = useRouter();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    productName: '',
    generateFaqs: false,
    captureMemories: false,
    instructions: '',
    intentOutputFormat: 'JSON' as 'JSON' | 'AT_SYMBOL',
  });
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  async function loadAssistants() {
    try {
      const res = await fetch('/api/admin/ai-integration/assistants', { cache: 'no-store' });
      const data = await res.json();
      setAssistants(data.assistants || []);
    } catch (error) {
      console.error('Erro ao carregar assistentes:', error);
    } finally {
      setIsInitialLoading(false);
    }
  }

  useEffect(() => {
    loadAssistants();
  }, []);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-integration/assistants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Falha ao criar assistente');
      setOpen(false);
      setForm({ name: '', description: '', productName: '', generateFaqs: false, captureMemories: false, instructions: '', intentOutputFormat: 'JSON' });
      await loadAssistants();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/ai-integration/assistants?id=${id}`, { method: 'DELETE' });
    if (res.ok) loadAssistants();
  }

  // Componente de skeleton para os assistentes
  const AssistantsSkeleton = () => (
    <div className="grid gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-md p-4 flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );

  // Componente de skeleton para o cabeçalho
  const HeaderSkeleton = () => (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="rounded-md border border-dashed p-4 bg-muted/30 flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-9 w-48 rounded-md ml-4" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {isInitialLoading ? (
        <HeaderSkeleton />
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="rounded-md border border-dashed p-4 bg-muted/30 flex items-center gap-4">
              <Image src="/captain.png" alt="Capitão" width={56} height={56} />
              <div className="flex-1">
                <h2 className="text-base font-semibold">Assistentes do Capitão</h2>
                <p className="text-sm text-muted-foreground">
                  O Capitão atende seus clientes automaticamente, aprende com seus documentos e conversas anteriores,
                  responde rápido e com precisão, e faz handoff para um humano quando necessário.
                </p>
              </div>
              <a
                href="/admin/capitao/saiba-mais"
                className="inline-flex items-center text-sm px-3 py-2 rounded-md border bg-background hover:bg-accent"
              >
                Saiba mais
              </a>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Criar um novo assistente</Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-2xl w-[96vw] max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Criar um assistente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input placeholder="Digite o nome do assistente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea placeholder="Digite a descrição do assistente" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Nome do Produto</label>
                <Input placeholder="Digite o nome do produto" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.generateFaqs} onChange={(e) => setForm({ ...form, generateFaqs: e.target.checked })} />
                  Gerar perguntas frequentes a partir de conversas resolvidas
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.captureMemories} onChange={(e) => setForm({ ...form, captureMemories: e.target.checked })} />
                  Capture memórias das interações do cliente
                </label>
              </div>
              <div>
                <label className="text-sm font-medium">Instruções (prompt do assistente)</label>
                <Textarea placeholder="Defina como este assistente deve agir. Ex.: classificar intenção e extrair entidades..." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={6} />
                <p className="text-xs text-muted-foreground mt-1">Este texto será injetado no prompt que decide a intenção e entidades.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Formato de saída da intenção</label>
                <select className="w-full border rounded h-9 px-2" value={form.intentOutputFormat} onChange={(e) => setForm({ ...form, intentOutputFormat: e.target.value as any })}>
                  <option value="JSON">JSON: {`{"intent":{"name":"@pagar_fatura","confidence":0.98},"entities":[...]}`}</option>
                  <option value="AT_SYMBOL">Apenas @intent: @pagar_fatura</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={loading || !form.name}>{loading ? 'Criando...' : 'Criar'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      )}

      <div className="grid gap-3">
        {isInitialLoading ? (
          <AssistantsSkeleton />
        ) : assistants.length === 0 ? (
          <div className="text-center py-16 border rounded-md">
            <p className="mb-2 text-xl font-semibold">Não há assistentes disponíveis</p>
            <p className="text-sm text-muted-foreground mb-6">
              Crie um assistente para responder seus clientes automaticamente. Ele pode aprender com seus documentos
              e conversas anteriores, e transferir para um atendente quando necessário.
            </p>
            <Button onClick={() => setOpen(true)} size="sm"><Plus className="w-4 h-4 mr-2" /> Criar um novo assistente</Button>
          </div>
        ) : (
          assistants.map((a) => (
            <div key={a.id} className="border rounded-md p-4 flex items-start justify-between">
              <div>
                <h3 className="font-medium">{a.name}</h3>
                {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                {a.productName && <p className="text-xs text-muted-foreground mt-1">Produto: {a.productName}</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><EllipsisVertical className="w-4 h-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/admin/capitao/${a.id}`)}>
                    <Settings2 className="w-4 h-4 mr-2" /> Configurar prompt
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`/admin/capitao/${a.id}/inboxes`)}>
                    <Link2 className="w-4 h-4 mr-2" /> Ver caixas associadas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(a.id)} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir agente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

