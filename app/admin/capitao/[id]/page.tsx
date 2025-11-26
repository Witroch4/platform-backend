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
import { toast } from "sonner";

type Assistant = {
  id: string;
  name: string;
  description?: string | null;
  productName?: string | null;
  generateFaqs: boolean;
  captureMemories: boolean;
  proposeHumanHandoff: boolean;
  disableIntentSuggestion: boolean;
  enableAutoRemarketing: boolean;
  remarketingDelayMinutes: number;
  remarketingMessage?: string | null;
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
  maxOutputTokens: number;
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [showFunctionalities, setShowFunctionalities] = useState(false);
  const [showOptimizations, setShowOptimizations] = useState(false);

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
            <div className="p-4 font-medium text-foreground">
              Informações Básicas
            </div>
            <Separator />
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Nome
                </label>
                <Input
                  value={assistant.name}
                  onChange={(e) =>
                    setAssistant({ ...assistant, name: e.target.value })
                  }
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Descrição
                </label>
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
                <label className="text-sm font-medium text-foreground">
                  Nome do Produto
                </label>
                <Input
                  value={assistant.productName || ""}
                  onChange={(e) =>
                    setAssistant({ ...assistant, productName: e.target.value })
                  }
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Modelo (OpenAI)
                </label>
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

          <Collapsible
            open={showInstructions}
            onOpenChange={setShowInstructions}
            className="border border-border rounded-md bg-card shadow-sm"
          >
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
                  try {
                    await update({
                      instructions: assistant.instructions || "",
                      intentOutputFormat: assistant.intentOutputFormat,
                    });
                    toast.success("Instruções salvas com sucesso!");
                    // Fechar o collapsible após salvar
                    setShowInstructions(false);
                  } catch (error) {
                    toast.error("Erro ao salvar instruções");
                  } finally {
                    setSavingInstr(false);
                  }
                }}
                className="bg-primary hover:bg-primary/90"
              >
                Salvar Instruções
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible
            open={showFunctionalities}
            onOpenChange={setShowFunctionalities}
            className="border border-border rounded-md bg-card shadow-sm"
          >
            <div className="p-4 flex items-center justify-between">
              <div className="font-medium text-foreground">
                Funcionalidades
              </div>
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
                Mostrar/Ocultar
              </CollapsibleTrigger>
            </div>
            <Separator />
            <CollapsibleContent className="p-4 space-y-3">
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
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={(assistant as any).proposeHumanHandoff ?? true}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      proposeHumanHandoff: e.target.checked,
                    } as any)
                  }
                  className="rounded border-border bg-background"
                />
                <span className="flex items-center gap-2">
                  Propor Atendimento Humano caso tenha botões disponíveis
                  <span 
                    className="cursor-help text-muted-foreground hover:text-foreground" 
                    title="Quando ativo, o sistema pode sugerir um botão de atendimento humano automaticamente se houver espaço para botões e ambiguidade na conversa"
                  >
                    ⓘ
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={(assistant as any).disableIntentSuggestion ?? false}
                  onChange={(e) =>
                    setAssistant({
                      ...assistant,
                      disableIntentSuggestion: e.target.checked,
                    } as any)
                  }
                  className="rounded border-border bg-background"
                />
                <span className="flex items-center gap-2">
                  Desativar Sugestão de Intenção
                  <span 
                    className="cursor-help text-muted-foreground hover:text-foreground" 
                    title="Ative caso queira bloquear o sistema de proposta de intenção com base na mensagem, deixando o prompt de instruções absoluto para o agente. Isso evita que o sistema sugira intenções baseadas em INTENT_HINTS"
                  >
                    ⓘ
                  </span>
                </span>
              </label>

              {/* Remarketing Automático */}
              <div className="border-t border-border pt-3 mt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={assistant.enableAutoRemarketing ?? false}
                    onChange={(e) =>
                      setAssistant({
                        ...assistant,
                        enableAutoRemarketing: e.target.checked,
                      })
                    }
                    className="rounded border-border bg-background"
                  />
                  <span className="flex items-center gap-2">
                    Remarketing Automático
                    <span 
                      className="cursor-help text-muted-foreground hover:text-foreground" 
                      title="Quando ativo, o sistema enviará automaticamente uma mensagem de remarketing após XX minutos sem resposta do cliente, abrindo atendimento humano junto com a mensagem"
                    >
                      ⓘ
                    </span>
                  </span>
                </label>

                {assistant.enableAutoRemarketing && (
                  <div className="ml-6 space-y-3 border-l-2 border-primary/20 pl-4">
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1">
                        Tempo de espera (minutos)
                      </label>
                      <Input
                        type="number"
                        min="5"
                        max="1440"
                        value={assistant.remarketingDelayMinutes ?? 30}
                        onChange={(e) =>
                          setAssistant({
                            ...assistant,
                            remarketingDelayMinutes: parseInt(e.target.value) || 30,
                          })
                        }
                        placeholder="30"
                        className="bg-background border-border text-foreground w-32"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Tempo em minutos antes de enviar o remarketing (mínimo: 5, máximo: 1440)
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1">
                        Mensagem de Remarketing
                      </label>
                      <Textarea
                        value={assistant.remarketingMessage ?? ""}
                        onChange={(e) =>
                          setAssistant({
                            ...assistant,
                            remarketingMessage: e.target.value,
                          })
                        }
                        placeholder="Olá! Vi que você iniciou um atendimento mas ainda não retornou. Estou disponibilizando um atendente humano para te ajudar. Como posso auxiliar?"
                        rows={4}
                        className="bg-background border-border text-foreground"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Esta mensagem será enviada junto com a action 'handoff', abrindo automaticamente o atendimento humano
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                disabled={savingFlags}
                onClick={async () => {
                  setSavingFlags(true);
                  try {
                    await update({
                      generateFaqs: assistant.generateFaqs,
                      captureMemories: assistant.captureMemories,
                      proposeHumanHandoff: (assistant as any).proposeHumanHandoff ?? true,
                      disableIntentSuggestion: (assistant as any).disableIntentSuggestion ?? false,
                      enableAutoRemarketing: assistant.enableAutoRemarketing ?? false,
                      remarketingDelayMinutes: assistant.remarketingDelayMinutes ?? 30,
                      remarketingMessage: assistant.remarketingMessage ?? null,
                    } as any);
                    toast.success("Funcionalidades salvas com sucesso!");
                    // Fechar o collapsible após salvar
                    setShowFunctionalities(false);
                  } catch (error) {
                    toast.error("Erro ao salvar funcionalidades");
                  } finally {
                    setSavingFlags(false);
                  }
                }}
                className="bg-primary hover:bg-primary/90"
              >
                Salvar
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <SocialWiseFlowSettings
            assistant={assistant}
            setAssistant={setAssistant}
            onUpdate={update}
            showOptimizations={showOptimizations}
            setShowOptimizations={setShowOptimizations}
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
  const [channelType, setChannelType] = useState<'whatsapp' | 'instagram' | 'facebook'>('whatsapp');
  const [embedipreview, setEmbedipreview] = useState(true);
  const [history, setHistory] = useState<
    { 
      role: "user" | "assistant"; 
      content: string;
      response?: any;
      metrics?: any;
    }[]
  >([]);

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setHistory((h) => [...h, { role: "user", content: text }]);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/playground/socialwise-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userText: text,
          channelType,
          assistantId,
          embedipreview
        }),
      });
      
      if (!r.ok) {
        const errorData = await r.json();
        throw new Error(errorData.error || 'Erro na requisição');
      }
      
      const result = await r.json();
      
      if (result.success) {
        setHistory((h) => [
          ...h,
          { 
            role: "assistant", 
            content: formatResponseForDisplay(result.response, channelType),
            response: result.response,
            metrics: result.metrics
          },
        ]);
      } else {
        throw new Error(result.error || 'Resposta inválida');
      }
    } catch (e: any) {
      setHistory((h) => [
        ...h,
        { role: "assistant", content: `Erro: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatResponseForDisplay = (response: any, channel: string) => {
    if (response.action === 'handoff') {
      return '🔄 **Transferindo para atendente humano**';
    }

    let text = '';
    let buttons: any[] = [];

    // Extrair texto e botões baseado no canal
    if (channel === 'whatsapp' && response.whatsapp) {
      if (response.whatsapp.type === 'text') {
        text = response.whatsapp.text?.body || '';
      } else if (response.whatsapp.type === 'interactive') {
        text = response.whatsapp.interactive?.body?.text || '';
        buttons = response.whatsapp.interactive?.action?.buttons || [];
      }
    } else if (channel === 'instagram' && response.instagram) {
      text = response.instagram.message?.text || '';
      if (response.instagram.message?.attachment?.payload?.buttons) {
        buttons = response.instagram.message.attachment.payload.buttons;
      }
    } else if (channel === 'facebook' && response.facebook) {
      text = response.facebook.message?.text || '';
    } else if (response.text) {
      text = response.text;
    }

    // Formatar para exibição
    let display = text;
    
    if (buttons.length > 0) {
      display += '\n\n**Botões:**';
      buttons.forEach((btn: any, index: number) => {
        const title = btn.title || btn.text || `Botão ${index + 1}`;
        display += `\n🔘 ${title}`;
      });
    }

    return display;
  };

  return (
    <div className="border border-border rounded-md p-4 flex flex-col h-[70vh] bg-card shadow-sm">
      <div className="font-medium mb-2 text-foreground">Playground SocialWise Flow</div>
      <p className="text-sm text-muted-foreground mb-3">
        Teste o fluxo de produção completo com validações de canal e botões.
      </p>
      
      {/* Controles de configuração */}
      <div className="flex gap-4 mb-3 text-sm">
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground">Canal:</label>
          <select 
            value={channelType} 
            onChange={(e) => setChannelType(e.target.value as any)}
            className="px-2 py-1 border border-border rounded bg-background text-foreground"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground">Modo:</label>
          <select 
            value={embedipreview ? 'embedding' : 'router'} 
            onChange={(e) => setEmbedipreview(e.target.value === 'embedding')}
            className="px-2 py-1 border border-border rounded bg-background text-foreground"
          >
            <option value="embedding">Embedding + Bands</option>
            <option value="router">Router LLM</option>
          </select>
        </div>
      </div>
      
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
            className={`p-3 rounded-md ${m.role === "user" ? "bg-muted/50" : "bg-accent/50"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-foreground">
                {m.role === "user" ? "Você" : "Capitão"}
              </div>
              {m.role === "assistant" && m.metrics && (
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline" className="text-xs">
                    {m.metrics.band}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {m.metrics.routeTotalMs}ms
                  </Badge>
                </div>
              )}
            </div>
            <div className="whitespace-pre-wrap text-sm text-foreground">
              {m.content}
            </div>
            {m.role === "assistant" && m.metrics && (
              <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex gap-4">
                  <span>Estratégia: {m.metrics.strategy}</span>
                  {m.metrics.embeddingMs && <span>Embedding: {m.metrics.embeddingMs}ms</span>}
                  {m.metrics.llmWarmupMs && <span>LLM: {m.metrics.llmWarmupMs}ms</span>}
                </div>
              </div>
            )}
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
        ⚡ Usando o motor de produção SocialWise Flow com todas as validações e formatações de canal.
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
    name: "",
    promptType: "INTENT_CLASSIFICATION",
    content: "",
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: 1000,
    isDefault: false,
  });

  const loadPromptVersions = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/ai-integration/prompt-versions?assistantId=${assistantId}`
      );
      if (r.ok) {
        const data = await r.json();
        setPromptVersions(data.promptVersions || []);
      }
    } catch (error) {
      console.error("Erro ao carregar versões de prompt:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAbTests = async () => {
    try {
      const r = await fetch(
        `/api/admin/ai-integration/ab-tests?assistantId=${assistantId}`
      );
      if (r.ok) {
        const data = await r.json();
        setAbTests(data.abTests || []);
      }
    } catch (error) {
      console.error("Erro ao carregar testes A/B:", error);
    }
  };

  const createPromptVersion = async () => {
    try {
      const r = await fetch("/api/admin/ai-integration/prompt-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, ...newVersion }),
      });

      if (r.ok) {
        setCreatingVersion(false);
        setNewVersion({
          name: "",
          promptType: "INTENT_CLASSIFICATION",
          content: "",
          systemPrompt: "",
          temperature: 0.7,
          maxTokens: 1000,
          isDefault: false,
        });
        await loadPromptVersions();
      }
    } catch (error) {
      console.error("Erro ao criar versão de prompt:", error);
    }
  };

  const toggleVersionActive = async (versionId: string, isActive: boolean) => {
    try {
      const r = await fetch("/api/admin/ai-integration/prompt-versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: versionId, isActive }),
      });

      if (r.ok) {
        await loadPromptVersions();
      }
    } catch (error) {
      console.error("Erro ao atualizar versão de prompt:", error);
    }
  };

  const setAsDefault = async (versionId: string) => {
    try {
      const r = await fetch("/api/admin/ai-integration/prompt-versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: versionId, isDefault: true }),
      });

      if (r.ok) {
        await loadPromptVersions();
      }
    } catch (error) {
      console.error("Erro ao definir versão padrão:", error);
    }
  };

  useEffect(() => {
    if (showVersioning) {
      loadPromptVersions();
      loadAbTests();
    }
  }, [showVersioning, assistantId]);

  return (
    <Collapsible
      open={showVersioning}
      onOpenChange={setShowVersioning}
      className="border border-border rounded-md bg-card shadow-sm"
    >
      <div className="p-4 flex items-center justify-between">
        <div className="font-medium text-foreground">
          Versionamento de Prompts
        </div>
        <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
          {showVersioning ? "Ocultar" : "Mostrar"} Versões
        </CollapsibleTrigger>
      </div>
      <Separator />
      <CollapsibleContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Gerencie diferentes versões de prompts e execute testes A/B
          </div>
          <Button
            
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
            <div className="text-sm font-medium mb-3 text-foreground">
              Criar Nova Versão de Prompt
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">
                  Nome
                </label>
                <Input
                  value={newVersion.name}
                  onChange={(e) =>
                    setNewVersion((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="ex: Classificação Jurídica v2"
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">
                  Tipo de Prompt
                </label>
                <select
                  className="w-full h-9 border border-border rounded px-2 bg-background text-foreground"
                  value={newVersion.promptType}
                  onChange={(e) =>
                    setNewVersion((prev) => ({
                      ...prev,
                      promptType: e.target.value,
                    }))
                  }
                >
                  <option value="INTENT_CLASSIFICATION">
                    Classificação de Intenções
                  </option>
                  <option value="WARMUP_BUTTONS">Botões de Aquecimento</option>
                  <option value="MICROCOPY">Microcopy</option>
                  <option value="ROUTER_LLM">Router LLM</option>
                  <option value="SHORT_TITLES">Títulos Curtos</option>
                  <option value="DOMAIN_TOPICS">Tópicos de Domínio</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-foreground">
                  Conteúdo do Prompt
                </label>
                <Textarea
                  value={newVersion.content}
                  onChange={(e) =>
                    setNewVersion((prev) => ({
                      ...prev,
                      content: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Digite o prompt aqui..."
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">
                  Temperature
                </label>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={newVersion.temperature}
                  onChange={(e) =>
                    setNewVersion((prev) => ({
                      ...prev,
                      temperature: parseFloat(e.target.value),
                    }))
                  }
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">
                  Max Tokens
                </label>
                <Input
                  type="number"
                  min="1"
                  max="4000"
                  value={newVersion.maxTokens}
                  onChange={(e) =>
                    setNewVersion((prev) => ({
                      ...prev,
                      maxTokens: parseInt(e.target.value),
                    }))
                  }
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={newVersion.isDefault}
                    onChange={(e) =>
                      setNewVersion((prev) => ({
                        ...prev,
                        isDefault: e.target.checked,
                      }))
                    }
                    className="rounded border-border bg-background"
                  />
                  Definir como versão padrão
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button
                
                onClick={createPromptVersion}
                className="bg-primary hover:bg-primary/90"
              >
                Criar Versão
              </Button>
              <Button
                
                variant="outline"
                onClick={() => setCreatingVersion(false)}
                className="border-border hover:bg-muted"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Prompt Versions List */}
        <div className="space-y-3">
          {promptVersions.map((version) => (
            <div
              key={version.id}
              className="border border-border rounded-md p-3 bg-card"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {version.name} {version.version}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {version.promptType} • Criado em{" "}
                    {new Date(version.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {version.isDefault && (
                    <Badge
                      variant="default"
                      className="bg-primary/10 text-primary border-primary/20"
                    >
                      Padrão
                    </Badge>
                  )}
                  {version.isActive && (
                    <Badge
                      variant="secondary"
                      className="bg-secondary/10 text-secondary border-secondary/20"
                    >
                      Ativo
                    </Badge>
                  )}
                  <Button
                    
                    variant="outline"
                    onClick={() =>
                      toggleVersionActive(version.id, !version.isActive)
                    }
                    className="border-border hover:bg-muted"
                  >
                    {version.isActive ? "Desativar" : "Ativar"}
                  </Button>
                  {!version.isDefault && (
                    <Button
                      
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
                      <div className="font-medium text-foreground">
                        {version._count.auditLogs}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        Taxa de Sucesso
                      </div>
                      <div className="font-medium text-foreground">
                        {version.metrics[0]
                          ? `${Math.round(version.metrics[0].successRate * 100)}%`
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        Latência Média
                      </div>
                      <div className="font-medium text-foreground">
                        {version.metrics[0]
                          ? `${Math.round(version.metrics[0].averageLatency)}ms`
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Score Médio</div>
                      <div className="font-medium text-foreground">
                        {version.metrics[0]
                          ? `${Math.round(version.metrics[0].averageScore * 100)}%`
                          : "N/A"}
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
            <div className="text-sm font-medium mb-3 text-foreground">
              Testes A/B Ativos
            </div>
            <div className="space-y-2">
              {abTests.map((test) => (
                <div
                  key={test.id}
                  className="border border-border rounded p-2 text-sm bg-card"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">
                        {test.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {test.promptVersions.length} versões •
                        {test.isActive ? " Ativo" : " Inativo"}
                      </div>
                    </div>
                    <Badge
                      variant={test.isActive ? "default" : "secondary"}
                      className="bg-primary/10 text-primary border-primary/20"
                    >
                      {test.isActive ? "Executando" : "Pausado"}
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
  showOptimizations,
  setShowOptimizations,
}: {
  assistant: Assistant;
  setAssistant: (a: Assistant) => void;
  onUpdate: (patch: Partial<Assistant>) => Promise<void>;
  showOptimizations: boolean;
  setShowOptimizations: (show: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState<string>("DEFAULT");

  // Determine if model is GPT-5 family or GPT-4 family
  const isGPT5Family = assistant.model.toLowerCase().includes("gpt-5");
  const isGPT4Family = assistant.model.toLowerCase().includes("gpt-4");

  // Get user role from session
  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data?.user?.role) {
          setUserRole(data.user.role);
        }
      })
      .catch(() => {
        // Fallback to DEFAULT if can't get role
        setUserRole("DEFAULT");
      });
  }, []);

  // Determine max tokens based on user role
  const getMaxTokensLimit = () => {
    switch (userRole) {
      case "SUPERADMIN":
        return 48000; // SUPERADMIN can use up to 48k tokens
      case "ADMIN":
        return 4096;  // ADMIN can use up to 4k tokens
      default:
        return 1024;  // DEFAULT users limited to 1k tokens
    }
  };

  const maxTokensLimit = getMaxTokensLimit();

  const saveSettings = async () => {
    setSaving(true);
    try {
      await onUpdate({
        embedipreview: assistant.embedipreview,
        reasoningEffort: assistant.reasoningEffort,
        verbosity: assistant.verbosity,
        temperature: assistant.temperature,
        topP: assistant.topP,
        tempSchema: assistant.tempSchema,
        tempCopy: assistant.tempCopy,
        maxOutputTokens: assistant.maxOutputTokens,
        warmupDeadlineMs: assistant.warmupDeadlineMs,
        hardDeadlineMs: assistant.hardDeadlineMs,
        softDeadlineMs: assistant.softDeadlineMs,
        shortTitleLLM: assistant.shortTitleLLM,
        toolChoice: assistant.toolChoice,
      });
      toast.success("Otimizações salvas com sucesso!");
      // Fechar o collapsible após salvar
      setShowOptimizations(false);
    } catch (error) {
      toast.error("Erro ao salvar otimizações");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Collapsible
      open={showOptimizations}
      onOpenChange={setShowOptimizations}
      className="border border-border rounded-md bg-card shadow-sm"
    >
      <div className="p-4 flex items-center justify-between">
        <div className="font-medium text-foreground">
          SocialWise Flow - Otimizações
        </div>
        <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
          Mostrar/Ocultar
        </CollapsibleTrigger>
      </div>
      <Separator />
      <CollapsibleContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Routing Strategy */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Estratégia de Roteamento
            </label>
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
              <option value="embedding-first">
                Embedding-First (Modo Rápido)
              </option>
              <option value="llm-first">LLM-First (Modo Inteligente)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Embedding-first usa embeddings para classificação rápida.
              LLM-first prioriza conversação.
            </p>
          </div>

          {/* Model-specific parameters */}
          {isGPT5Family && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Esforço de Raciocínio (GPT-5)
                </label>
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
                <label className="text-sm font-medium text-foreground">
                  Verbosidade (GPT-5)
                </label>
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
                <label className="text-sm font-medium text-foreground">
                  Temperature (GPT-4)
                </label>
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
                  Controla a criatividade (0.0 = determinístico, 2.0 = muito
                  criativo)
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Top P (GPT-4)
                </label>
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
            <label className="text-sm font-medium text-foreground">
              Temperature - Saídas Estruturadas
            </label>
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
            <label className="text-sm font-medium text-foreground">
              Temperature - Microcopy
            </label>
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

          {/* Max Output Tokens */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Max Output Tokens
              {userRole === "SUPERADMIN" && (
                <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                  SUPERADMIN
                </span>
              )}
              {userRole === "ADMIN" && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  ADMIN
                </span>
              )}
            </label>
            <Input
              type="number"
              min="64"
              max={maxTokensLimit}
              step="1"
              value={assistant.maxOutputTokens}
              onChange={(e) =>
                setAssistant({
                  ...assistant,
                  maxOutputTokens: Math.min(parseInt(e.target.value) || 256, maxTokensLimit),
                })
              }
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Limite de tokens de saída (64-{maxTokensLimit.toLocaleString()}). 
              {userRole === "SUPERADMIN" && " SUPERADMIN: até 48k tokens para validação de prompts."}
              {userRole === "ADMIN" && " ADMIN: até 4k tokens."}
              {userRole === "DEFAULT" && " Se ver \"incomplete:max_output_tokens\", aumente para 384-512."}
            </p>
          </div>

          {/* Deadline settings */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Deadline - Warmup (ms)
            </label>
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
            <label className="text-sm font-medium text-foreground">
              Deadline - HARD Band (ms)
            </label>
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
            <label className="text-sm font-medium text-foreground">
              Deadline - SOFT Band (ms)
            </label>
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
            <label className="text-sm font-medium text-foreground">
              Escolha de Ferramentas
            </label>
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

        <Button
          disabled={saving}
          onClick={saveSettings}
          className="bg-primary hover:bg-primary/90"
        >
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
