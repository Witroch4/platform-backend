// app/api/openai-source-test-biblia/route.ts
/**
 * ######################################################################
 *  OpenAI Responses API — Rota de Referência (produção + debug, dinâmica)
 * ######################################################################
 *
 * Este arquivo é um **super guia vivo** + rota Next.js (App Router) que
 * implementa, documenta e LOGA as melhores práticas com a Responses API:
 *
 * ✅ Responses API (não Chat Completions)
 * ✅ Hierarquia moderna: developer (persistente) + instructions (efêmero)
 * ✅ Estado server-side (store + previous_response_id)
 * ✅ Structured Outputs (json_schema via Zod) + fallback para JSON mode
 * ✅ Reasoning **dinâmico** (minimal/low/medium/high) — respeitando suporte do modelo
 * ✅ Verbosity **dinâmica** (low/medium/high) — todos modelos suportam
 * ✅ Sampling dinâmico (temperature/top_p) — só se o modelo suportar
 * ✅ Cancelamento/timeout com AbortController
 * ✅ Guards (normalização defensiva) + adapters (WA/IG/Messenger)
 * ✅ Painel de DEBUG opcional (eco do request + meta + timers + guards)
 * ✅ Métricas de tempo (server_timing_ms) — total, ensureSession, geração
 *
 * >>> Filosofia de parâmetros DINÂMICOS por modelo <<<
 * - reasoning.effort: apenas onde suportado (ex.: gpt-5); omitido caso contrário (ex.: gpt-4.1-nano).
 * - sampling (temperature/top_p): apenas onde suportado (ex.: gpt-4.1-nano); omitido caso contrário (ex.: gpt-5).
 * - text.verbosity: suportado por todos; pode ser low/medium/high.
 *
 * Como consumir:
 *   POST /api/openai-source-test-biblia
 *   Body (exemplo):
 *     {
 *       "userText": "Queria saber sobre Mandado de Segurança",
 *       "channel": "whatsapp" | "instagram" | "messenger",
 *       "model": "gpt-5" | "gpt-5-nano" | "gpt-4.1-nano",
 *       "sessionId": "user-123",
 *       "timeoutMs": 15000,
 *       // preferências globais (fallback quando o capitão não definir)
 *       "verbosity": "low" | "medium" | "high",
 *       "reasoningEffort": "minimal" | "low" | "medium" | "high",
 *       // sampling (aplicado **apenas** se o modelo suportar):
 *       "temperature": 0.2,
 *       "top_p": 1,
 *       // "capitão" pode especializar tudo (tem precedência sobre os globais)
 *       "captainInstruction": "# CAPTAIN (Direito)\nVocê é...",
 *       "captainConfig": {
 *         "verbosity": "low" | "medium" | "high",
 *         "reasoningEffort": "minimal" | "low" | "medium" | "high",
 *         "temperature": 0.2,
 *         "top_p": 1,
 *         "maxOutputTokens": 384
 *       },
 *       // opcional: UI pode mandar agrupado para modelos sem reasoning:
 *       "nonReasoningTuning": { "temperature": 0.2, "top_p": 1 },
 *       "maxOutputTokens": 256,
 *       "debug": true
 *     }
 *
 * Resposta (sucesso):
 *   {
 *     "success": true,
 *     "mode": "structured" | "json_mode_fallback",
 *     "session": { "sessionKey": "...", "previous_response_id": "..." },
 *     "data": { channel, body, buttons[] },  // contrato interno (QuickReply)
 *     "payload": { ... },                    // payload pronto para o canal
 *     "debug": { ... }                       // opcional (se debug=true)
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
// PROD: use seu singleton de Redis (ex.: ioredis) em "@/lib/connections"
import { getRedisInstance } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ————————————————————————————————————————————————————————————————
// 0) CLIENT — use chave **server-only** (NUNCA NEXT_PUBLIC_*).
// ————————————————————————————————————————————————————————————————
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // .env.local → OPENAI_API_KEY=sk-...
});

// Tipos inferidos só para RequestOpts; **não** usamos tipos do SDK para "input"
// para evitar o erro de TS quando se mistura string/object em arrays.
type RequestOpts = Parameters<typeof client.responses.create>[1];

// Nosso tipo **explícito** de mensagens (sempre {role,content}):
type ResponsesInput = Array<{
  role: "user" | "assistant" | "system" | "developer";
  content: string;
}>;

// Pequeno hash determinístico (FNV-1a) para derivar a sessão de (modelo+capitão)
function hashShort(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ————————————————————————————————————————————————————————————————
// 1) SCHEMAS — contrato imutável para UI por canal (Structured Outputs)
// ————————————————————————————————————————————————————————————————
const Button = z
  .object({
    title: z.string().max(20),
    payload: z.string().max(100).nullable().default(null),
  })
  .strict();

const QuickReply = z
  .object({
    channel: z.enum(["whatsapp", "instagram", "messenger"]),
    body: z.string().max(500),
    buttons: z.array(Button).min(2).max(3),
  })
  .strict();

type TQuickReply = z.infer<typeof QuickReply>;

// ————————————————————————————————————————————————————————————————
// 2) GUARDS — normalização defensiva (nunca confie 100% no modelo)
// ————————————————————————————————————————————————————————————————
const fit = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n).trim());

/** Gera payload estável a partir do título (remove acentos, espaços, símbolos) */
const slugId = (s: string, prefix = "BTN") =>
  (prefix +
    "_" +
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^a-zA-Z0-9]+/g, "_") // separadores → _
      .replace(/^_+|_+$/g, "") // trim _
      .toUpperCase()
  ).slice(0, 30);

function normalizeQuickReply(q: TQuickReply): TQuickReply {
  const buttons = q.buttons.slice(0, 3).map((b, i) => {
    const title = fit(b.title, 20);
    const payload =
      b.payload && b.payload.trim().length > 0 ? b.payload : slugId(title, `BTN${i + 1}`);
    return { title, payload };
  });
  return { channel: q.channel, body: fit(q.body, 500), buttons };
}

// ————————————————————————————————————————————————————————————————
// 3) ADAPTERS — payload final de cada plataforma
// ————————————————————————————————————————————————————————————————
function toWhatsApp(q: TQuickReply) {
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: q.body },
      action: {
        buttons: q.buttons.map((b) => ({
          type: "reply",
          reply: { id: b.payload!, title: b.title },
        })),
      },
    },
  };
}
function toInstagram(q: TQuickReply) {
  return {
    text: q.body,
    quick_replies: q.buttons.map((b) => ({
      title: b.title,
      payload: b.payload!,
    })),
  };
}
function toMessenger(q: TQuickReply) {
  return {
    text: q.body,
    quick_replies: q.buttons.map((b) => ({
      content_type: "text",
      title: b.title,
      payload: b.payload!,
    })),
  };
}
function toChannelPayload(q: TQuickReply) {
  switch (q.channel) {
    case "whatsapp":
      return toWhatsApp(q);
    case "instagram":
      return toInstagram(q);
    case "messenger":
      return toMessenger(q);
  }
}

// ————————————————————————————————————————————————————————————————
// 4) PROMPTS — separação de responsabilidades
// ————————————————————————————————————————————————————————————————
// 4.1) MASTER: lógica de negócio imutável (resposta sempre = body + botões)
const MASTER_PROMPT = `
# MASTER
Responda com: body curto + 2–3 botões, prontos para WhatsApp/Instagram/Messenger.
Não inclua texto fora do JSON (o contrato é o schema 'quick_reply').
`;

// 4.2) CAPTAIN: especialidade dinâmica (jurídico, clínica, engenharia, etc)
const DEFAULT_CAPTAIN = `
# CAPTAIN (Direito)
Você é um assistente jurídico conciso. Foque em orientação e próximos passos.
`;

// ————————————————————————————————————————————————————————————————
// 5) SESSÃO — Redis com TTL (fallback em memória)
// ————————————————————————————————————————————————————————————————
const sessionState = new Map<string, string>(); // Fallback local — dev/CI
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOCK_TTL_SECONDS = 5; // lock curto

async function getSessionPointer(key: string) {
  const redis = getRedisInstance?.();
  if (redis) {
    const v = await redis.get(key);
    return v ?? undefined;
  }
  return sessionState.get(key);
}

async function setSessionPointer(key: string, value: string) {
  const redis = getRedisInstance?.();
  if (redis) {
    await redis.setex(key, SESSION_TTL_SECONDS, value);
  }
  sessionState.set(key, value);
}

async function withLock<T>(key: string, fn: () => Promise<T>) {
  const redis = getRedisInstance?.();
  if (!redis) return fn();

  const lockKey = `lock:${key}`;
  const ok = await redis.set(lockKey, "1", "NX", "EX", LOCK_TTL_SECONDS);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 50));
    const existing = await getSessionPointer(key);
    if (existing) return existing as unknown as T;
  }
  try {
    return await fn();
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

async function ensureSession(
  params: { sessionKey: string; captainInstruction?: string; model: string },
  signal?: AbortSignal
) {
  const existing = await getSessionPointer(params.sessionKey);
  if (existing) return existing;

  return withLock(params.sessionKey, async () => {
    const again = await getSessionPointer(params.sessionKey);
    if (again) return again;

    const init = await client.responses.create(
      {
        model: params.model,
        input: [
          { role: "developer", content: MASTER_PROMPT },
          { role: "developer", content: params.captainInstruction ?? DEFAULT_CAPTAIN },
        ],
        store: true,
      },
      { signal } as RequestOpts
    );

    await setSessionPointer(params.sessionKey, init.id);
    return init.id;
  });
}

// ————————————————————————————————————————————————————————————————
// 6) MODELOS — capacidades por snapshot (ajuste conforme seu parque)
//     IMPORTANTÍSSIMO: se um snapshot gritar "Unsupported parameter: temperature",
//     marque sampling:false aqui para ele.
// ————————————————————————————————————————————————————————————————
const MODEL_CAPS: Record<
  string,
  { reasoning: boolean; structured: boolean; label: string; sampling: boolean }
> = {
  // gpt-5 (raciocínio + sampling ON – suporta temperature/top_p nos snapshots atuais)
  "gpt-5": { reasoning: true, structured: true, label: "GPT-5", sampling: true },

  // gpt-5-nano (ajuste conforme o seu snapshot: se reclamar de temperature, troque p/ false)
  "gpt-5-nano": { reasoning: true, structured: true, label: "GPT-5 Nano", sampling: true },

  // gpt-4.1-nano (sem reasoning; sampling OK — só temperature/top_p)
  "gpt-4.1-nano": { reasoning: false, structured: true, label: "GPT-4.1 Nano", sampling: true },
};

// ————————————————————————————————————————————————————————————————
// 7) Preferências dinâmicas — precedence: captainConfig > top-level > defaults
// ————————————————————————————————————————————————————————————————
const EffortEnum = ["minimal", "low", "medium", "high"] as const;
type Effort = (typeof EffortEnum)[number];

const VerbEnum = ["low", "medium", "high"] as const;
type Verbosity = (typeof VerbEnum)[number];

function coerceEffort(x: any): Effort | undefined {
  return EffortEnum.includes(x) ? (x as Effort) : undefined;
}
function coerceVerbosity(x: any): Verbosity | undefined {
  return VerbEnum.includes(x) ? (x as Verbosity) : undefined;
}

/** Resolve effort/verbosity combinando (em ordem): captainConfig > top-level > defaults */
function resolveDynamicPrefs(args: {
  model: string;
  bodyEffort?: any;
  bodyVerbosity?: any;
  captainEffort?: any;
  captainVerbosity?: any;
}) {
  const caps =
    MODEL_CAPS[args.model] ?? { reasoning: false, structured: true, label: args.model, sampling: false };

  const verbosity =
    coerceVerbosity(args.captainVerbosity) ??
    coerceVerbosity(args.bodyVerbosity) ??
    ("medium" as Verbosity);

  const requestedEffort =
    coerceEffort(args.captainEffort) ?? coerceEffort(args.bodyEffort) ?? ("medium" as Effort);

  const reasoning =
    caps.reasoning === true ? ({ effort: requestedEffort } as { effort: Effort }) : undefined;

  return { verbosity, reasoning, caps };
}

// ————————————————————————————————————————————————————————————————
// 7.1) SAMPLING — somente temperature/top_p e **só** se o modelo suportar
// ————————————————————————————————————————————————————————————————
type Sampling = { temperature?: number; top_p?: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function pickNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function pickInt(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

// Heurística para detectar o drift mais comum: raiz como array ou { quick_reply: [...] }
function isSchemaArrayError(err: any): boolean {
  try {
    const msg = String(err?.message ?? err ?? "");
    if (/invalid_type/i.test(msg) && /expected/i.test(msg) && /object/i.test(msg) && /received/i.test(msg) && /array/i.test(msg)) {
      return true;
    }
    const raw = err?.__openai?.raw_output_text;
    if (raw) {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) return true;
      if (obj && Array.isArray(obj.quick_reply)) return true;
    }
  } catch {}
  return false;
}

// ——— PATCH: normalize sampling p/ modelos com reasoning ———
function resolveSamplingPrefs(args: {
  caps: { reasoning: boolean; sampling: boolean };
  bodyTemperature?: any;
  bodyTopP?: any;
  captainTemperature?: any;
  captainTopP?: any;
}): { temperature?: number; top_p?: number } | undefined {
  if (!args.caps.sampling) return undefined;

  // captain > top-level
  const temperature = Number.isFinite(Number(args.captainTemperature))
    ? Number(args.captainTemperature)
    : (Number.isFinite(Number(args.bodyTemperature)) ? Number(args.bodyTemperature) : undefined);

  const top_p = Number.isFinite(Number(args.captainTopP))
    ? Number(args.captainTopP)
    : (Number.isFinite(Number(args.bodyTopP)) ? Number(args.bodyTopP) : undefined);

  // ⚠️ REGRA NOVA:
  // Em modelos com reasoning, a API só aceita sampling "neutro".
  // Se o cliente mandou qualquer sampling, normalize para { temperature:1, top_p:1 }.
  if (args.caps.reasoning) {
    const userAskedSampling = temperature !== undefined || top_p !== undefined;
    if (userAskedSampling) {
      return { temperature: 1, top_p: 1 };
    }
    // Se o cliente NÃO pediu sampling, não envie nada.
    return undefined;
  }

  // —— Comportamento antigo permanece para modelos sem reasoning ——
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const resolved: { temperature?: number; top_p?: number } = {
    temperature: temperature !== undefined ? clamp(temperature, 0, 2) : 0.2, // default conservador p/ sem reasoning
    top_p: top_p !== undefined ? clamp(top_p, 0, 1) : undefined,
  };
  // Se nada setado de fato, não envie
  if (resolved.temperature === undefined && resolved.top_p === undefined) return undefined;
  return resolved;
}

// ————————————————————————————————————————————————————————————————
// 8) HELPER — Structured Outputs (primeiro) → fallback JSON mode
//     Aqui aplicamos **guards finais**: só incluímos fields se existem.
// ————————————————————————————————————————————————————————————————
async function structuredOrJson(args: {
  model: string;
  messages: ResponsesInput;
  instructions?: string;
  previous_response_id?: string;
  store?: boolean;
  max_output_tokens?: number;
  signal?: AbortSignal;
  verbosity: Verbosity;
  reasoning?: { effort: Effort } | undefined;
  sampling?: Sampling | undefined;
}) {
  const {
    model,
    messages,
    instructions,
    previous_response_id,
    store = true,
    max_output_tokens = 256,
    signal,
    verbosity,
    reasoning,
    sampling,
  } = args;

  // 8.1) Tentativa 1: Structured Outputs (json_schema)
  try {
    const req: any = {
      model,
      input: messages,
      instructions,
      previous_response_id,
      store,
      text: {
        format: zodTextFormat(QuickReply, "quick_reply"),
        verbosity, // suportado por todos
      } as any,
      max_output_tokens,
      ...(reasoning ? { reasoning } : {}), // só envia se suportado
    };

    // sampling: **somente** se veio resolvido (e só temperature/top_p)
    if (sampling?.temperature !== undefined) req.temperature = sampling.temperature;
    if (sampling?.top_p !== undefined) req.top_p = sampling.top_p;

    const res = await client.responses.parse(req, { signal } as RequestOpts);
    // ⬇️ Muitos snapshots expõem o texto bruto mesmo no parse; capturamos se existir
    const raw_text = (res as any)?.output_text as string | undefined;

    if (res.status === "incomplete") {
      throw new Error(`incomplete:${res.incomplete_details?.reason ?? "unknown"}`);
    }

    return {
      mode: "structured" as const,
      id: res.id,
      parsed: res.output_parsed as TQuickReply,
      meta: {
        usage: (res as any).usage ?? undefined,
        incomplete_details: res.incomplete_details ?? undefined,
      },
      openaiRequestEcho: req,
      raw_text, // 🔎 texto bruto (quando disponível) mesmo em sucesso
    };
  } catch (e) {
    // 8.2) Fallback: JSON mode + validação local com Zod
    const req: any = {
      model,
      input: messages,
      instructions:
        (instructions ?? "") +
        "\nRetorne um ÚNICO objeto JSON que obedeça ao schema 'quick_reply'." +
        "\nNÃO envolva em uma chave raiz (ex.: evite { \"quick_reply\": { ... } }).",
      previous_response_id,
      store,
      text: { format: { type: "json_object" } as const },
      max_output_tokens,
      ...(reasoning ? { reasoning } : {}),
    };

    if (sampling?.temperature !== undefined) req.temperature = sampling.temperature;
    if (sampling?.top_p !== undefined) req.top_p = sampling.top_p;

    const res = await client.responses.create(req, { signal } as RequestOpts);

    if (res.status === "incomplete") {
      throw new Error(`incomplete:${res.incomplete_details?.reason ?? "unknown"}`);
    }

    // aceita {quick_reply:{...}} OU objeto direto
    const rawText = res.output_text ?? "{}"; // 🔎 guardamos o bruto SEMPRE no fallback
    let obj: any;
    try {
      obj = JSON.parse(rawText);
    } catch {
      const err: any = new Error("Modelo retornou JSON inválido no fallback.");
      err.__openai = { request: req, raw_output_text: rawText };
      throw err;
    }
    const candidate = obj?.quick_reply ?? obj;
    let parsed: TQuickReply;
    try {
      parsed = QuickReply.parse(candidate);
    } catch (zerr: any) {
      const err: any = new Error(JSON.stringify(zerr?.issues ?? zerr?.message ?? zerr));
      err.__openai = { request: req, raw_output_text: rawText };
      throw err;
    }

    return {
      mode: "json_mode_fallback" as const,
      id: res.id,
      parsed,
      meta: {
        usage: (res as any).usage ?? undefined,
        incomplete_details: res.incomplete_details ?? undefined,
      },
      openaiRequestEcho: req,
      raw_text: rawText, // 🔎 texto bruto do modelo no fallback
    };
  }
}

// ————————————————————————————————————————————————————————————————
// 9) HANDLER — POST /api/openai-source-test-biblia
// ————————————————————————————————————————————————————————————————
export async function POST(request: NextRequest) {
  const t_all0 = Date.now();

  // 9.0) Parse do body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  // Inputs principais
  const userText = (body?.userText ?? "").toString();
  const channel = (body?.channel ?? "whatsapp") as TQuickReply["channel"];
  const sessionKeyInput =
    (body?.sessionId ?? request.headers.get("x-session-id") ?? "dev-session").toString();
  const model = (body?.model ?? "gpt-5").toString();
  const timeoutMs = Number(body?.timeoutMs ?? 16000);
  const captainInstruction = body?.captainInstruction?.toString() ?? "(default)";

  // Preferências globais (fallback)
  const bodyVerbosity = body?.verbosity;
  const bodyEffort = body?.reasoningEffort;

  // Afinadores p/ modelos sem reasoning: top-level OU agrupado
  const nrt = body?.nonReasoningTuning ?? {};
  const bodyTemperature = body?.temperature ?? nrt?.temperature;
  const bodyTopP = body?.topP ?? body?.top_p ?? nrt?.topP ?? nrt?.top_p;

  // Max output tokens (top-level)
  const bodyMaxOutputTokens = pickInt(body?.maxOutputTokens);

  // Preferências do capitão (precedência)
  const captainVerbosity = body?.captainConfig?.verbosity;
  const captainEffort = body?.captainConfig?.reasoningEffort;
  const captainTemperature = body?.captainConfig?.temperature;
  const captainTopP = body?.captainConfig?.topP ?? body?.captainConfig?.top_p;
  const captainMaxOutputTokens = pickInt(body?.captainConfig?.maxOutputTokens);

  // Toggle debug
  const wantDebug = Boolean(body?.debug || request.headers.get("x-debug"));

  // Deriva a sessão de (sessionId + modelo + capitão) — evita vazamento de contexto
  const sessionSalt = hashShort(`${model}::${captainInstruction}`);
  const sessionKey = `${sessionKeyInput}::${sessionSalt}`;

  // 9.1) Validações
  if (!userText) {
    return NextResponse.json(
      { success: false, error: "Campo 'userText' é obrigatório." },
      { status: 400 }
    );
  }
  if (!["whatsapp", "instagram", "messenger"].includes(channel)) {
    return NextResponse.json(
      { success: false, error: "Canal inválido. Use whatsapp|instagram|messenger." },
      { status: 400 }
    );
  }

  // 9.2) Resolve Reasoning/Verbosity com base nas **capacidades** do modelo
  const { verbosity, reasoning, caps } = resolveDynamicPrefs({
    model,
    bodyEffort,
    bodyVerbosity,
    captainEffort,
    captainVerbosity,
  });

  // 9.2.1) Resolve Sampling (somente se caps.sampling=true)
  const sampling = resolveSamplingPrefs({
    caps,
    bodyTemperature,
    bodyTopP,
    captainTemperature,
    captainTopP,
  });

  // 9.2.2) Resolve max_output_tokens (captain > top-level > default 256)
  const resolvedMaxOutputTokens = clamp(
    captainMaxOutputTokens ?? bodyMaxOutputTokens ?? 256,
    64,
    42000
  );

  // 9.3) Timeout/cancelamento
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(1000, timeoutMs));

  // 9.4) Garante sessão persistente (MASTER+CAPTAIN) com fallback stateless
  let previous: string | undefined;
  let statelessInit = false;
  const t_ens0 = Date.now();
  try {
    previous = await ensureSession({ sessionKey, captainInstruction, model }, ac.signal);
  } catch {
    statelessInit = true; // sem âncora: injeta MASTER+CAPTAIN só neste turno
  }
  const t_ens1 = Date.now();

  // 9.5) Mensagens do turno (NÃO poluir o histórico com "Canal alvo")
  const messages: ResponsesInput = [
    ...(statelessInit
      ? [
          { role: "developer" as const, content: MASTER_PROMPT },
          {
            role: "developer" as const,
            content: captainInstruction === "(default)" ? DEFAULT_CAPTAIN : captainInstruction,
          },
        ]
      : []),
    { role: "user" as const, content: userText },
  ];

  // 9.6) Instructions efêmeras (alta prioridade no turno)
  const thinkHint =
    reasoning?.effort === "minimal"
      ? "Antes de responder, pense mentalmente em 2–3 passos (não revele o raciocínio). "
      : "";

  const instructions =
    `${thinkHint}Canal alvo: ${channel}. ` +
    "Retorne SOMENTE no schema 'quick_reply' (sem texto fora do JSON).";

  // Apêndice de "modo estrito" para o retry de correção de schema
  const STRICT_APPEND =
    "\nMODO ESTRITO: retorne EXATAMENTE um objeto JSON com as chaves {\"channel\",\"body\",\"buttons\"}." +
    " \"channel\" ∈ {\"whatsapp\",\"instagram\",\"messenger\"};" +
    " \"body\" é string (≤500 chars);" +
    " \"buttons\" é array (2..3) de objetos {\"title\" (≤20), \"payload\" (string)}." +
    " Não retorne {\"quick_reply\":...}, não retorne array na raiz, nem texto fora do JSON.";

  // 9.7) Geração (Structured → Fallback) com métricas + retry tolerante p/ sampling
  const t_gen0 = Date.now();
  try {
    const attempt = async (opts?: { sampling?: Sampling; strict?: boolean }) => structuredOrJson({
      model,
      messages,
      instructions: instructions + (opts?.strict ? STRICT_APPEND : ""),
      previous_response_id: previous,
      store: true,
      max_output_tokens: resolvedMaxOutputTokens,
      verbosity,
      reasoning, // undefined se o modelo não suporta
      sampling: opts?.sampling ?? sampling, // aplica temperature/top_p se definidos
      signal: ac.signal,
    });
    let r;
    // tracking de retry para debug
    const retryInfo: any = { used: false, reason: null, applied_sampling: null, strict: false };
    try {
      r = await attempt();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      // Alguns snapshots podem rejeitar sampling com reasoning ligado.
      // Se for "Unsupported parameter: 'temperature'/'top_p'", fazemos UM retry sem sampling.
      const unsupportedSampling =
        /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'|is not supported with this model/i.test(msg);
      if (unsupportedSampling) {
        retryInfo.used = true;
        retryInfo.reason = "unsupported_sampling";
        retryInfo.applied_sampling = null;
        r = await attempt({ sampling: undefined /* sem sampling */ });
      } else if (isSchemaArrayError(err)) {
        // Retry "estrito": corrige drift clássico (array na raiz ou quick_reply:[])
        retryInfo.used = true;
        retryInfo.reason = "schema_drift_array";
        retryInfo.strict = true;
        retryInfo.applied_sampling = { temperature: 0.2, top_p: 0.9 };
        r = await attempt({ strict: true, sampling: { temperature: 0.2, top_p: 0.9 } });
      } else {
        throw err;
      }
    }
    const t_gen1 = Date.now();

    // 9.8) Pós-processamento e adaptação por canal
    const safe = normalizeQuickReply(r.parsed);
    const payload = toChannelPayload(safe);

    // 9.9) Atualiza ponteiro com TTL
    await setSessionPointer(sessionKey, r.id);

    // 9.10) Resposta (com DEBUG opcional + transparência dos guards)
    const response = {
      success: true as const,
      mode: r.mode,
      session: { previous_response_id: r.id, sessionKey },
      data: safe,
      payload,
      ...(wantDebug && {
        debug: {
          endpoint: "responses.parse/create",
          request_body: {
            userText,
            channel,
            model,
            sessionKey,
            timeoutMs,
            captainInstruction,
                         resolved: {
               reasoningEffort: reasoning?.effort ?? "(not-supported)",
               verbosity,
               modelCaps: caps,
               sampling: sampling ?? "(none)",
               max_output_tokens: resolvedMaxOutputTokens,
             },

            clientPrefs: {
              topLevel: { verbosity: bodyVerbosity, reasoningEffort: bodyEffort },
              captain: { verbosity: captainVerbosity, reasoningEffort: captainEffort },
              sampling: {
                // mostramos de onde veio cada valor
                topLevelOrNRT: { temperature: bodyTemperature, top_p: bodyTopP },
                captain: { temperature: captainTemperature, top_p: captainTopP },
              },
              max_output_tokens: {
                topLevel: bodyMaxOutputTokens ?? "(unset)",
                captain: captainMaxOutputTokens ?? "(inherit)",
              },
            },
                         // 👇 Transparência: por que omitimos coisas + se houve retry
             guards: {
               reasoning_sent: Boolean(reasoning),
               sampling_sent: Boolean((r as any)?.openaiRequestEcho?.temperature ?? (r as any)?.openaiRequestEcho?.top_p ?? sampling),
               notes: [
                 caps.reasoning ? undefined : "Reasoning omitido: modelo não suporta.",
                 caps.sampling ? undefined : "Sampling omitido: modelo não suporta temperature/top_p.",
                 caps.reasoning && sampling && (sampling.temperature !== 1 || sampling.top_p !== 1)
                   ? "Sampling normalizado para {temperature:1, top_p:1} em modelo com reasoning."
                   : undefined,
               ].filter(Boolean),
             },
             retry: retryInfo,
          },
          openai: {
            request: {
              ...r.openaiRequestEcho,
              text: { ...(r.openaiRequestEcho?.text as any), format: "json_schema_or_json_object" },
            },
            response_meta: {
              id: r.id,
              status: "ok",
              incomplete_details: r.meta.incomplete_details ?? null,
              usage: r.meta.usage ?? null,
            },
            raw_response_snippet: {
              output_contract_preview: safe,
              raw_text: r.raw_text ?? null, // 🔎 sempre que tivermos, mostramos
            },
          },
          server_timing_ms: {
            total: Date.now() - t_all0,
            ensureSession: t_ens1 - t_ens0,
            openai: t_gen1 - t_gen0,
            statelessInit,
          },
        },
      }),
    };

    return NextResponse.json(response);
  } catch (err: any) {
    const isAbort = err?.name === "AbortError" || String(err).includes("aborted");

    const errorPayload: any = {
      success: false as const,
      error: isAbort ? "Timeout: request abortada pelo signal." : err?.message ?? String(err),
    };

    if (wantDebug) {
      errorPayload.debug = {
        openai: err?.__openai
          ? { request: err.__openai.request, raw_response_snippet: err.__openai.raw_output_text }
          : undefined,
        server_timing_ms: Date.now() - t_all0,
      };
    }

    return NextResponse.json(errorPayload, { status: isAbort ? 408 : 500 });
  } finally {
    clearTimeout(timer);
  }
}

/* ======================================================================
 *  PLAYBOOK RÁPIDO — pontos de produção que valem ouro
 * ======================================================================
 *
 * • Guards por modelo:
 *   → Defina no MODEL_CAPS se o snapshot suporta `reasoning` e/ou `sampling`.
 *   → Se aparecer "Unsupported parameter: temperature", ponha `sampling:false`.
 *   → Se aparecer "reasoning not supported", deixe `reasoning:false` no snapshot.
 *
 * • Structured Outputs + temperature/top_p:
 *   → Para contratos rígidos (JSON/Zod), mantenha temperature baixo (0.2–0.5).
 *   → top_p ~0.9–1.0 funciona bem. Em dúvida, **não** envie top_p.
 *
 * • Verbosity:
 *   → Todos suportam; use low/medium/high conforme sua UI/UX.
 *
 * • max_output_tokens:
 *   → Default 256. Se ver `incomplete:max_output_tokens`, suba para 384–512.
 *   → Herdável: `captainConfig.maxOutputTokens` > `maxOutputTokens`.
 *
 * • Estado server-side:
 *   → `store:true` + `previous_response_id` + Redis TTL → turnos rápidos e baratos.
 *   → Isolamento por `(sessionId + model + captainInstruction)`.
 *   → Lock leve (NX EX) previne corrida ao criar a âncora.
 *
 * • Observabilidade:
 *   → `debug:true` expõe **eco do request** enviado à OpenAI, meta (usage) e
 *     `guards` (o que foi suprimido) + `server_timing_ms`.
 *
 * • Segurança/Custos:
 *   → Chave server-only. Ajuste `max_output_tokens` ao seu contrato.
 *   → Monitore `usage` para alocar orçamento/token.
 *
 * • Extensões:
 *   → +Agentes: altere `captainInstruction`.
 *   → +Canais: adicione adapter e expanda o enum do schema.
 *   → +Contratos: crie novos Zod (Cards/Forms/Tables) e plugue no mesmo pipeline.
 */
