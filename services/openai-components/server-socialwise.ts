// services/openai-components/server-socialwise.ts
import OpenAI from "openai";
import {
  IntentCandidate,
  AgentConfig,
  WarmupButtonsResponse,
  RouterDecision,
  ChannelType,
} from "./types";
import { responsesCall } from "@/lib/cost/openai-wrapper";
import { withDeadlineAbort } from "./utils";

/** Limites por canal */
function getConstraintsForChannel(channel: ChannelType) {
  if (channel === "whatsapp") {
    return {
      bodyMax: 1024,
      buttonTitleMax: 20,
      payloadMax: 256,
      maxButtons: 3,
      titleWordMax: 4,
      payloadPattern: "^@[a-z0-9_]+$",
    };
  }
  if (channel === "instagram") {
    return {
      bodyMax: 640,
      buttonTitleMax: 20,
      payloadMax: 1000,
      maxButtons: 3,
      titleWordMax: 4,
      payloadPattern: "^@[a-z0-9_]+$",
    };
  }
  // facebook / genérico
  return {
    bodyMax: 2000,
    buttonTitleMax: 20,
    payloadMax: 1000,
    maxButtons: 3,
    titleWordMax: 4,
    payloadPattern: "^@[a-z0-9_]+$",
  };
}

// até 4 palavras (1 a 4 tokens separados por espaço)
const FOUR_WORDS_REGEX = "^(?:\\S+)(?:\\s+\\S+){0,3}$";

/** Schema p/ botões ({ introduction_text, buttons[] }) */
function buildButtonsSchema(channel: ChannelType) {
  const c = getConstraintsForChannel(channel);
  return {
    type: "object",
    additionalProperties: false,
    required: ["introduction_text", "buttons"],
    properties: {
      introduction_text: { type: "string", maxLength: c.bodyMax },
      buttons: {
        type: "array",
        minItems: 1,
        maxItems: c.maxButtons,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "payload"],
          properties: {
            title: {
              type: "string",
              maxLength: c.buttonTitleMax,
              pattern: FOUR_WORDS_REGEX,
            },
            payload: {
              type: "string",
              maxLength: c.payloadMax,
              pattern: "^@[a-z0-9_]+$",
            },
          },
        },
      },
    },
  };
}

/** Schema p/ router ({ mode, intent_payload?, text?, introduction_text?, buttons? }) */
function buildRouterSchema(channel: ChannelType) {
  const c = getConstraintsForChannel(channel);
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: { type: "string", enum: ["intent", "chat"] },
      intent_payload: {
        type: "string",
        maxLength: c.payloadMax,
        pattern: "^@[a-z0-9_]+$",
      },
      introduction_text: { type: "string", maxLength: c.bodyMax },
      text: { type: "string", maxLength: c.bodyMax },
      buttons: {
        type: "array",
        minItems: 0,
        maxItems: c.maxButtons,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "payload"],
          properties: {
            title: {
              type: "string",
              maxLength: c.buttonTitleMax,
              pattern: FOUR_WORDS_REGEX,
            },
            payload: {
              type: "string",
              maxLength: c.payloadMax,
              pattern: "^@[a-z0-9_]+$",
            },
          },
        },
      },
    },
  };
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
  // Schema: array de strings, cada uma <=20 chars e <=4 palavras
  const titlesSchema = {
    type: "array",
    minItems: intents.length,
    maxItems: intents.length,
    items: { type: "string", maxLength: 20, pattern: FOUR_WORDS_REGEX },
    additionalItems: false,
  };
  const system =
    "Você é um UX writer jurídico. Gere títulos curtos e acionáveis para cada serviço, respeitando: <=20 caracteres e <=4 palavras. Responda somente no JSON do schema.";
  const user = `Serviços (na ordem):\n${items}`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [
            {
              role: "system",
              content: agent.developer || agent.instructions || "",
            },
            { role: "system", content: system },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
          store: false,
          temperature: agent.tempSchema ?? 0.2,
          max_output_tokens: 256,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ShortTitles",
              schema: titlesSchema,
              strict: true,
            },
          },
        },
        {
          traceId: `short-titles-batch-${Date.now()}`,
          intent: "short_titles_generation",
        },
        { signal, timeout: agent.warmupDeadlineMs || 250 }
      );

      const titles = (response as any).output_parsed;
      if (!Array.isArray(titles)) return null;

      return titles as string[];
    } catch (error) {
      console.error("Erro ao gerar títulos curtos em lote:", error);
      return null;
    }
  }, agent.warmupDeadlineMs || 250);
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
  // 🎯 USAR INSTRUÇÕES DO AGENTE configurado no Capitão
  const agentInstructions =
    agent.instructions ||
    agent.developer ||
    "Você é um assistente especializado.";

  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = buildButtonsSchema(channel);
  const c = getConstraintsForChannel(channel);
  const sys = [
    "Gere resposta natural e botões para avançar a conversa.",
    `No máximo ${c.maxButtons} botões; cada título ≤20 caracteres e ≤4 palavras; payload ^@[a-z0-9_]+$.`,
    `introduction_text ≤ ${c.bodyMax} caracteres.`,
    "Responda APENAS no JSON do schema.",
  ].join(" ");
  const user = `Cliente: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [
            { role: "system", content: agentInstructions },
            { role: "system", content: sys },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
          store: false,
          temperature: agent.tempCopy ?? 0.7,
          max_output_tokens: 256,
          response_format: {
            type: "json_schema",
            json_schema: { name: "FreeChatButtons", schema, strict: true },
          },
          ...(agent.reasoningEffort &&
            (agent.model.includes("o1") || agent.model.includes("gpt-5")) && {
              reasoning: { effort: agent.reasoningEffort },
            }),
          ...(agent.verbosity &&
            agent.model.includes("gpt-5") && {
              text: { verbosity: agent.verbosity },
            }),
        },
        { traceId: `freechat-${Date.now()}`, intent: "freechat_generation" },
        { signal, timeout: agent.warmupDeadlineMs || 1000 }
      );

      const result = (response as any).output_parsed as
        | WarmupButtonsResponse
        | undefined;
      if (!result) return null;

      return result;
    } catch (error) {
      console.error("Erro ao gerar chat livre com botões:", error);
      return null;
    }
  }, agent.warmupDeadlineMs || 1000);
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

  // 🎯 CORRIGIDO: Usar instruções do agente configurado no Capitão
  const agentInstructions =
    agent.instructions ||
    agent.developer ||
    "Você é um assistente especializado.";

  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = buildButtonsSchema(channel);
  const c = getConstraintsForChannel(channel);
  const sys = [
    "Gere uma pequena introdução e botões para desambiguar a intenção do usuário.",
    `No máximo ${c.maxButtons} botões; cada título ≤20 caracteres e ≤4 palavras; payload ^@[a-z0-9_]+$.`,
    `introduction_text ≤ ${c.bodyMax} caracteres.`,
    "Responda APENAS no JSON do schema.",
  ].join(" ");
  const user = `Intenções candidatas:\n${candidatesText}\n\nMensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [
            { role: "system", content: agentInstructions },
            { role: "system", content: sys },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
          store: false,
          temperature: agent.tempCopy ?? 0.5,
          max_output_tokens: 256,
          response_format: {
            type: "json_schema",
            json_schema: { name: "WarmupButtons", schema, strict: true },
          },
        },
        {
          traceId: `warmup-buttons-${Date.now()}`,
          intent: "warmup_buttons_generation",
        },
        { signal, timeout: agent.softDeadlineMs || 300 }
      );

      const result = (response as any).output_parsed as
        | WarmupButtonsResponse
        | undefined;
      if (!result) return null;

      return result;
    } catch (error) {
      console.error("Erro ao gerar botões de aquecimento:", error);
      return null;
    }
  }, agent.softDeadlineMs || 300); // Slightly longer deadline for complex generation
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
  const schema = buildRouterSchema(channel);
  const c = getConstraintsForChannel(channel);
  const sys = [
    "Você é um roteador.",
    "mode='intent' quando houver uma intenção clara (payload ^@[a-z0-9_]+$).",
    `Caso contrário, mode='chat' com texto ≤${c.bodyMax} e até ${c.maxButtons} botões.`,
    "Responda APENAS no JSON do schema.",
  ].join(" ");
  const user = `Mensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [
            {
              role: "system",
              content: agent.developer || agent.instructions || "",
            },
            { role: "system", content: sys },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
          store: false,
          temperature: agent.tempCopy ?? 0.3,
          max_output_tokens: 512,
          response_format: {
            type: "json_schema",
            json_schema: { name: "RouterDecision", schema, strict: true },
          },
        },
        { traceId: `router-llm-${Date.now()}`, intent: "routing_decision" },
        { signal, timeout: agent.hardDeadlineMs || 400 }
      );

      const result = (response as any).output_parsed as
        | RouterDecision
        | undefined;
      if (!result) return null;

      // Validate the response structure
      if (!result.mode || !["intent", "chat"].includes(result.mode)) {
        return null;
      }

      return result;
    } catch (error) {
      console.error("Erro no Router LLM:", error);
      return null;
    }
  }, agent.hardDeadlineMs || 400);
}
