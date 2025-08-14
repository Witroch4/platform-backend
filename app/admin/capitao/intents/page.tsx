"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Intent = { id: string; name: string; description: string | null; similarityThreshold: number; createdAt: string };

export default function GlobalIntentsPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [similarityThreshold, setThreshold] = useState(0.8);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<Intent | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editThreshold, setEditThreshold] = useState(0.8);

  const load = async () => {
    const r = await fetch('/api/admin/ai-integration/intents', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setIntents(Array.isArray(j?.intents) ? j.intents : []);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/ai-integration/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, similarityThreshold })
      });
      if (r.ok) {
        setName('');
        setDescription('');
        setThreshold(0.8);
        await load();
      }
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/ai-integration/intents?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  };

  const openEdit = (i: Intent) => {
    setEditTarget(i);
    setEditName(i.name);
    setEditDescription(i.description || '');
    setEditThreshold(i.similarityThreshold);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const id = editTarget.id;
    const optimistic: Intent = { ...editTarget, name: editName, description: editDescription || null, similarityThreshold: editThreshold };
    setIntents((prev) => prev.map((x) => (x.id === id ? optimistic : x)));
    setEditing(false);
    try {
      const r = await fetch('/api/admin/ai-integration/intents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName, description: editDescription, similarityThreshold: editThreshold })
      });
      if (!r.ok) {
        await load();
      }
    } catch {
      await load();
    } finally {
      setEditTarget(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <button onClick={() => router.push('/admin/capitao')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
      <div className="border rounded-md">
        <div className="p-4 font-medium">Nova Intenção (Global)</div>
        <div className="p-4 grid grid-cols-1 gap-3">
          <div>
            <label className="text-sm font-medium">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Recurso OAB" />
          </div>
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="descreva a intenção, opções, prazos, termos..." />
          </div>
          <div>
            <label className="text-sm font-medium">Threshold</label>
            <Input type="number" step="0.01" min="0" max="1" value={similarityThreshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={create} disabled={saving || !name.trim()}>Salvar Intenção (IA)</Button>
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <div className="p-4 font-medium">Intenções Cadastradas</div>
        <div className="p-4 divide-y">
          {intents.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma intenção cadastrada.</div>}
          {intents.map((i) => (
            <div key={i.id} className="py-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{i.name}</div>
                {i.description && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{i.description}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">threshold: {i.similarityThreshold}</div>
                <Button variant="secondary" size="sm" onClick={() => openEdit(i)}>Editar</Button>
                <Button variant="destructive" size="sm" onClick={() => remove(i.id)}>Excluir</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={(v) => { if (!v) setEditing(false); }}>
        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Editar Intenção</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Threshold</label>
              <Input type="number" step="0.01" min="0" max="1" value={editThreshold} onChange={(e) => setEditThreshold(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={!editName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


