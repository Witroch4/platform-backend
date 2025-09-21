"use client";
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Link2, FileText, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Assistant = { id: string; name: string };
type DocumentItem = { id: string; title: string; sourceUrl?: string | null; assistantId?: string | null; createdAt: string };

export default function CaptainDocumentsPage() {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | 'all'>('all');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', sourceUrl: '', contentText: '', assistantId: '' });

  async function loadAssistants() {
    const r = await fetch('/api/admin/ai-integration/assistants', { cache: 'no-store' });
    const j = await r.json();
    setAssistants(j?.assistants || []);
  }

  async function loadDocuments() {
    const url = selectedAssistantId === 'all' ? '/api/admin/ai-integration/documents' : `/api/admin/ai-integration/documents?assistantId=${selectedAssistantId}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    setDocuments(j?.documents || []);
  }

  useEffect(() => {
    loadAssistants();
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [selectedAssistantId]);

  async function handleCreate() {
    const payload = {
      title: form.title,
      sourceUrl: form.sourceUrl || undefined,
      contentText: form.contentText || undefined,
      assistantId: form.assistantId || undefined,
    };
    const r = await fetch('/api/admin/ai-integration/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) {
      setOpen(false);
      setForm({ title: '', sourceUrl: '', contentText: '', assistantId: '' });
      await loadDocuments();
    }
  }

  async function handleDelete(id: string) {
    const r = await fetch(`/api/admin/ai-integration/documents?id=${id}`, { method: 'DELETE' });
    if (r.ok) loadDocuments();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/captain.png" alt="Capitão" width={48} height={48} />
          <div>
            <h2 className="text-xl font-semibold">Documentos</h2>
            <p className="text-sm text-muted-foreground">Cadastre guias/URLs para alimentar o conhecimento dos assistentes.</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button ><Plus className="w-4 h-4 mr-2" /> Criar um novo documento</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl w-[96vw] max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Criar documento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Título</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título do documento" />
              </div>
              <div>
                <label className="text-sm font-medium">URL (opcional)</label>
                <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="text-sm font-medium">Conteúdo (opcional)</label>
                <Textarea value={form.contentText} onChange={(e) => setForm({ ...form, contentText: e.target.value })} placeholder="Cole aqui o texto relevante" rows={6} />
              </div>
              <div>
                <label className="text-sm font-medium">Assistente (opcional)</label>
                <select className="w-full border rounded h-9 px-2" value={form.assistantId} onChange={(e) => setForm({ ...form, assistantId: e.target.value })}>
                  <option value="">Todos</option>
                  {assistants.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={!form.title}>Criar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm">Assistente:</label>
        <select className="border rounded h-9 px-2" value={selectedAssistantId} onChange={(e) => setSelectedAssistantId(e.target.value as any)}>
          <option value="all">Todos</option>
          {assistants.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3">
        {documents.length === 0 ? (
          <div className="text-center py-16 border rounded-md">
            <p className="mb-4 text-lg font-medium">Nenhum documento disponível</p>
            <p className="text-sm text-muted-foreground mb-6">Os documentos são usados pelo seu assistente para gerar respostas.</p>
            <Button onClick={() => setOpen(true)} ><Plus className="w-4 h-4 mr-2" /> Criar um novo documento</Button>
          </div>
        ) : (
          documents.map((d) => (
            <div key={d.id} className="border rounded-md p-4 flex items-start justify-between">
              <div>
                <h3 className="font-medium flex items-center gap-2"><FileText className="w-4 h-4" /> {d.title}</h3>
                {d.sourceUrl && (
                  <a className="text-xs text-blue-600 inline-flex items-center gap-1" href={d.sourceUrl} target="_blank" rel="noreferrer">
                    <Link2 className="w-3 h-3" /> {d.sourceUrl}
                  </a>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDelete(d.id)} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir
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


