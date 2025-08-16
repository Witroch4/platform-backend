// app/admin/capitao/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SendHorizonal, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Assistant = {
  id: string;
  name: string;
  description?: string | null;
  productName?: string | null;
  generateFaqs: boolean;
  captureMemories: boolean;
  instructions?: string | null;
  intentOutputFormat: "JSON" | "AT_SYMBOL";
  model: string;
  // SocialWise Flow optimization settings
  embedipreview: boolean;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
  verbosity: "low" | "medium" | "high";
  temperature?: number | null;
  topP?: number | null;
  tempSchema: number;
  tempCopy: number;
  warmupDeadlineMs: number;
  hardDeadlineMs: number;
  softDeadlineMs: number;
  shortTitleLLM: boolean;
  toolChoice: "none" | "auto";
};

export default function EditAssistantPage() {
  const params = useParams();
  const router = useRouter();
  const id = String((params as any)?.id || "");

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingInstr, setSavingInstr] = useState(false);
  const [savingFlags, setSavingFlags] = useState(false);

  async function loadAssistant() {
    const r = await fetch(`/api/admin/ai-integration/assistants?id=${id}`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (j?.assistant) setAssistant(j.assistant);
    if (j?.assistant) {
      console.log("[Capitão] Assistente carregado", {
        id: j.assistant.id,
        model: j.assistant.model,
      });
    } else {
      console.log("[Capitão] Assistente não encontrado");
    }
  }

  useEffect(() => {
    if (id) loadAssistant();
  }, [id]);

  if (!assistant)
    return (
      <div className="p-6 bg-background text-foreground min-h-screen">
        <div className="text-sm text-muted-foreground">Carregando…</div>
      </div>
    );

  const update = async (patch: Partial<Assistant>) => {
    const body = { id: assistant.id, ...patch } as any;
    const r = await fetch("/api/admin/ai-integration/assistants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) await loadAssistant();
  };

  return (
    <div className="p-6 space-y-4 bg-background text-foreground min-h-screen">
      <div>
        <button
          onClick={() => router.push("/admin/capitao")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="border border-border rounded-md bg-card shadow-sm">
            <div className="p-4 font-medium text-foreground">Informações Básicas</div>
            <Separator />
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Nome</label>
                <Input
                  value={assistant.name}
                  onChange={(e) =>
                    setAssistant({ ...assistant, name: e.target.value })
                  }
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Descrição</label>
                <Textarea
                  value={assistant.description || ""}
                  onChange={(e) =>
                    setAssistant({ ...assistant, description: e.target.value })
                  }
                  rows={6}
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Nome do Produto</label>
                <Input
                  value={assistant.productName || ""}
                  onChange={(e) =>
                    setAssistant({ ...assistant, productName: e.target.value })
                  }
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Modelo (OpenAI)</label>
                <ModelSelector
                  value={assistant.model || "gpt-5-nano"}
                  onChange={async (m) => {
                    console.log("[Capitão] Modelo selecionado", m);
                    setAssistant({ ...assistant, model: m });
                    await update({ model: m });
                  }}
                />
              </div>
              <Button
                disabled={savingBasic}
                onClick={async () => {
                  setSavingBasic(true);
                  await update({
                    name: assistant.name,
                    description: assistant.description || null,
                    productName: assistant.productName || null,
                  });
                  setSavingBasic(false);
                }}
                className="bg-primary hover:bg-primary/90"
              >
                Atualizar
              </Button>
            </div>
          </div>

          <Collapsible defaultOpen={false} className="border border-border rounded-md bg-card shadow-sm">
            <div className="p-4 flex items-center justify-between">
              <div className="font-medium text-foreground">Instruções</div>
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
                Mostrar/Ocultar
              </CollapsibleTrigger>
            </div>
            <Separator />
            <CollapsibleContent className="p-4 space-y-4">
              <Textarea
                value={assistant.instructions || ""}
                onChange={(e) =>
                  setAssistant({ ...assistant, instructions: e.target.value })
                }
                placeholder={
                  "Exemplo:\nVocê é um assistente que classifica a mensagem do usuário em intenções e extrai entidades. Responda no formato selecionado abaixo.\n\nCategorias:\n@pagar_fatura: ...\n@ver_saldo: ...\n@rastrear_pedido: ...\n@outros_assuntos: ..."
                }
                rows={12}
                className="bg-background border-border text-foreground"
              />
              <div>
                <label className="text-sm font-medium text-foreground">
                  Formato de saída da intenção
                </label>
                <select
                  className="w-full h-9 border border-border rounded px-2 bg-background text-foreground"
                  value={assistant.intentOutputFormat}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      intentOutputFormat: e.target.value as any,
                    })
                  }
                >
                  <option value="JSON">
                    JSON:{" "}
                    {`{"intent":{"name":"@pagar_fatura","confidence":0.98},"entities":[...]}`}
                  </option>
                  <option value="AT_SYMBOL">
                    Apenas @intent: @pagar_fatura
                  </option>
                </select>
              </div>
              <Button
                disabled={savingInstr}
                onClick={async () => {
                  setSavingInstr(true);
                  await update({
                    instructions: assistant.instructions || "",
                    intentOutputFormat: assistant.intentOutputFormat,
                  });
                  setSavingInstr(false);
                }}
                className="bg-primary hover:bg-primary/90"
              >
                Salvar Instruções
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <div className="border border-border rounded-md bg-card shadow-sm">
            <div className="p-4 font-medium text-foreground">Funcionalidades</div>
            <Separator />
            <div className="p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={assistant.generateFaqs}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      generateFaqs: e.target.checked,
                    })
                  }
                  className="rounded border-border bg-background"
                />
                Gerar FAQs a partir de conversas resolvidas
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={assistant.captureMemories}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      captureMemories: e.target.checked,
                    })
                  }
                  className="rounded border-border bg-background"
                />
                Capturar memórias de interações
              </label>
              <Button
                disabled={savingFlags}
                onClick={async () => {
                  setSavingFlags(true);
                  await update({
                    generateFaqs: assistant.generateFaqs,
                    captureMemories: assistant.captureMemories,
                  });
                  setSavingFlags(false);
                }}
                className="bg-primary hover:bg-primary/90"
              >
                Salvar
              </Button>
            </div>
          </div>

          <SocialWiseFlowSettings
            assistant={assistant}
            setAssistant={setAssistant}
            onUpdate={update}
          />

          <PromptVersioningPanel assistantId={assistant.id} />
        </div>

        <Playground
          assistantId={assistant.id}
          model={assistant.model || "gpt-5-nano"}
          instructions={assistant.instructions || ""}
        />
      </div>
    </div>
  );
}

function Playground({
  assistantId,
  model,
  instructions,
}: {
  assistantId: string;
  model: string;
  instructions: string;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setHistory((h) => [...h, { role: "user", content: text }]);
    setLoading(true);
    try {
      const r = await fetch("/api/chatwitia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: [
                `Você é o Capitão do assistente ${assistantId}.`,
                (instructions || "").trim(),
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: text },
          ],
          model,
          stream: true,
          captainPlayground: true,
        }),
      });
      if (!r.ok || !r.body) throw new Error("sem corpo");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const evt = JSON.parse(trimmed);
            if (evt.type === "chunk" && typeof evt.content === "string") {
              assembled += evt.content;
            } else if (evt.type === "done") {
              if (!assembled && evt.response?.content)
                assembled = evt.response.content;
            }
          } catch {}
        }
      }
      setHistory((h) => [
        ...h,
        { role: "assistant", content: assembled || "(sem conteúdo)" },
      ]);
    } catch (e: any) {
      setHistory((h) => [
        ...h,
        { role: "assistant", content: "Erro ao consultar o modelo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border rounded-md p-4 flex flex-col h-[70vh] bg-card shadow-sm">
      <div className="font-medium mb-2 text-foreground">Playground</div>
      <p className="text-sm text-muted-foreground mb-3">
        Converse com o assistente e verifique tom e precisão.
      </p>
      <Separator className="mb-3" />
      <div className="flex-1 overflow-auto space-y-2 pr-2">
        {history.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nenhuma mensagem ainda.
          </div>
        )}
        {history.map((m, i) => (
          <div
            key={i}
            className={`p-2 rounded-md ${m.role === "user" ? "bg-muted/50" : "bg-accent/50"}`}
          >
            <div className="text-xs font-medium mb-1 text-foreground">
              {m.role === "user" ? "Você" : "Capitão"}
            </div>
            <div className="whitespace-pre-wrap text-sm text-foreground">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Input
          placeholder="Digite sua mensagem..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          className="bg-background border-border text-foreground"
        />
        <Button 
          onClick={send} 
          disabled={loading || !input.trim()}
          className="bg-primary hover:bg-primary/90"
        >
          <SendHorizonal className="w-4 h-4 mr-2" />
          Enviar
        </Button>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        As mensagens enviadas aqui usam os créditos do seu Capitão.
      </div>
    </div>
  );
}

function PromptVersioningPanel({ assistantId }: { assistantId: string }) {
  const [promptVersions, setPromptVersions] = useState<any[]>([]);
  const [abTests, setAbTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showVersioning, setShowVersioning] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [newVersion, setNewVersion] = useState({
    name: '',
    promptType: 'INTENT_CLASSIFICATION',
    content: '',
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 1000,
    isDefault: false
  });

  const loadPromptVersions = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/ai-integration/prompt-versions?assistantId=${assistantId}`);
      if (r.ok) {
        const data = await r.json();
        setPromptVersions(data.promptVersions || []);
      }
    } catch (error) {
      console.error('Erro ao carregar versões de prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAbTests = async () => {
    try {
      const r = await fetch(`/api/admin/ai-integration/ab-tests?assistantId=${assistantId}`);
      if (r.ok) {
        const data = await r.json();
        setAbTests(data.abTests || []);
      }
    } catch (error) {
      console.error('Erro ao carregar testes A/B:', error);
    }
  };

  const createPromptVersion = async () => {
    try {
      const r = await fetch('/api/admin/ai-integration/prompt-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId, ...newVersion })
      });
      
      if (r.ok) {
        setCreatingVersion(false);
        setNewVersion({
          name: '',
          promptType: 'INTENT_CLASSIFICATION',
          content: '',
          systemPrompt: '',
          temperature: 0.7,
          maxTokens: 1000,
          isDefault: false
        });
        await loadPromptVersions();
      }
    } catch (error) {
      console.error('Erro ao criar versão de prompt:', error);
    }
  };

  const toggleVersionActive = async (versionId: string, isActive: boolean) => {
    try {
      const r = await fetch('/api/admin/ai-integration/prompt-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: versionId, isActive })
      });
      
      if (r.ok) {
        await loadPromptVersions();
      }
    } catch (error) {
      console.error('Erro ao atualizar versão de prompt:', error);
    }
  };

  const setAsDefault = async (versionId: string) => {
    try {
      const r = await fetch('/api/admin/ai-integration/prompt-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: versionId, isDefault: true })
      });
      
      if (r.ok) {
        await loadPromptVersions();
      }
    } catch (error) {
      console.error('Erro ao definir versão padrão:', error);
    }
  };

  useEffect(() => {
    if (showVersioning) {
      loadPromptVersions();
      loadAbTests();
    }
  }, [showVersioning, assistantId]);

  return (
    <Collapsible open={showVersioning} onOpenChange={setShowVersioning} className="border border-border rounded-md bg-card shadow-sm">
      <div className="p-4 flex items-center justify-between">
        <div className="font-medium text-foreground">Versionamento de Prompts</div>
        <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
          {showVersioning ? 'Ocultar' : 'Mostrar'} Versões
        </CollapsibleTrigger>
      </div>
      <Separator />
      <CollapsibleContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Gerencie diferentes versões de prompts e execute testes A/B
          </div>
          <Button 
            size="sm" 
            onClick={() => setCreatingVersion(true)}
            disabled={loading}
            className="bg-primary hover:bg-primary/90"
          >
            Nova Versão
          </Button>
        </div>

        {/* Create Version Dialog */}
        {creatingVersion && (
          <div className="border border-border rounded-md p-4 bg-muted/20">
            <div className="text-sm font-medium mb-3 text-foreground">Criar Nova Versão de Prompt</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Nome</label>
                <Input
                  value={newVersion.name}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ex: Classificação Jurídica v2"
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Tipo de Prompt</label>
                <select
                  className="w-full h-9 border border-border rounded px-2 bg-background text-foreground"
                  value={newVersion.promptType}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, promptType: e.target.value }))}
                >
                  <option value="INTENT_CLASSIFICATION">Classificação de Intenções</option>
                  <option value="WARMUP_BUTTONS">Botões de Aquecimento</option>
                  <option value="MICROCOPY">Microcopy</option>
                  <option value="ROUTER_LLM">Router LLM</option>
                  <option value="SHORT_TITLES">Títulos Curtos</option>
                  <option value="DOMAIN_TOPICS">Tópicos de Domínio</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-foreground">Conteúdo do Prompt</label>
                <Textarea
                  value={newVersion.content}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, content: e.target.value }))}
                  rows={4}
                  placeholder="Digite o prompt aqui..."
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Temperature</label>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={newVersion.temperature}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Max Tokens</label>
                <Input
                  type="number"
                  min="1"
                  max="4000"
                  value={newVersion.maxTokens}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={newVersion.isDefault}
                    onChange={(e) => setNewVersion(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="rounded border-border bg-background"
                  />
                  Definir como versão padrão
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" onClick={createPromptVersion} className="bg-primary hover:bg-primary/90">
                Criar Versão
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreatingVersion(false)} className="border-border hover:bg-muted">
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Prompt Versions List */}
        <div className="space-y-3">
          {promptVersions.map((version) => (
            <div key={version.id} className="border border-border rounded-md p-3 bg-card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-foreground">{version.name} {version.version}</div>
                  <div className="text-xs text-muted-foreground">
                    {version.promptType} • Criado em {new Date(version.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {version.isDefault && (
                    <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">Padrão</Badge>
                  )}
                  {version.isActive && (
                    <Badge variant="secondary" className="bg-secondary/10 text-secondary border-secondary/20">Ativo</Badge>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => toggleVersionActive(version.id, !version.isActive)}
                    className="border-border hover:bg-muted"
                  >
                    {version.isActive ? 'Desativar' : 'Ativar'}
                  </Button>
                  {!version.isDefault && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setAsDefault(version.id)}
                      className="border-border hover:bg-muted"
                    >
                      Definir Padrão
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Performance Metrics */}
              {version.metrics && version.metrics.length > 0 && (
                <div className="mt-2 p-2 bg-muted/30 rounded text-xs border border-border">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <div className="text-muted-foreground">Uso Total</div>
                      <div className="font-medium text-foreground">{version._count.auditLogs}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Taxa de Sucesso</div>
                      <div className="font-medium text-foreground">
                        {version.metrics[0] ? `${Math.round(version.metrics[0].successRate * 100)}%` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Latência Média</div>
                      <div className="font-medium text-foreground">
                        {version.metrics[0] ? `${Math.round(version.metrics[0].averageLatency)}ms` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Score Médio</div>
                      <div className="font-medium text-foreground">
                        {version.metrics[0] ? `${Math.round(version.metrics[0].averageScore * 100)}%` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {promptVersions.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nenhuma versão de prompt criada ainda.
            </div>
          )}
        </div>

        {/* A/B Tests Section */}
        {abTests.length > 0 && (
          <div className="border-t border-border pt-4">
            <div className="text-sm font-medium mb-3 text-foreground">Testes A/B Ativos</div>
            <div className="space-y-2">
              {abTests.map((test) => (
                <div key={test.id} className="border border-border rounded p-2 text-sm bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{test.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {test.promptVersions.length} versões • 
                        {test.isActive ? ' Ativo' : ' Inativo'}
                      </div>
                    </div>
                    <Badge variant={test.isActive ? 'default' : 'secondary'} className="bg-primary/10 text-primary border-primary/20">
                      {test.isActive ? 'Executando' : 'Pausado'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SocialWiseFlowSettings({
  assistant,
  setAssistant,
  onUpdate,
}: {
  assistant: Assistant;
  setAssistant: (a: Assistant) => void;
  onUpdate: (patch: Partial<Assistant>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  // Determine if model is GPT-5 family or GPT-4 family
  const isGPT5Family = assistant.model.toLowerCase().includes('gpt-5');
  const isGPT4Family = assistant.model.toLowerCase().includes('gpt-4');

  const saveSettings = async () => {
    setSaving(true);
    await onUpdate({
      embedipreview: assistant.embedipreview,
      reasoningEffort: assistant.reasoningEffort,
      verbosity: assistant.verbosity,
      temperature: assistant.temperature,
      topP: assistant.topP,
      tempSchema: assistant.tempSchema,
      tempCopy: assistant.tempCopy,
      warmupDeadlineMs: assistant.warmupDeadlineMs,
      hardDeadlineMs: assistant.hardDeadlineMs,
      softDeadlineMs: assistant.softDeadlineMs,
      shortTitleLLM: assistant.shortTitleLLM,
      toolChoice: assistant.toolChoice,
    });
    setSaving(false);
  };

  return (
    <Collapsible defaultOpen={false} className="border border-border rounded-md bg-card shadow-sm">
      <div className="p-4 flex items-center justify-between">
        <div className="font-medium text-foreground">SocialWise Flow - Otimizações</div>
        <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
          Mostrar/Ocultar
        </CollapsibleTrigger>
      </div>
      <Separator />
      <CollapsibleContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Routing Strategy */}
          <div>
            <label className="text-sm font-medium text-foreground">Estratégia de Roteamento</label>
            <select
              className="w-full h-9 border border-border rounded px-2 mt-1 bg-background text-foreground"
              value={assistant.embedipreview ? "embedding-first" : "llm-first"}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  embedipreview: e.target.value === "embedding-first",
                })
              }
            >
              <option value="embedding-first">Embedding-First (Modo Rápido)</option>
              <option value="llm-first">LLM-First (Modo Inteligente)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Embedding-first usa embeddings para classificação rápida. LLM-first prioriza conversação.
            </p>
          </div>

          {/* Model-specific parameters */}
          {isGPT5Family && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">Esforço de Raciocínio (GPT-5)</label>
                <select
                  className="w-full h-9 border border-border rounded px-2 mt-1 bg-background text-foreground"
                  value={assistant.reasoningEffort}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      reasoningEffort: e.target.value as any,
                    })
                  }
                >
                  <option value="minimal">Mínimo</option>
                  <option value="low">Baixo</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Verbosidade (GPT-5)</label>
                <select
                  className="w-full h-9 border border-border rounded px-2 mt-1 bg-background text-foreground"
                  value={assistant.verbosity}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      verbosity: e.target.value as any,
                    })
                  }
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </div>
            </>
          )}

          {isGPT4Family && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">Temperature (GPT-4)</label>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={assistant.temperature || 0.7}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      temperature: parseFloat(e.target.value) || 0.7,
                    })
                  }
                  className="bg-background border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Controla a criatividade (0.0 = determinístico, 2.0 = muito criativo)
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Top P (GPT-4)</label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={assistant.topP || 0.7}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      topP: parseFloat(e.target.value) || 0.7,
                    })
                  }
                  className="bg-background border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Controla a diversidade de tokens (0.1 = focado, 1.0 = diverso)
                </p>
              </div>
            </>
          )}

          {/* Temperature settings for structured outputs */}
          <div>
            <label className="text-sm font-medium text-foreground">Temperature - Saídas Estruturadas</label>
            <Input
              type="number"
              min="0"
              max="0.2"
              step="0.01"
              value={assistant.tempSchema}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  tempSchema: parseFloat(e.target.value) || 0.1,
                })
              }
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Para classificação de intenções (0.0-0.2)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Temperature - Microcopy</label>
            <Input
              type="number"
              min="0.3"
              max="0.5"
              step="0.01"
              value={assistant.tempCopy}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  tempCopy: parseFloat(e.target.value) || 0.4,
                })
              }
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Para textos de resposta (0.3-0.5)
            </p>
          </div>

          {/* Deadline settings */}
          <div>
            <label className="text-sm font-medium text-foreground">Deadline - Warmup (ms)</label>
            <Input
              type="number"
              min="100"
              max="1000"
              value={assistant.warmupDeadlineMs}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  warmupDeadlineMs: parseInt(e.target.value) || 250,
                })
              }
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Timeout para geração de botões de aquecimento
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Deadline - HARD Band (ms)</label>
            <Input
              type="number"
              min="50"
              max="500"
              value={assistant.hardDeadlineMs}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  hardDeadlineMs: parseInt(e.target.value) || 120,
                })
              }
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Timeout para mapeamento direto de intenções
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Deadline - SOFT Band (ms)</label>
            <Input
              type="number"
              min="100"
              max="1000"
              value={assistant.softDeadlineMs}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  softDeadlineMs: parseInt(e.target.value) || 300,
                })
              }
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Timeout para processamento de banda intermediária
            </p>
          </div>

          {/* Additional settings */}
          <div>
            <label className="text-sm font-medium text-foreground">Escolha de Ferramentas</label>
            <select
              className="w-full h-9 border border-border rounded px-2 mt-1 bg-background text-foreground"
              value={assistant.toolChoice}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  toolChoice: e.target.value as any,
                })
              }
            >
              <option value="auto">Automático</option>
              <option value="none">Nenhuma</option>
            </select>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={assistant.shortTitleLLM}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  shortTitleLLM: e.target.checked,
                })
              }
              className="rounded border-border bg-background"
            />
            Usar LLM para geração de títulos curtos
          </label>
        </div>

        <Button disabled={saving} onClick={saveSettings} className="bg-primary hover:bg-primary/90">
          {saving ? "Salvando..." : "Salvar Configurações SocialWise"}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (m: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/chatwitia", {
          method: "GET",
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        const ids: string[] = [];
        const push = (arr: any[]) =>
          arr?.forEach((m: any) => {
            if (m?.id) ids.push(m.id);
          });
        push(j?.models?.gpt4o || []);
        push(j?.models?.gpt4 || []);
        push(j?.models?.gpt5 || []); // ✅ Adicionar GPT-5
        push(j?.models?.oSeries || []);
        const unique = Array.from(new Set(ids)).filter(Boolean);
        setModels(unique);
        console.log("[Capitão] Modelos carregados", unique);
        console.log("[Capitão] Categorias disponíveis:", {
          gpt4o: j?.models?.gpt4o?.length || 0,
          gpt4: j?.models?.gpt4?.length || 0,
          gpt5: j?.models?.gpt5?.length || 0,
          oSeries: j?.models?.oSeries?.length || 0,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const effective = models.includes(value)
    ? value
    : models.find((m) => m === value || m.startsWith(value)) || value;

  return (
    <select
      className="w-full h-9 border border-border rounded px-2 bg-background text-foreground"
      value={effective}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
    >
      {loading ? (
        <option>Carregando…</option>
      ) : (
        models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))
      )}
    </select>
  );
}
