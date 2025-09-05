// services/openai-components/ai-functions.ts
import OpenAI from "openai";
import { z } from "zod";
import { IntentCandidate, AgentConfig, WarmupButtonsResponse, RouterDecision, ChannelType } from "./types";
import { withDeadlineAbort } from "./utils";
import { createButtonsSchema, createRouterSchema } from "./channel-constraints";
import { buildMessages } from "./prompt-manager";
import { structuredOrJson } from "./structured-outputs";
import { ensureSession } from "./session-manager";
import { createMasterPrompt } from "./prompt-manager";
import { getModelCaps, isGPT5, normVerb, normEffort } from "./model-capabilities";

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

      const messages = buildMessages(
        { channel: "whatsapp", taskType: "SHORT_TITLES" },
        user
      );

      const caps = getModelCaps(agent.model);
      const result = await structuredOrJson<{ titles: string[] }>({
        client: this.client,
        model: agent.model,
        messages,
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
  opts?: { 
    channelType?: ChannelType;
    sessionId?: string;
  }
): Promise<WarmupButtonsResponse | null> {
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);

  // 🔍 DEBUG: Log sessionId recebido
  console.log("🎯 FREE CHAT BUTTONS - SessionId recebido:", opts?.sessionId);

  const user = `Cliente: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      
      // 🔑 PADRÃO DA BÍBLIA: Detectar se precisa enviar prompts developer
      const hasSessionId = !!opts?.sessionId;
      
      // Primeira chamada ensureSession para obter previous_response_id e flag de nova sessão
      let isNewSession = true; // Default para nova sessão
      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession({ sessionId: opts.sessionId!, agent, channel }, createMasterPrompt, signal);
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true; // Em caso de erro, tratar como nova sessão
        }
      }
      
      const messages = buildMessages(
        { 
          channel, 
          taskType: "FREE_CHAT", 
          statelessInit: isNewSession 
        },
        user
      );

      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: agent.instructions || "Você é um UX writer especializado em criar botões de navegação. Siga o schema estritamente e gere botões objetivos.",
        max_output_tokens: agent.maxOutputTokens || 256,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "FreeChatButtons",
        sessionId: opts?.sessionId,
        channel,
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
  opts?: { 
    channelType?: ChannelType;
    sessionId?: string;
  }
): Promise<WarmupButtonsResponse | null> {
  if (!candidates.length) return null;

  // 🔍 DEBUG: Log sessionId recebido
  console.log("🎯 GENERATE WARMUP BUTTONS - SessionId recebido:", opts?.sessionId);

  const candidatesText = candidates
    .map((c, i) => {
      const raw = (c.desc || c.name || c.slug || "").toString();
      const marker = "\n---\nALIASES:\n";
      let main = raw;
      let aliases: string[] = [];
      const idx = raw.indexOf(marker);
      if (idx !== -1) {
        main = raw.substring(0, idx).trim();
        const rest = raw.substring(idx + marker.length);
        aliases = rest
          .split(/\r?\n/g)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const lines: string[] = [];
      lines.push(`${i + 1}. @${c.slug}: ${main || c.name || c.slug}`);
      if (aliases.length) {
        lines.push("ALIASES:");
        for (const a of aliases) lines.push(`- ${a}`);
      }
      return lines.join("\n");
    })
    .join("\n");

  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);

  const user = `Intenções candidatas:\n${candidatesText}\n\nMensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      
      // 🔑 PADRÃO DA BÍBLIA: Detectar se precisa enviar prompts developer
      const hasSessionId = !!opts?.sessionId;
      
      // Primeira chamada ensureSession para obter previous_response_id e flag de nova sessão
      let isNewSession = true; // Default para nova sessão
      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession({ sessionId: opts.sessionId!, agent, channel }, createMasterPrompt, signal);
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true; // Em caso de erro, tratar como nova sessão
        }
      }
      
      const messages = buildMessages(
        { 
          channel, 
          taskType: "WARMUP_BUTTONS", 
          statelessInit: isNewSession 
        },
        user
      );

      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: agent.instructions || "Você é um UX writer especializado em criar botões de navegação. Siga o schema estritamente e gere botões objetivos.",
        max_output_tokens: agent.maxOutputTokens || 256,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "WarmupButtons",
        sessionId: opts?.sessionId,
        channel,
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
  opts?: { 
    channelType?: ChannelType;
    sessionId?: string;
  }
): Promise<RouterDecision | null> {
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createRouterSchema(channel);

  // 🔍 DEBUG: Log sessionId recebido
  console.log("🎯 ROUTER LLM - SessionId recebido:", opts?.sessionId);

  const user = `Mensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      
      // 🔑 PADRÃO DA BÍBLIA: Detectar se precisa enviar prompts developer
      const hasSessionId = !!opts?.sessionId;
      
      // Primeira chamada ensureSession para obter previous_response_id e flag de nova sessão
      let isNewSession = true; // Default para nova sessão
      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession({ sessionId: opts.sessionId!, agent, channel }, createMasterPrompt, signal);
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true; // Em caso de erro, tratar como nova sessão
        }
      }
      
      const messages = buildMessages(
        { 
          channel, 
          taskType: "router", 
          hasInstructions: !!agent.instructions,
          statelessInit: isNewSession 
        },
        user
      );

      const result = await structuredOrJson<RouterDecision>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: agent.instructions || "Você é um roteador inteligente. Siga o schema estritamente.",
        max_output_tokens: agent.maxOutputTokens || 512,
        verbosity: caps.reasoning && isGPT5(agent.model) ? normVerb(agent.verbosity) : undefined,
        reasoning: caps.reasoning ? { effort: normEffort(agent.reasoningEffort) } : undefined,
        agent,
        schema,
        schemaName: "RouterDecision",
        sessionId: opts?.sessionId,
        channel,
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
