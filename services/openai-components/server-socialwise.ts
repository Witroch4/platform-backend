// services/openai-components/server-socialwise.ts
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  IntentCandidate,
  AgentConfig,
  WarmupButtonsResponse,
  RouterDecision,
  ChannelType,
} from "./types";
// import { responsesCall } from "@/lib/cost/openai-wrapper"; // (opcional) não usado aqui
import { withDeadlineAbort } from "./utils";

// ==== MASTER_PROMPT - Lógica de negócio imutável ====
const MASTER_PROMPT = `
# MASTER
Você é um assistente especializado em geração de respostas estruturadas para chatbots.
Sempre retorne EXATAMENTE no schema especificado, sem texto fora do JSON.
Foque em respostas concisas, profissionais e acionáveis.
`;

// ==== Structured Outputs with Fallback Pattern ====
interface StructuredOrJsonResult<T> {
  mode: "structured" | "json_mode_fallback";
  id: string;
  parsed: T;
  meta: {
    usage?: any;
    incomplete_details?: any;
  };
  openaiRequestEcho: any;
  raw_text?: string;
}

// Heurística para detectar o drift mais comum: raiz como array ou { schema_name: [...] }
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
      // Verifica se tem alguma chave que é array quando deveria ser objeto (ex: { router_decision: [...] })
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          // Só considera erro se for array não-vazio ou se a chave sugere que deveria ser objeto
          if (Array.isArray(obj[key]) && (obj[key].length > 0 || key.includes('_decision') || key.includes('_response'))) {
            return true;
          }
        }
      }
    }
  } catch {}
  return false;
}

// Resolve sampling preferences following the test route pattern
function resolveSamplingPrefs(args: {
  caps: { reasoning: boolean; sampling: boolean };
  agent: AgentConfig;
}): { temperature?: number; top_p?: number } | undefined {
  if (!args.caps.sampling) return undefined;

  const temperature = args.agent.tempCopy ?? args.agent.temperature;
  const top_p = args.agent.topP;

  // ⚠️ REGRA DA BÍBLIA:
  // Em modelos com reasoning, a API só aceita sampling "neutro".
  // Se o agente tem sampling configurado, normalize para { temperature:1, top_p:1 }.
  if (args.caps.reasoning) {
    const userAskedSampling = (temperature !== undefined && temperature !== null) || 
                             (top_p !== undefined && top_p !== null);
    if (userAskedSampling) {
      return { temperature: 1, top_p: 1 };
    }
    // Se o agente NÃO pediu sampling, não envie nada.
    return undefined;
  }

  // —— Comportamento para modelos sem reasoning ——
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const resolved: { temperature?: number; top_p?: number } = {
    temperature: (temperature !== undefined && temperature !== null) ? clamp(temperature, 0, 2) : 0.2, // default conservador
    top_p: (top_p !== undefined && top_p !== null) ? clamp(top_p, 0, 1) : undefined,
  };
  // Se nada setado de fato, não envie
  if (resolved.temperature === undefined && resolved.top_p === undefined) return undefined;
  return resolved;
}

async function structuredOrJson<T>(args: {
  client: OpenAI;
  model: string;
  messages: Array<{ role: string; content: string }>;
  instructions?: string;
  previous_response_id?: string;
  store?: boolean;
  max_output_tokens?: number;
  signal?: AbortSignal;
  verbosity?: string;
  reasoning?: { effort: string };
  agent: AgentConfig;
  schema: any;
  schemaName: string;
  strict?: boolean;
}): Promise<StructuredOrJsonResult<T>> {
  const {
    client,
    model,
    messages,
    instructions,
    previous_response_id,
    store = true,
    max_output_tokens,
    signal,
    verbosity,
    reasoning,
    agent,
    schema,
    schemaName,
    strict = false,
  } = args;

  const caps = getModelCaps(model);
  
  // Resolve sampling usando a lógica da bíblia
  const sampling = resolveSamplingPrefs({ caps, agent });

  // Apêndice de "modo estrito" para o retry de correção de schema
  const STRICT_APPEND =
    "\nMODO ESTRITO: retorne EXATAMENTE um objeto JSON válido no schema especificado." +
    " Não retorne array na raiz, nem texto fora do JSON." +
    " Use estrutura de objeto simples e direta.";

  // 1) Tentativa: Structured Outputs (se suportado)
  if (caps.structured) {
    try {
      const req: any = {
        model,
        input: messages,
        instructions: instructions + (strict ? STRICT_APPEND : ""),
        previous_response_id,
        store,
        text: {
          format: zodTextFormat(schema, schemaName),
          ...(verbosity && caps.reasoning && isGPT5(model) ? { verbosity } : {}),
        },
        max_output_tokens,
        ...(reasoning && caps.reasoning ? { reasoning } : {}),
      };

      // Sampling: se strict mode, usa sampling conservador da bíblia
      if (strict) {
        req.temperature = 0.2;
        req.top_p = 0.9;
      } else if (sampling?.temperature !== undefined) {
        req.temperature = sampling.temperature;
      }
      if (!strict && sampling?.top_p !== undefined) {
        req.top_p = sampling.top_p;
      }

      const res = await client.responses.parse(req, { signal } as any);
      const raw_text = (res as any)?.output_text as string | undefined;

      if (res.status === "incomplete") {
        throw new Error(`incomplete:${res.incomplete_details?.reason ?? "unknown"}`);
      }

      return {
        mode: "structured" as const,
        id: res.id,
        parsed: res.output_parsed as T,
        meta: {
          usage: (res as any).usage ?? undefined,
          incomplete_details: res.incomplete_details ?? undefined,
        },
        openaiRequestEcho: req,
        raw_text,
      };
    } catch (e: any) {
      // Se já estamos em strict mode, não tenta mais retry
      if (strict) {
        throw e;
      }

      const msg = String(e?.message ?? e);
      
      // Se for erro de sampling não suportado, tenta sem sampling
      const unsupportedSampling = /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'|is not supported with this model/i.test(msg);
      
      if (unsupportedSampling) {
        console.warn("Sampling not supported, retrying without sampling:", e?.message);
        // Retry sem sampling
        return structuredOrJson({
          ...args,
          agent: { ...agent, tempCopy: undefined, temperature: null, topP: null }
        });
      }

      // Se for erro de schema array (drift clássico), tenta modo estrito
      if (isSchemaArrayError(e)) {
        console.warn("Schema array error detected, retrying with strict mode:", e?.message);
        // Retry "estrito": corrige drift clássico (array na raiz ou schema_name:[])
        return structuredOrJson({
          ...args,
          strict: true
        });
      }
      
      // Se for erro de schema, tenta fallback
      const isSchemaError = e?.code === "invalid_json_schema" || 
                           e?.param === "text.format.schema" ||
                           String(e?.message || "").includes("invalid_json_schema");
      
      if (!isSchemaError) {
        throw e; // Re-throw outros erros
      }
      
      console.warn("Structured Outputs failed, falling back to JSON mode:", e?.message);
    }
  }

  // 2) Fallback: JSON mode + validação local
  const req: any = {
    model,
    input: messages,
    instructions:
      (instructions ?? "") +
      `\nRetorne um ÚNICO objeto JSON que obedeça ao schema '${schemaName}'.` +
      "\nNÃO envolva em uma chave raiz." +
      (strict ? STRICT_APPEND : ""),
    previous_response_id,
    store,
    text: { format: { type: "json_object" } as const },
    max_output_tokens,
    ...(reasoning && caps.reasoning ? { reasoning } : {}),
  };

  // No fallback, também aplicamos a mesma lógica de sampling
  if (strict) {
    req.temperature = 0.2;
    req.top_p = 0.9;
  } else {
    if (sampling?.temperature !== undefined) {
      req.temperature = sampling.temperature;
    }
    if (sampling?.top_p !== undefined) {
      req.top_p = sampling.top_p;
    }
  }

  const res = await client.responses.create(req, { signal } as any);

  if (res.status === "incomplete") {
    throw new Error(`incomplete:${res.incomplete_details?.reason ?? "unknown"}`);
  }

  const rawText = res.output_text ?? "{}";
  let obj: any;
  try {
    obj = JSON.parse(rawText);
  } catch {
    const err: any = new Error("Modelo retornou JSON inválido no fallback.");
    err.__openai = { request: req, raw_output_text: rawText };
    throw err;
  }

  // aceita {schema_name:{...}} OU objeto direto
  const candidate = obj?.[schemaName] ?? obj;
  let parsed: T;
  try {
    parsed = schema.parse(candidate);
  } catch (zerr: any) {
    // Se não estamos em strict mode e é erro de schema array, tenta strict mode
    if (!strict && isSchemaArrayError(zerr)) {
      console.warn("Schema array error in JSON mode, retrying with strict mode");
      return structuredOrJson({
        ...args,
        strict: true
      });
    }
    
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
    raw_text: rawText,
  };
}

// ===== SCHEMAS ZOD (seguindo o guia à risca) =====

/** Helper para limites por canal */
function getConstraintsForChannel(channel: ChannelType) {
  if (channel === "whatsapp") {
    return {
      bodyMax: 1024,
      buttonTitleMax: 20,
      payloadMax: 256,
      maxButtons: 3,
      titleWordMax: 4,
    };
  }
  if (channel === "instagram") {
    return {
      bodyMax: 640,
      buttonTitleMax: 20,
      payloadMax: 1000,
      maxButtons: 3,
      titleWordMax: 4,
    };
  }
  // facebook / genérico
  return {
    bodyMax: 2000,
    buttonTitleMax: 20,
    payloadMax: 1000,
    maxButtons: 3,
    titleWordMax: 4,
  };
}

/** Factory de schema de botão por canal (evita allOf/anyOf) */
function createButtonSchemaForChannel(channel: ChannelType) {
  const { buttonTitleMax, payloadMax } = getConstraintsForChannel(channel);
  
  // Usar apenas regex para evitar allOf - não combinar múltiplas validações
  const titleRegex = new RegExp(`^.{1,${buttonTitleMax}}$`, "u");
  // Permitir string vazia OU formato @slug para payload
  const payloadRegex = new RegExp(`^(|@[a-z0-9_]{1,${payloadMax}})$`, "u");
  
  return z
    .object({
      title: z.string().regex(titleRegex, `máx ${buttonTitleMax} caracteres`),
      // Para evitar anyOf, usar string com default vazio em vez de nullable
      payload: z.string().regex(payloadRegex, `formato @slug ou vazio`).default(""),
    })
    .strict();
}

/** Schema Zod para botões de warmup/freechat (compatível com Structured Outputs) */
function createButtonsSchema(channel: ChannelType) {
  const { bodyMax, maxButtons } = getConstraintsForChannel(channel);
  const Btn = createButtonSchemaForChannel(channel);
  
  return z
    .object({
      introduction_text: z
        .string()
        .regex(new RegExp(`^.{1,${bodyMax}}$`, "u"), `máx ${bodyMax} caracteres`),
      buttons: z.array(Btn).min(1).max(maxButtons),
    })
    .strict();
}

/** Schema Zod para decisão do router (compatível com Structured Outputs) */
function createRouterSchema(channel: ChannelType) {
  const { bodyMax, maxButtons } = getConstraintsForChannel(channel);
  const Btn = createButtonSchemaForChannel(channel);
  
  return z
    .object({
      mode: z.enum(["intent", "chat"]),
      // Para evitar anyOf, usar string com default vazio em vez de nullable
      // Permitir string vazia OU formato @slug
      intent_payload: z
        .string()
        .regex(/^(|@[a-z0-9_]+)$/u)
        .default(""),
      // Permitir string vazia OU texto válido
      introduction_text: z
        .string()
        .regex(new RegExp(`^(|.{1,${bodyMax}})$`, "u"))
        .default(""),
      text: z
        .string()
        .regex(new RegExp(`^(|.{1,${bodyMax}})$`, "u"))
        .default(""),
      buttons: z.array(Btn).max(maxButtons).default([]),
    })
    .strict();
}

// ===== TYPES INFERIDOS DO ZOD =====
// type TShortTitles removido - usando tipo dinâmico
// type TButton = z.infer<typeof ButtonSchema>; // substituído por schema por canal



// ==== Model Capabilities System ====
interface ModelCapabilities {
  reasoning: boolean;    // Supports reasoning.effort
  structured: boolean;   // Supports Structured Outputs
  sampling: boolean;     // Supports temperature/top_p
  label: string;
}

const MODEL_CAPS: Record<string, ModelCapabilities> = {
  "gpt-5": { reasoning: true, structured: true, sampling: true, label: "GPT-5" },
  "gpt-5-nano": { reasoning: true, structured: true, sampling: false, label: "GPT-5 Nano" }, // Não suporta temperature com reasoning
  "gpt-4.1-nano": { reasoning: false, structured: true, sampling: true, label: "GPT-4.1 Nano" },
};

// ==== Helpers GPT-5 (case-insensitive) ====
const isGPT5 = (m?: string) => (m || "").toLowerCase().includes("gpt-5");
const normEffort = (e?: string) =>
  e === "low" || e === "medium" || e === "high" ? e : "low"; // "minimal" => "low"
const normVerb = (v?: string) =>
  v === "low" || v === "medium" || v === "high" ? v : "low";

// Get model capabilities with fallback
function getModelCaps(model: string): ModelCapabilities {
  return MODEL_CAPS[model] ?? { 
    reasoning: false, 
    structured: true, 
    sampling: false, 
    label: model 
  };
}

// Mescla Structured Outputs + (opcional) verbosity do GPT-5
function buildTextFormat<T>(schema: T, name: string, agent: AgentConfig) {
  const caps = getModelCaps(agent.model);
  const base: any = { format: zodTextFormat(schema as any, name) };
  
  // Só adiciona verbosity se o modelo suportar (GPT-5 family)
  if (caps.reasoning && isGPT5(agent.model)) {
    base.verbosity = normVerb((agent as any).verbosity);
  }
  
  return base;
}

/**
 * Generates short titles for multiple intent candidates in a single batch call
 * Optimized for SOFT band processing in SocialWise Flow
 */
export async function generateShortTitlesBatch(
  this: { client: OpenAI },
  intents: IntentCandidate[],
  agent: AgentConfig
): Promise<string[] | null> {
  if (!intents.length) return [];

  const items = intents
    .map(
      (intent, i) =>
        `${i + 1}. ${intent.slug}: ${intent.desc || intent.name || intent.slug}`
    )
    .join("\n");

  // ✅ HIERARQUIA MODERNA: Instructions para identidade + 1 developer para regras específicas
  const taskRules = `
# OBJETIVO
Gerar títulos curtos e acionáveis para cada serviço jurídico.

# REGRAS
- Títulos: até 20 caracteres (obrigatório).
- Linguagem neutra e profissional.
- Retorne SOMENTE no schema 'ShortTitles' (sem explicações fora do JSON).
`;

  const user = `Serviços (na ordem):\n${items}`;

  return withDeadlineAbort(async (signal) => {
    try {
      // Schema dinâmico: exigir a mesma quantidade de títulos que intents
      const ShortTitlesSchemaN = z
        .object({
          titles: z
            .array(
              z.string().regex(/^.{1,20}$/u, "máx 20 caracteres")
            )
            .length(intents.length),
        })
        .strict();

      const caps = getModelCaps(agent.model);
      const result = await structuredOrJson<{ titles: string[] }>({
        client: this.client,
        model: agent.model,
        messages: [
          { role: "developer", content: MASTER_PROMPT },
          { role: "developer", content: taskRules },
          { role: "user", content: user },
        ],
        instructions: agent.instructions || "Você é um UX writer jurídico. Siga o schema estritamente.",
        max_output_tokens: agent.maxOutputTokens || 256,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema: ShortTitlesSchemaN,
        schemaName: "ShortTitles",
        signal,
      });

      return result.parsed.titles;
    } catch (error) {
      console.error("Erro ao gerar títulos curtos em lote:", error);
      return null;
    }
  }, agent.warmupDeadlineMs || 15000);
}

/**
 * 🎯 NOVA FUNCIONALIDADE: Chat livre com IA gerando botões dinâmicos
 * Usado na banda LOW quando não há intenções claras mas cliente quer conversar
 */
export async function generateFreeChatButtons(
  this: { client: OpenAI },
  userText: string,
  agent: AgentConfig,
  opts?: { channelType?: ChannelType }
): Promise<WarmupButtonsResponse | null> {
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);
  const c = getConstraintsForChannel(channel);

  // ✅ HIERARQUIA MODERNA: Instructions para identidade + 1 developer para regras específicas
  const taskRules = `
# OBJETIVO
Gerar uma resposta curta (introduction_text) e 2–3 botões objetivos para avançar a conversa.

# REGRAS
- Títulos de botões: até 20 caracteres (obrigatório).
- Payload: formato @slug (obrigatório).
- introduction_text: até ${c.bodyMax} caracteres.
- Linguagem neutra e profissional.
- Retorne SOMENTE no schema 'FreeChatButtons' (sem explicações fora do JSON).
`;

  const user = `Cliente: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages: [
          { role: "developer", content: MASTER_PROMPT },
          { role: "developer", content: taskRules },
          { role: "user", content: user },
        ],
        instructions: agent.instructions || "Você é um UX writer jurídico. Siga o schema estritamente.",
        max_output_tokens: agent.maxOutputTokens || 256,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "FreeChatButtons",
        signal,
      });

      return result.parsed;
    } catch (error) {
      console.error("Erro ao gerar chat livre com botões:", error);
      return null;
    }
  }, agent.warmupDeadlineMs || 15000);
}

/**
 * Generates warmup buttons with contextual introduction for uncertain intents
 * Used in SOFT band processing (0.65-0.79 similarity score)
 */
export async function generateWarmupButtons(
  this: { client: OpenAI },
  userText: string,
  candidates: IntentCandidate[],
  agent: AgentConfig,
  opts?: { channelType?: ChannelType }
): Promise<WarmupButtonsResponse | null> {
  if (!candidates.length) return null;

  const candidatesText = candidates
    .map((c, i) => `${i + 1}. @${c.slug}: ${c.desc || c.name || c.slug}`)
    .join("\n");

  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);
  const c = getConstraintsForChannel(channel);

  // ✅ HIERARQUIA MODERNA: Instructions para identidade + 1 developer para regras específicas
  const taskRules = `
# OBJETIVO
Gerar uma pequena introdução e botões para desambiguar a intenção do usuário.

# REGRAS
- Títulos de botões: até 20 caracteres (obrigatório).
- Payload: formato @slug (obrigatório).
- introduction_text: até ${c.bodyMax} caracteres.
- Linguagem neutra e profissional.
- Retorne SOMENTE no schema 'WarmupButtons' (sem explicações fora do JSON).
`;

  const user = `Intenções candidatas:\n${candidatesText}\n\nMensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages: [
          { role: "developer", content: MASTER_PROMPT },
          { role: "developer", content: taskRules },
          { role: "user", content: user },
        ],
        instructions: agent.instructions || "Você é um UX writer jurídico. Siga o schema estritamente.",
        max_output_tokens: agent.maxOutputTokens || 256,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "WarmupButtons",
        signal,
      });

      return result.parsed;
    } catch (error) {
      console.error("Erro ao gerar botões de aquecimento:", error);
      return null;
    }
  }, agent.softDeadlineMs || 15000);
}

/**
 * Router LLM for embedipreview=false mode
 * Decides between intent classification and open chat
 */
export async function routerLLM(
  this: { client: OpenAI },
  userText: string,
  agent: AgentConfig,
  opts?: { channelType?: ChannelType }
): Promise<RouterDecision | null> {
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createRouterSchema(channel);
  const c = getConstraintsForChannel(channel);

  // ✅ HIERARQUIA MODERNA: Instructions para identidade + 1 developer para regras específicas
  const taskRules = `
# OBJETIVO
Decida entre roteamento para intenção específica ou chat livre.

# REGRAS
- mode='intent' quando houver uma intenção clara (inclua intent_payload no formato @slug).
- mode='chat' caso contrário (inclua text ou introduction_text + buttons).
- Títulos de botões: até 20 caracteres.
- Payload: formato @slug.
- Textos: até ${c.bodyMax} caracteres.
- Retorne SOMENTE no schema 'RouterDecision' (sem explicações fora do JSON).
`;

  const user = `Mensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      const result = await structuredOrJson<RouterDecision>({
        client: this.client,
        model: agent.model,
        messages: [
          { role: "developer", content: MASTER_PROMPT },
          { role: "developer", content: taskRules },
          { role: "user", content: user },
        ],
        instructions: agent.instructions || "Você é um roteador inteligente. Siga o schema estritamente.",
        max_output_tokens: agent.maxOutputTokens || 512,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "RouterDecision",
        signal,
      });

      // Validate the response structure
      if (!result.parsed.mode || !["intent", "chat"].includes(result.parsed.mode)) {
        return null;
      }

      return result.parsed;
    } catch (error) {
      console.error("Erro no Router LLM:", error);
      return null;
    }
  }, agent.hardDeadlineMs || 15000);
}
