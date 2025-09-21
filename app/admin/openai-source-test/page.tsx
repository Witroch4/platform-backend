"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Channel = "whatsapp" | "instagram" | "messenger";
type Verbosity = "low" | "medium" | "high";
type Effort = "minimal" | "low" | "medium" | "high";

// Tipos para captain overrides com sentinela "inherit"
type CaptainVerbosity = "inherit" | Verbosity;
type CaptainEffort = "inherit" | Effort;

type ApiResult = {
  success: boolean;
  mode?: "structured" | "json_mode_fallback";
  data?: any;
  payload?: any;
  session?: { sessionKey: string; previous_response_id: string };
  error?: string;
  debug?: {
    endpoint?: string;
    server_timing_ms?: number | { total?: number; ensureSession?: number; openai?: number };
    request_body?: any;
    openai?: {
      request?: {
        model?: string;
        instructions?: string;
        input?: Array<{ role: string; content: string }>;
        previous_response_id?: string;
        store?: boolean;
        text?: any;
        max_output_tokens?: number;
        reasoning?: any;
      };
      response_meta?: {
        id?: string;
        status?: string;
        incomplete_details?: any;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      raw_response_snippet?: any;
    };
  };
};

const DEFAULT_ENDPOINT = "/api/openai-source-test-biblia";

export default function OpenAISourceTestPage() {
  const [apiEndpoint, setApiEndpoint] = useState(DEFAULT_ENDPOINT);
  const [userInput, setUserInput] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [model, setModel] = useState("gpt-5");
  const [sessionId, setSessionId] = useState("dev-session");

  // Top-level prefs (fallback)
  const [verbosity, setVerbosity] = useState<"low" | "medium" | "high">("low");
  const [reasoningEffort, setReasoningEffort] = useState<"minimal" | "low" | "medium" | "high">("medium");
  // Somente temperature/top_p (sem penalties/seed)
  const [nrTemperature, setNrTemperature] = useState<string>("0.7");
  const [nrTopP, setNrTopP] = useState<string>("");

  // Limite de tokens de saída (herdável)
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("256");
  const [captainMaxOutputTokens, setCaptainMaxOutputTokens] = useState<string>("");

  // Captain override (tem precedência se enviado)
  const [captainInstruction, setCaptainInstruction] = useState("");
  const [captainVerbosity, setCaptainVerbosity] = useState<CaptainVerbosity>("inherit");
  const [captainEffort, setCaptainEffort] = useState<CaptainEffort>("inherit");

  const [timeoutMs, setTimeoutMs] = useState(7000);

  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [clientAbortCtl, setClientAbortCtl] = useState<AbortController | null>(null);

  const addLog = (message: string, type: "info" | "error" | "success" = "info") => {
    const t = new Date();
    const time = t.toLocaleTimeString();
    const ms = String(t.getMilliseconds()).padStart(3, "0");
    const prefix = type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️";
    setLogs((prev) => [...prev, `[${time}.${ms}] ${prefix} ${message}`]);
  };

  const clearLogs = () => {
    setLogs([]);
    setResult(null);
  };

  // Persistência simples no localStorage (para não perder configs)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("openai-debug-ui");
      if (saved) {
        const cfg = JSON.parse(saved);
        setApiEndpoint(cfg.apiEndpoint ?? DEFAULT_ENDPOINT);
        setModel(cfg.model ?? "gpt-5");
        setChannel(cfg.channel ?? "whatsapp");
        setSessionId(cfg.sessionId ?? "dev-session");
        setTimeoutMs(cfg.timeoutMs ?? 7000);
        setVerbosity(cfg.verbosity ?? "low");
        setReasoningEffort(cfg.reasoningEffort ?? "medium");
        setNrTemperature(cfg.nrTemperature ?? "0.7");
        setNrTopP(cfg.nrTopP ?? "");
        setMaxOutputTokens(cfg.maxOutputTokens ?? "256");
        setCaptainMaxOutputTokens(cfg.captainMaxOutputTokens ?? "");
                 setCaptainVerbosity(cfg.captainVerbosity ?? "inherit");
         setCaptainEffort(cfg.captainEffort ?? "inherit");
      }
    } catch {}
  }, []);
  useEffect(() => {
    const cfg = {
      apiEndpoint,
      model,
      channel,
      sessionId,
      timeoutMs,
      verbosity,
      reasoningEffort,
      nrTemperature,
      nrTopP,
      maxOutputTokens,
      captainMaxOutputTokens,
      captainVerbosity,
      captainEffort,
    };
    localStorage.setItem("openai-debug-ui", JSON.stringify(cfg));
  }, [apiEndpoint, model, channel, sessionId, timeoutMs, verbosity, reasoningEffort,
      nrTemperature, nrTopP, maxOutputTokens, captainMaxOutputTokens, captainVerbosity, captainEffort]);

  const parseNum = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  const requestBody = useMemo(() => {
    const base: any = {
      userText: userInput.trim(),
      channel,
      model,
      sessionId,
      timeoutMs,
      verbosity, // backend → text.verbosity
      reasoningEffort, // backend → reasoning.effort (se suportado)
      // Dica p/ modelos SEM reasoning (o backend só lê temperature/top_p)
      nonReasoningTuning: {
        temperature: parseNum(nrTemperature),
        top_p: parseNum(nrTopP),
      },
      // Também envia top-level (compatível com a rota atual)
      temperature: parseNum(nrTemperature),
      top_p: parseNum(nrTopP),
      // Limite de tokens de saída (herdável pelo capitão)
      maxOutputTokens: parseNum(maxOutputTokens),
      debug: true, // backend devolve bloco de debug
    };
    if (captainInstruction) base.captainInstruction = captainInstruction;
           if (
      captainVerbosity !== "inherit" ||
      captainEffort !== "inherit" ||
      (captainMaxOutputTokens && captainMaxOutputTokens.trim().length > 0)
    ) {
      base.captainConfig = {};
      if (captainVerbosity !== "inherit") base.captainConfig.verbosity = captainVerbosity;
      if (captainEffort !== "inherit") base.captainConfig.reasoningEffort = captainEffort;
      if (captainMaxOutputTokens && captainMaxOutputTokens.trim().length > 0) {
        base.captainConfig.maxOutputTokens = parseNum(captainMaxOutputTokens);
      }
    }
    return base;
  }, [
    userInput,
    channel,
    model,
    sessionId,
    timeoutMs,
    verbosity,
    reasoningEffort,
    captainInstruction,
    captainVerbosity,
    captainEffort,
    nrTemperature,
    nrTopP,
    maxOutputTokens,
    captainMaxOutputTokens,
  ]);

  const handleTestAPI = async () => {
    if (!userInput.trim()) {
      toast.error("Digite uma pergunta primeiro!");
      return;
    }

    setLoading(true);
    setLogs([]);
    setResult(null);
    addLog(`Iniciando teste → modelo=${model}, canal=${channel}, sessão=${sessionId}`);
    addLog(`Endpoint: ${apiEndpoint}`);

    const t0 = performance.now();
    const ac = new AbortController();
    setClientAbortCtl(ac);
    const clientTimer = window.setTimeout(() => {
      ac.abort();
      addLog(`⏰ Abortado pelo cliente após ${timeoutMs}ms`, "error");
    }, timeoutMs);

    try {
      addLog("Enviando requisição para o backend…");
      addLog(`Payload →\n${JSON.stringify(requestBody, null, 2)}`);

      const resp = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-debug": "1" },
        body: JSON.stringify(requestBody),
        signal: ac.signal,
      });

      const tHeaders = performance.now();
      addLog(`Resposta de headers recebida (TTFB ~${Math.round(tHeaders - t0)}ms)`);

      const text = await resp.text();
      const tEnd = performance.now();

      addLog(`Resposta lida (Total ~${Math.round(tEnd - t0)}ms). Status=${resp.status}`);

      let data: ApiResult;
      try {
        data = JSON.parse(text);
      } catch (e) {
        addLog("Falha ao parsear JSON da resposta (mostrando texto cru).", "error");
        setResult({
          success: false,
          error: "Resposta não-JSON do servidor",
          debug: { openai: { raw_response_snippet: text } },
        });
        toast.error("Resposta não-JSON do servidor");
        return;
      }

      if (resp.ok && data.success) {
        addLog(`Sucesso da API. mode=${data.mode ?? "n/d"}`, "success");
        addLog(`previous_response_id: ${data.session?.previous_response_id ?? "(n/d)"}`);
        setResult({
          ...data,
          debug: {
            ...(data.debug ?? {}),
            server_timing_ms:
              typeof data?.debug?.server_timing_ms === "object"
                ? data.debug?.server_timing_ms
                : Math.round(tEnd - t0),
          },
        });
        toast.success("OK!");
      } else {
        addLog(`Erro da API: ${data.error ?? "desconhecido"}`, "error");
        setResult({
          ...data,
          debug: {
            ...(data.debug ?? {}),
            server_timing_ms:
              typeof data?.debug?.server_timing_ms === "object"
                ? data.debug?.server_timing_ms
                : Math.round(tEnd - t0),
          },
        });
        toast.error(data.error ?? "Erro desconhecido");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        addLog("Requisição abortada no cliente.", "error");
        toast.error("Abortado no cliente");
      } else {
        addLog(`Erro de rede: ${err?.message ?? String(err)}`, "error");
        toast.error("Erro de conexão");
      }
      setResult({
        success: false,
        error: err?.message ?? String(err),
      });
    } finally {
      setClientAbortCtl(null);
      setLoading(false);
      clearTimeout(clientTimer);
    }
  };

  const handleAbortClient = () => {
    clientAbortCtl?.abort();
  };

  const copy = async (label: string, val: any) => {
    try {
      await navigator.clipboard.writeText(
        typeof val === "string" ? val : JSON.stringify(val, null, 2)
      );
      toast.success(`${label} copiado!`);
    } catch {
      toast.error(`Não foi possível copiar ${label}.`);
    }
  };

  const downloadJSON = (filename: string, data: any) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    );
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const buildMarkdownReport = () => {
    const dbg = result?.debug;
    const openaiDbg = dbg?.openai;
    const md =
`# 🔬 OpenAI Responses API — Relatório de Teste

## ▶️ Request → Backend
\`\`\`json
${JSON.stringify(requestBody, null, 2)}
\`\`\`

## ◀️ Resposta ← Backend
\`\`\`json
${JSON.stringify(result ?? {}, null, 2)}
\`\`\`

## 🧠 OpenAI — Request
\`\`\`json
${JSON.stringify(openaiDbg?.request ?? {}, null, 2)}
\`\`\`

## 🧠 OpenAI — Meta da Resposta
\`\`\`json
${JSON.stringify(openaiDbg?.response_meta ?? {}, null, 2)}
\`\`\`

## 📎 Snippet bruto (se houver)
\`\`\`json
${JSON.stringify(openaiDbg?.raw_response_snippet ?? {}, null, 2)}
\`\`\`
`;
    return md;
  };

  const copyMarkdown = async () => {
    const md = buildMarkdownReport();
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Markdown copiado!");
    } catch {
      toast.error("Não foi possível copiar o Markdown.");
    }
  };

  const downloadMarkdown = () => {
    const md = buildMarkdownReport();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "openai-debug-report.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Narrowing
  const dbg = result?.debug;
  const openaiDbg = dbg?.openai;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            🔬 Painel de Debug — Responses API
            <Badge variant="outline">Structured Outputs</Badge>
            <Badge variant="outline">Stateful (store + previous_response_id)</Badge>
          </CardTitle>
          <CardDescription>
            Inspecione <strong>o que você envia</strong> e <strong>o que recebe</strong> (incluindo o
            espelho do <strong>pedido à OpenAI</strong>), com Reasoning/Verbosity dinâmicos.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Configuração */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">⚙️ Configuração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="endpoint">Endpoint</Label>
                  <Input
                    id="endpoint"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="/api/openai-source-test-biblia"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Modelo</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-5">gpt-5 (padrão)</SelectItem>
                      <SelectItem value="gpt-5-nano">gpt-5-nano</SelectItem>
                      <SelectItem value="gpt-4.1-nano">gpt-4.1-nano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel">Canal</Label>
                  <Select value={channel} onValueChange={(value) => setChannel(value as Channel)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o canal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="messenger">Messenger</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sessionId">Session ID</Label>
                  <Input
                    id="sessionId"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="dev-session"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    min={1000}
                    max={30000}
                  />
                </div>

                {/* Top-level prefs */}
                <div className="space-y-2">
                  <Label htmlFor="verbosity">Verbosity (text)</Label>
                  <Select
                    value={verbosity}
                    onValueChange={(value) => setVerbosity(value as "low" | "medium" | "high")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a verbosidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
                  <Select
                    value={reasoningEffort}
                    onValueChange={(value) =>
                      setReasoningEffort(value as "minimal" | "low" | "medium" | "high")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">minimal (rápido)</SelectItem>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium (padrão)</SelectItem>
                      <SelectItem value="high">high (profundo)</SelectItem>
                    </SelectContent>
                  </Select>
                  {model === "gpt-4.1-nano" && (
                    <p className="text-xs text-muted-foreground">
                      ⚠️ Este modelo não suporta <code>reasoning.effort</code>; o backend ignora com segurança.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxOutputTokens">max_output_tokens</Label>
                  <Input
                    id="maxOutputTokens"
                    type="number"
                    min={64}
                    max={48000}
                    step={1}
                    value={maxOutputTokens}
                    onChange={(e) => setMaxOutputTokens(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Dica: se ver <code>incomplete:max_output_tokens</code>, aumente o valor. Limite baseado na role do usuário.
                  </p>
                </div>
              </div>

              {/* Fine-tuning para modelos sem reasoning (ex.: gpt-4.1-nano) */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Fine-tuning (modelos sem reasoning)</Label>
                  <span className="text-xs text-muted-foreground">
                    Aplicado quando o modelo não suporta <code>reasoning.effort</code>.
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nrTemperature">temperature (0–2)</Label>
                    <Input
                      id="nrTemperature"
                      type="number"
                      step="0.01"
                      min="0"
                      max="2"
                      value={nrTemperature}
                      onChange={(e) => setNrTemperature(e.target.value)}
                      placeholder="ex.: 0.7"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nrTopP">top_p (0–1)</Label>
                    <Input
                      id="nrTopP"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={nrTopP}
                      onChange={(e) => setNrTopP(e.target.value)}
                      placeholder="(opcional)"
                    />
                  </div>
                </div>
              </div>

              {/* Captain config (tem precedência) */}
              <Separator />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="captainInstruction">Captain Instruction (opcional)</Label>
                  <Textarea
                    id="captainInstruction"
                    placeholder={`Deixe vazio para usar o padrão (Direito).
Exemplo:
# CAPTAIN (Tecnologia)
Você é um assistente técnico conciso...`}
                    value={captainInstruction}
                    onChange={(e) => setCaptainInstruction(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Captain Overrides</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Verbosity</Label>
                                             <Select
                         value={captainVerbosity}
                         onValueChange={(value) =>
                           setCaptainVerbosity(value as CaptainVerbosity)
                         }
                       >
                         <SelectTrigger>
                           <SelectValue placeholder="(herdar top-level)" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="inherit">(herdar)</SelectItem>
                           <SelectItem value="low">low</SelectItem>
                           <SelectItem value="medium">medium</SelectItem>
                           <SelectItem value="high">high</SelectItem>
                         </SelectContent>
                       </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Reasoning Effort</Label>
                                             <Select
                         value={captainEffort}
                         onValueChange={(value) =>
                           setCaptainEffort(value as CaptainEffort)
                         }
                         disabled={model === "gpt-4.1-nano"}
                       >
                         <SelectTrigger>
                           <SelectValue placeholder="(herdar top-level)" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="inherit">(herdar)</SelectItem>
                           <SelectItem value="minimal">minimal</SelectItem>
                           <SelectItem value="low">low</SelectItem>
                           <SelectItem value="medium">medium</SelectItem>
                           <SelectItem value="high">high</SelectItem>
                         </SelectContent>
                       </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs" htmlFor="captainMaxOutputTokens">
                        Max Output Tokens (override)
                      </Label>
                      <Input
                        id="captainMaxOutputTokens"
                        type="number"
                        min={64}
                        max={48000}
                        step={1}
                        value={captainMaxOutputTokens}
                        onChange={(e) => setCaptainMaxOutputTokens(e.target.value)}
                        placeholder="(herdar do top-level)"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Deixe vazio para herdar do top-level.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Overrides do capitão têm prioridade sobre o top-level.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pergunta */}
          <div className="space-y-3">
            <Label htmlFor="userInput">Pergunta do usuário</Label>
            <Textarea
              id="userInput"
              placeholder="Digite sua pergunta…"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2">
              <Button onClick={handleTestAPI} disabled={loading || !userInput.trim()} className="flex-1">
                {loading ? "Testando..." : "🚀 Testar API"}
              </Button>
              <Button onClick={clearLogs} variant="outline" disabled={loading}>
                🗑️ Limpar
              </Button>
              <Button onClick={handleAbortClient} variant="destructive" disabled={!clientAbortCtl}>
                🛑 Abortar (Cliente)
              </Button>
            </div>
          </div>

          {/* Painéis de debug */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Request → Backend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">📤 Request → Backend</CardTitle>
                <CardDescription>
                  O JSON exato enviado para <code className="bg-muted px-1 rounded">{apiEndpoint}</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-72 border">
                  {JSON.stringify(requestBody, null, 2)}
                </pre>
                <div className="mt-2 flex gap-2">
                  <Button  variant="outline" onClick={() => copy("Payload", requestBody)}>
                    Copiar
                  </Button>
                  <Button
                    
                    variant="outline"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(
                        new Blob([JSON.stringify(requestBody, null, 2)], { type: "application/json" })
                      );
                      a.download = "request-body.json";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    Baixar JSON
                  </Button>
                  <Button  variant="outline" onClick={copyMarkdown}>
                    Copiar tudo em Markdown
                  </Button>
                  <Button  variant="outline" onClick={downloadMarkdown}>
                    Baixar Markdown
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Resposta completa */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">📥 Resposta ← Backend</CardTitle>
                <CardDescription>Tudo que a API retornou</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-72 border">
                  {JSON.stringify(result ?? { info: "sem resposta ainda" }, null, 2)}
                </pre>
                <div className="mt-2 flex gap-2">
                  <Button  variant="outline" onClick={() => copy("Resposta", result)}>
                    Copiar
                  </Button>
                  <Button
                    
                    variant="outline"
                    onClick={() =>
                      downloadJSON("response.json", result ?? { info: "sem resposta ainda" })
                    }
                  >
                    Baixar JSON
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resultado primário (quando success) */}
          {result?.success && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  📋 Resultado Estruturado
                  {result.mode && <Badge variant="default">{result.mode}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">📄 Dados (schema QuickReply)</h4>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto border">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2">
                    📱 Payload adaptado ({channel[0].toUpperCase() + channel.slice(1)})
                  </h4>
                  <pre className="bg-green-50 dark:bg-green-950/20 p-3 rounded text-xs overflow-auto border">
                    {JSON.stringify(result.payload, null, 2)}
                  </pre>
                </div>

                <Separator />

                {result.session && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded text-sm border">
                    <div>
                      <strong>Session Key:</strong> {result.session.sessionKey}
                    </div>
                    <div>
                      <strong>Previous Response ID:</strong> {result.session.previous_response_id}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Painel: Debug OpenAI */}
          {openaiDbg && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">🧠 OpenAI — Request & Meta</CardTitle>
                <CardDescription>
                  Mostra <strong>o que foi enviado</strong> e <strong>metadados da resposta</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">➡️ Enviado para OpenAI</h4>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-72 border">
                      {JSON.stringify(openaiDbg.request ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">⬅️ Meta da Resposta</h4>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-72 border">
                      {JSON.stringify(openaiDbg.response_meta ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>

                {openaiDbg.raw_response_snippet && (
                  <>
                    <Separator />
                    <details>
                      <summary className="cursor-pointer font-medium text-sm">
                        🔎 Raw snippet da OpenAI (truncado)
                      </summary>
                      <pre className="bg-muted p-3 rounded text-xs overflow-auto mt-2 max-h-72 border">
                        {JSON.stringify(openaiDbg.raw_response_snippet, null, 2)}
                      </pre>
                    </details>
                  </>
                )}

                {/* Timings, se vierem como objeto */}
                {typeof dbg?.server_timing_ms === "object" && (
                  <>
                    <Separator />
                    <div className="text-xs">
                      <div><strong>Total:</strong> {dbg?.server_timing_ms?.total ?? "n/d"} ms</div>
                      <div>
                        <strong>ensureSession:</strong>{" "}
                        {dbg?.server_timing_ms?.ensureSession ?? "n/d"} ms
                      </div>
                      <div><strong>openai:</strong> {dbg?.server_timing_ms?.openai ?? "n/d"} ms</div>
                    </div>
                  </>
                )}

                <div className="mt-2 flex gap-2">
                  <Button  variant="outline" onClick={() => copy("OpenAI Request", openaiDbg.request ?? {})}>
                    Copiar Request
                  </Button>
                  <Button  variant="outline" onClick={() => copy("OpenAI Meta", openaiDbg.response_meta ?? {})}>
                    Copiar Meta
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">📝 Logs (Cliente)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded text-xs max-h-60 overflow-auto font-mono space-y-1 border">
                  {logs.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
