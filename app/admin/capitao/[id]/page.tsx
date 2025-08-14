"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SendHorizonal, ArrowLeft } from 'lucide-react';

type Assistant = {
  id: string;
  name: string;
  description?: string | null;
  productName?: string | null;
  generateFaqs: boolean;
  captureMemories: boolean;
  instructions?: string | null;
  intentOutputFormat: 'JSON' | 'AT_SYMBOL';
  model: string;
};

export default function EditAssistantPage() {
  const params = useParams();
  const router = useRouter();
  const id = String((params as any)?.id || '');

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingInstr, setSavingInstr] = useState(false);
  const [savingFlags, setSavingFlags] = useState(false);

  async function loadAssistant() {
    const r = await fetch(`/api/admin/ai-integration/assistants?id=${id}`, { cache: 'no-store' });
    const j = await r.json();
    if (j?.assistant) setAssistant(j.assistant);
    if (j?.assistant) {
      console.log('[Capitão] Assistente carregado', { id: j.assistant.id, model: j.assistant.model });
    } else {
      console.log('[Capitão] Assistente não encontrado');
    }
  }

  useEffect(() => {
    if (id) loadAssistant();
  }, [id]);

  if (!assistant) return (
    <div className="p-6">
      <div className="text-sm text-muted-foreground">Carregando…</div>
    </div>
  );

  const update = async (patch: Partial<Assistant>) => {
    const body = { id: assistant.id, ...patch } as any;
    const r = await fetch('/api/admin/ai-integration/assistants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) await loadAssistant();
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <button
          onClick={() => router.push('/admin/capitao')}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="border rounded-md">
          <div className="p-4 font-medium">Informações Básicas</div>
          <Separator />
          <div className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={assistant.name} onChange={(e) => setAssistant({ ...assistant, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={assistant.description || ''} onChange={(e) => setAssistant({ ...assistant, description: e.target.value })} rows={6} />
            </div>
            <div>
              <label className="text-sm font-medium">Nome do Produto</label>
              <Input value={assistant.productName || ''} onChange={(e) => setAssistant({ ...assistant, productName: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Modelo (OpenAI)</label>
              <ModelSelector value={assistant.model || 'gpt-4o-mini'} onChange={async (m) => { console.log('[Capitão] Modelo selecionado', m); setAssistant({ ...assistant, model: m }); await update({ model: m }); }} />
            </div>
            <Button disabled={savingBasic} onClick={async () => { setSavingBasic(true); await update({ name: assistant.name, description: assistant.description || null, productName: assistant.productName || null }); setSavingBasic(false); }}>Atualizar</Button>
          </div>
        </div>

        <Collapsible defaultOpen={false} className="border rounded-md">
          <div className="p-4 flex items-center justify-between">
            <div className="font-medium">Instruções</div>
            <CollapsibleTrigger className="text-sm text-muted-foreground hover:underline">Mostrar/Ocultar</CollapsibleTrigger>
          </div>
          <Separator />
          <CollapsibleContent className="p-4 space-y-4">
            <Textarea value={assistant.instructions || ''} onChange={(e) => setAssistant({ ...assistant, instructions: e.target.value })} placeholder={"Exemplo:\nVocê é um assistente que classifica a mensagem do usuário em intenções e extrai entidades. Responda no formato selecionado abaixo.\n\nCategorias:\n@pagar_fatura: ...\n@ver_saldo: ...\n@rastrear_pedido: ...\n@outros_assuntos: ..."} rows={12} />
            <div>
              <label className="text-sm font-medium">Formato de saída da intenção</label>
              <select className="w-full h-9 border rounded px-2" value={assistant.intentOutputFormat} onChange={(e) => setAssistant({ ...assistant, intentOutputFormat: e.target.value as any })}>
                <option value="JSON">JSON: {`{"intent":{"name":"@pagar_fatura","confidence":0.98},"entities":[...]}`}</option>
                <option value="AT_SYMBOL">Apenas @intent: @pagar_fatura</option>
              </select>
            </div>
            <Button disabled={savingInstr} onClick={async () => { setSavingInstr(true); await update({ instructions: assistant.instructions || '', intentOutputFormat: assistant.intentOutputFormat }); setSavingInstr(false); }}>Salvar Instruções</Button>
          </CollapsibleContent>
        </Collapsible>

        <div className="border rounded-md">
          <div className="p-4 font-medium">Funcionalidades</div>
          <Separator />
          <div className="p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={assistant.generateFaqs} onChange={(e) => setAssistant({ ...assistant, generateFaqs: e.target.checked })} />
              Gerar FAQs a partir de conversas resolvidas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={assistant.captureMemories} onChange={(e) => setAssistant({ ...assistant, captureMemories: e.target.checked })} />
              Capturar memórias de interações
            </label>
            <Button disabled={savingFlags} onClick={async () => { setSavingFlags(true); await update({ generateFaqs: assistant.generateFaqs, captureMemories: assistant.captureMemories }); setSavingFlags(false); }}>Salvar</Button>
          </div>
        </div>
      </div>

      <Playground assistantId={assistant.id} model={assistant.model || 'gpt-4o-mini'} instructions={assistant.instructions || ''} />
      </div>
    </div>
  );
}

function Playground({ assistantId, model, instructions }: { assistantId: string; model: string; instructions: string }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: 'user'|'assistant'; content: string }[]>([]);

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setHistory((h) => [...h, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const r = await fetch('/api/chatwitia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: [`Você é o Capitão do assistente ${assistantId}.`, (instructions || '').trim()].filter(Boolean).join('\n\n') },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: text }
          ],
          model,
          stream: true,
          captainPlayground: true
        })
      });
      if (!r.ok || !r.body) throw new Error('sem corpo');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assembled = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const evt = JSON.parse(trimmed);
            if (evt.type === 'chunk' && typeof evt.content === 'string') {
              assembled += evt.content;
            } else if (evt.type === 'done') {
              if (!assembled && evt.response?.content) assembled = evt.response.content;
            }
          } catch {}
        }
      }
      setHistory((h) => [...h, { role: 'assistant', content: assembled || '(sem conteúdo)' }]);
    } catch (e: any) {
      setHistory((h) => [...h, { role: 'assistant', content: 'Erro ao consultar o modelo.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-md p-4 flex flex-col h-[70vh]">
      <div className="font-medium mb-2">Playground</div>
      <p className="text-sm text-muted-foreground mb-3">Converse com o assistente e verifique tom e precisão.</p>
      <Separator className="mb-3" />
      <div className="flex-1 overflow-auto space-y-2 pr-2">
        {history.length === 0 && (
          <div className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`p-2 rounded-md ${m.role === 'user' ? 'bg-muted' : 'bg-accent'}`}>
            <div className="text-xs font-medium mb-1">{m.role === 'user' ? 'Você' : 'Capitão'}</div>
            <div className="whitespace-pre-wrap text-sm">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Input placeholder="Digite sua mensagem..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
        <Button onClick={send} disabled={loading || !input.trim()}><SendHorizonal className="w-4 h-4 mr-2" />Enviar</Button>
      </div>
      <div className="text-xs text-muted-foreground mt-1">As mensagens enviadas aqui usam os créditos do seu Capitão.</div>
    </div>
  );
}

function ModelSelector({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/chatwitia', { method: 'GET', cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const ids: string[] = [];
        const push = (arr: any[]) => arr?.forEach((m: any) => { if (m?.id) ids.push(m.id); });
        push(j?.models?.gpt4o || []);
        push(j?.models?.gpt4 || []);
        push(j?.models?.oSeries || []);
        const unique = Array.from(new Set(ids)).filter(Boolean);
        setModels(unique);
        console.log('[Capitão] Modelos carregados', unique);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const effective = models.includes(value) ? value : (models.find(m => m === value || m.startsWith(value)) || value);

  return (
    <select className="w-full h-9 border rounded px-2" value={effective} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      {loading ? (
        <option>Carregando…</option>
      ) : (
        models.map((m) => <option key={m} value={m}>{m}</option>)
      )}
    </select>
  );
}


