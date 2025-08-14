"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus } from 'lucide-react';

type InboxItem = { inboxId: string; name: string; channelType: string; attached: boolean };

export default function AssistantInboxesPage() {
  const params = useParams();
  const router = useRouter();
  const assistantId = String((params as any)?.id || '');
  const [inboxes, setInboxes] = useState<InboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/ai-integration/assistants/inboxes?assistantId=${assistantId}`, { cache: 'no-store' });
      const j = await r.json();
      const list: InboxItem[] = j?.inboxes || [];
      setInboxes(list);
      const sel: Record<string, boolean> = {};
      list.forEach((i) => { sel[i.inboxId] = i.attached; });
      setSelection(sel);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (assistantId) load(); }, [assistantId]);

  const save = async () => {
    for (const i of inboxes) {
      const target = !!selection[i.inboxId];
      if (target !== i.attached) {
        await fetch('/api/admin/ai-integration/assistants/inboxes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assistantId, inboxId: i.inboxId, name: i.name, channelType: i.channelType, attach: target })
        });
      }
    }
    setOpen(false);
    await load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/admin/capitao')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Conectar uma nova caixa de entrada</Button>
          </DialogTrigger>
          <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Conectar caixas ao Capitão</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 overflow-auto max-h-[60vh] pr-2">
              {inboxes.map((i) => (
                <label key={i.inboxId} className="flex items-center gap-3">
                  <Checkbox checked={!!selection[i.inboxId]} onCheckedChange={(v: any) => setSelection((s) => ({ ...s, [i.inboxId]: !!v }))} />
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.channelType} • {i.inboxId}</div>
                  </div>
                </label>
              ))}
              {inboxes.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma inbox encontrada.</div>}
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={loading}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Caixas de entrada conectadas</h2>
        <div className="space-y-2">
          {inboxes.filter(i => i.attached).map((i) => (
            <div key={i.inboxId} className="border rounded p-3 text-sm">{i.name} <span className="text-xs text-muted-foreground">({i.channelType})</span></div>
          ))}
          {inboxes.filter(i => i.attached).length === 0 && (
            <div className="border rounded-md bg-muted/20 py-14 px-6 text-center">
              <h3 className="text-2xl font-semibold mb-2">Caixa de entrada não conectada</h3>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
                Conectar uma caixa de entrada permite ao assistente lidar com perguntas iniciais de seus clientes
                antes de transferi-las para você.
              </p>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Conectar uma nova caixa de entrada
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


