// services/openai-components/structured-outputs.ts
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AgentConfig, ChannelType } from "../types";
import { ensureSession, updateSessionPointer } from "./session-manager";
import { createMasterPrompt } from "./prompt-manager";
import { getModelCaps, isGPT5, resolveSamplingPrefs } from "./model-capabilities";
import { getConstraintsForChannel } from "./channel-constraints";

// ==== Structured Outputs with Fallback Pattern ====
export interface StructuredOrJsonResult<T> {
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

// ---------- Helpers de saneamento para saídas com "sujeira" ----------
function stripCodeFences(s: string): string {
  if (!s) return s;
  // remove ```json ... ``` ou ``` ... ```
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
}

function removeNullBytes(s: string): string {
  return s ? s.replace(/\u0000/g, "") : s;
}

// ---------- Helpers de truncamento seguro ----------
function trimTo(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;
  // corta em limite de caractere (não mexe em surrogate pairs)
  return s.slice(0, max);
}

function coerceLengths<T extends Record<string, any>>(candidate: T, channel?: ChannelType): T {
  if (!channel) return candidate;
  try {
    const c = getConstraintsForChannel(channel);
    const out: any = { ...candidate };

    if (typeof out.response_text === "string") {
      out.response_text = trimTo(out.response_text, c.bodyMax);
    }
    if (Array.isArray(out.buttons)) {
      // trunca títulos e limita quantidade de botões
      out.buttons = out.buttons
        .map((b: any) => ({
          title: trimTo(String(b?.title ?? ""), c.buttonTitleMax),
          payload: String(b?.payload ?? ""),
        }))
        .slice(0, c.maxButtons);
    }
    return out;
  } catch {
    return candidate;
  }
}

// Tenta extrair um bloco JSON quando há texto extra antes/depois
function extractJsonLoose(s: string): string | null {
  if (!s) return null;
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return s.slice(first, last + 1);
}

function sanitizeRawTextForJson(raw: string | undefined): string {
  let t = removeNullBytes(raw || "");
  t = stripCodeFences(t).trim();
  return t;
}

export interface StructuredOrJsonArgs<T> {
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
  sessionId?: string;
  channel?: ChannelType;
  // When true, don't pre-warm a session; create/update pointer only after this call
  disableEnsureSession?: boolean;
  // Stable identifier for session pointer (avoid dynamic content like hints)
  pointerKey?: string;
}

export async function structuredOrJson<T>(args: StructuredOrJsonArgs<T>): Promise<StructuredOrJsonResult<T>> {
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
    sessionId,
    channel,
  } = args;

  const caps = getModelCaps(model);
  
  // Resolve sampling usando a lógica da bíblia
  const sampling = resolveSamplingPrefs({ caps, agent });

  // Se temos sessionId e channel, tenta garantir previous_response_id da sessão
  let finalPreviousResponseId = previous_response_id;
  let finalMessages = messages;
  
  if (sessionId && channel && !previous_response_id && !args.disableEnsureSession) {
    // console.log("🔍 STRUCTURED OR JSON - Tentando obter sessão:", { sessionId, channel, hasPreviousId: !!previous_response_id }); // Log desabilitado temporariamente
    try {
      const sessionResult = await ensureSession({ sessionId, agent, channel }, createMasterPrompt, signal);
      finalPreviousResponseId = sessionResult.responseId;
      
      // Se é nova sessão, inclui master prompt nas mensagens para single-call
      if (sessionResult.isNewSession && !finalPreviousResponseId) {
        console.log("🚀 SINGLE-CALL OPTIMIZATION - Nova sessão já tem developer prompts, mantendo mensagens originais");
        // Não modificar finalMessages - elas já vêm do buildMessages com todos os prompts necessários
      }
      // console.log("🔍 STRUCTURED OR JSON - Previous response ID obtido:", finalPreviousResponseId); // Log desabilitado temporariamente
    } catch (error) {
      console.warn("[Session] Erro ao obter sessão, mantendo mensagens originais do buildMessages:", error);
      // Em caso de erro, mantém as mensagens que já vêm do buildMessages
      // (que já incluem MASTER + TASK_PROMPTS se statelessInit: true)
    }
  } else {
    // console.log("🔍 STRUCTURED OR JSON - Não tentará sessão:", { 
    //   hasSessionId: !!sessionId, 
    //   hasChannel: !!channel, 
    //   hasPreviousId: !!previous_response_id 
    // }); // Log desabilitado temporariamente
  }

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
        input: finalMessages,
        instructions: (instructions ?? "") + (strict ? STRICT_APPEND : ""),
        previous_response_id: finalPreviousResponseId,
        store,
        text: {
          format: zodTextFormat(schema, schemaName),
          ...(verbosity && caps.reasoning && isGPT5(model) ? { verbosity } : {}),
        },
        max_output_tokens,
        ...(reasoning && caps.reasoning ? { reasoning } : {}),
      };

      // 🔍 DEBUG: Log do request original JSON puro para OpenAI
      console.log("🧠 OPENAI RAW REQUEST (JSON):", JSON.stringify(req, null, 2));

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
      const raw_text = sanitizeRawTextForJson((res as any)?.output_text as string | undefined);

      if (res.status === "incomplete") {
        throw new Error(`incomplete:${res.incomplete_details?.reason ?? "unknown"}`);
      }

      const result = {
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

      // Update session pointer after successful response
      if (sessionId && result.id && channel) {
        const stableKey = args.pointerKey ?? instructions ?? 'default';
        await updateSessionPointer(sessionId, model, channel, stableKey, result.id);
      }

      return result;
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
    input: finalMessages,
    instructions:
      (instructions ?? "") +
      `\nRetorne um ÚNICO objeto JSON que obedeça ao schema '${schemaName}'.` +
      "\nNÃO envolva em uma chave raiz." +
      (strict ? STRICT_APPEND : ""),
    previous_response_id: finalPreviousResponseId,
    store,
    max_output_tokens,
    ...(reasoning && caps.reasoning ? { reasoning } : {}),
  };

  // 🔍 DEBUG: Log do fallback request original JSON puro para OpenAI  
  console.log("🧠 OPENAI RAW FALLBACK REQUEST (JSON):", JSON.stringify(req, null, 2));

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

  const rawText = sanitizeRawTextForJson(res.output_text ?? "{}");
  let obj: any;
  try {
    obj = JSON.parse(rawText);
  } catch {
    // Tenta extrair bloco JSON solto (texto extra antes/depois)
    const extracted = extractJsonLoose(rawText);
    if (extracted) {
      try {
        obj = JSON.parse(extracted);
      } catch {}
    }
  }

  if (!obj) {
    const err: any = new Error("Modelo retornou JSON inválido no fallback.");
    err.__openai = { request: req, raw_output_text: rawText };
    throw err;
  }

  // aceita {schema_name:{...}} OU objeto direto
  let candidate = obj?.[schemaName] ?? obj;
  
  // 🛟 Fallback de truncamento antes da validação Zod
  candidate = coerceLengths(candidate, channel);
  
  let parsed: T;
  try {
    parsed = schema.parse(candidate);
  } catch (zerr: any) {
    // Se estourou tamanho, tenta uma coerção extra e re-parse
    const issues = Array.isArray(zerr?.issues) ? zerr.issues : [];
    const hasSizeIssue = issues.some((it: any) =>
      it?.path?.includes("response_text") || it?.path?.includes("buttons")
    );
    if (hasSizeIssue) {
      try {
        candidate = coerceLengths(candidate, channel);
        parsed = schema.parse(candidate);
      } catch {}
    }
    
    // Se não estamos em strict mode e é erro de schema array, tenta strict mode
    if (!strict && isSchemaArrayError(zerr)) {
      console.warn("Schema array error in JSON mode, retrying with strict mode");
      return structuredOrJson({
        ...args,
        strict: true
      });
    }

    // Loga uma amostra do texto bruto para diagnóstico (truncado)
    const sample = (rawText || "").slice(0, 800);
    const err: any = new Error(JSON.stringify(zerr?.issues ?? zerr?.message ?? zerr));
    err.__openai = { request: req, raw_output_text: rawText };
    console.error("[JSON Fallback] Schema parse failed. Raw sample:", sample);
    throw err;
  }

  const result = {
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

  // Update session pointer after successful response
  if (sessionId && result.id && channel) {
    const stableKey = args.pointerKey ?? instructions ?? 'default';
    await updateSessionPointer(sessionId, model, channel, stableKey, result.id);
  }

  return result;
}
