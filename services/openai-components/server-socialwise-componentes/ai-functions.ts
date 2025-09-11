// services/openai-components/ai-functions.ts
import OpenAI from "openai";
import { z } from "zod";
import {
  IntentCandidate,
  AgentConfig,
  WarmupButtonsResponse,
  RouterDecision,
  ChannelType,
} from "../types";
import { withDeadlineAbort } from "../utils";
import {
  createButtonsSchema,
  createRouterSchema,
  getConstraintsForChannel,
} from "./channel-constraints";
import { buildMessages, buildEphemeralInstructions, TASK_PROMPTS } from "./prompt-manager";
import { structuredOrJson } from "./structured-outputs";
import { ensureSession } from "./session-manager";
import { createMasterPrompt } from "./prompt-manager";
import { getModelCaps, isGPT5, normVerb, normEffort } from "./model-capabilities";

type HintOut = { slug: string; score?: number; aliases?: string[]; desc?: string };

// Helper function to safely escape strings for JSON context
const safeString = (str: string) => {
  return str
    .replace(/\\/g, '\\\\')    // Escape backslashes
    .replace(/"/g, '\\"')      // Escape quotes
    .replace(/\n/g, '\\n')     // Escape newlines
    .replace(/\r/g, '\\r')     // Escape carriage returns
    .replace(/\t/g, '\\t');    // Escape tabs
};

function sanitizeHintsWithDesc(cands: IntentCandidate[], topN = 4): HintOut[] {
  return (cands ?? [])
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topN)
    .map((c) => ({
      slug: c.slug?.startsWith("@") ? c.slug : `@${c.slug}`,
      score: typeof c.score === "number" ? Number(c.score.toFixed(3)) : undefined,
      aliases: (c.aliases ?? [])
        .map((s) => safeString(String(s).trim()))
        .filter(Boolean)
        .slice(0, 3), // <= máximo 3
      desc: safeString(String(c.desc || c.name || "").trim()), // descrição completa escapada
    }));
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

  const user = `Serviços (na ordem):\n${items}`;

  return withDeadlineAbort(async (signal) => {
    try {
      // Schema dinâmico: exigir a mesma quantidade de títulos que intents
      const ShortTitlesSchemaN = z
        .object({
          titles: z.array(z.string().min(1).max(20)).length(intents.length),
        })
        .strict();

      const messages = buildMessages(
        { channel: "whatsapp", taskType: "SHORT_TITLES" },
        user
      );

      // Instruções enxutas: task rules + limites do canal (sem persona hardcoded)
      const combinedInstructions =
        (agent.instructions || "Siga o schema estritamente.") +
        "\n\n" +
        buildEphemeralInstructions({
          task: "SHORT_TITLES",
          channel: "whatsapp",
          hints: [], // não necessário aqui
        });

      const caps = getModelCaps(agent.model);
      const result = await structuredOrJson<{ titles: string[] }>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: combinedInstructions,
        max_output_tokens: agent.maxOutputTokens || 128,
        verbosity:
          caps.reasoning && isGPT5(agent.model)
            ? normVerb(agent.verbosity)
            : undefined,
        reasoning: caps.reasoning
          ? { effort: normEffort(agent.reasoningEffort) }
          : undefined,
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
 * 🎯 Chat livre com IA gerando botões dinâmicos
 * Usado quando não há intenções claras mas cliente quer conversar
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

  // Texto cru do usuário (sem molduras/prefixos)
  const user = userText;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      const c = getConstraintsForChannel(channel);

      // Detectar se precisa enviar developer prompts (MASTER) — nova sessão
      const hasSessionId = !!opts?.sessionId;
      let isNewSession = true;

      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession(
            { sessionId: opts!.sessionId as string, agent, channel },
            createMasterPrompt,
            signal
          );
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true;
        }
      }

      const messages = buildMessages(
        {
          channel,
          taskType: "FREE_CHAT",
          statelessInit: isNewSession, // MASTER só em nova sessão
        },
        user
      );

      // instructions-only: task rules + limits (sem hints)
      const combinedInstructions =
        (agent.instructions || "Siga o schema estritamente.") +
        "\n\n" +
        buildEphemeralInstructions({
          task: "FREE_CHAT",
          channel,
          hints: [], // não há hints aqui
        });

      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: combinedInstructions,
        max_output_tokens:
          agent.maxOutputTokens ||
          Math.min(256, Math.max(128, Math.round(c.bodyMax * 1.5))),
        verbosity:
          caps.reasoning && isGPT5(agent.model)
            ? normVerb(agent.verbosity)
            : undefined,
        reasoning: caps.reasoning
          ? { effort: normEffort(agent.reasoningEffort) }
          : undefined,
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

  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);

  // Texto cru do usuário - sem prefixos
  const user = userText;
  const c = getConstraintsForChannel(channel);

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);

      // DETECÇÃO DE NOVA SESSÃO
      const hasSessionId = !!opts?.sessionId;
      let isNewSession = true;

      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession(
            { sessionId: opts!.sessionId!, agent, channel },
            createMasterPrompt,
            signal
          );
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true;
        }
      }

      // MASTER (developer) apenas em nova sessão
      const messages = buildMessages(
        {
          channel,
          taskType: "WARMUP_BUTTONS",
          statelessInit: isNewSession,
        },
        user
      );

      // instructions-only: task rules + limits + hints JSON (com desc completo)
      const hints = sanitizeHintsWithDesc(
        candidates.map((h) => ({
          ...h,
          aliases: h.aliases, // já respeitamos máx 3 no helper
        })),
        4 // top-N intents para enviar; ajuste se quiser
      );

      const combinedInstructions =
        (agent.instructions || "Siga o schema estritamente.") +
        "\n\n" +
        buildEphemeralInstructions({
          task: "WARMUP_BUTTONS",
          channel,
          hints, // inclui desc completo
        });

      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: combinedInstructions,
        max_output_tokens:
          agent.maxOutputTokens ||
          Math.min(256, Math.max(128, Math.round(c.bodyMax * 1.5))),
        verbosity:
          caps.reasoning && isGPT5(agent.model)
            ? normVerb(agent.verbosity)
            : undefined,
        reasoning: caps.reasoning
          ? { effort: normEffort(agent.reasoningEffort) }
          : undefined,
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
    intentHints?: IntentCandidate[];
    profile?: 'lite' | 'full';
  }
): Promise<RouterDecision | null> {
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createRouterSchema(channel);

  // 🔍 DEBUG: Log sessionId recebido
  console.log("🎯 ROUTER LLM - SessionId recebido:", opts?.sessionId);
  const c = getConstraintsForChannel(channel);
  const profile = opts?.profile === 'lite' ? 'lite' : 'full';

  // Texto cru do usuário - sem molduras
  const user = userText;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);

      // Detectar nova sessão para decidir se envia MASTER (developer)
      const hasSessionId = !!opts?.sessionId;
      let isNewSession = true;

      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession(
            { sessionId: opts!.sessionId as string, agent, channel },
            createMasterPrompt,
            signal
          );
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true;
        }
      }

      // Instruções compactas para router (com hints com desc completo se fornecidos)
      const topN = profile === 'lite' ? 3 : 4;
      const hints = sanitizeHintsWithDesc(
        (opts?.intentHints ?? []).map((h) => ({
          ...h,
          aliases: h.aliases,
        })),
        topN
      );

      // Prompt persistente em developer: MASTER + TASK (ROUTER LLM)
      const messages: Array<{ role: 'developer' | 'user'; content: string }> = [];
      if (isNewSession) {
        const routerTask = TASK_PROMPTS.ROUTER_LLM(!!agent.instructions);
        const developerFixed = createMasterPrompt(channel) + "\n\nTASK_RULES\n" + routerTask.trim();
        messages.push({ role: 'developer', content: developerFixed });
      }
      messages.push({ role: 'user', content: user });

      // Instruções efêmeras: prompt do agente + HINTS (apenas conteúdos que mudam)
      const ephemeralInstructions =
        (agent.instructions || "Siga o schema estritamente.") +
        "\n\nINTENT_HINTS_JSON\n" +
        JSON.stringify(hints, null, 0);

      const useReasoning = caps.reasoning && isGPT5(agent.model);
      const result = await structuredOrJson<RouterDecision>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: ephemeralInstructions,
        max_output_tokens:
          agent.maxOutputTokens ||
          (profile === 'lite'
            ? Math.min(256, Math.max(128, Math.round(c.bodyMax * 1.2)))
            : Math.min(384, Math.max(192, Math.round(c.bodyMax * 2)))),
        verbosity: useReasoning ? normVerb(agent.verbosity) : undefined,
        reasoning: useReasoning ? { effort: (normEffort(agent.reasoningEffort) as any) || 'minimal' } : undefined,
        agent,
        schema,
        schemaName: "RouterDecision",
        pointerKey: 'router_dev_prompt',
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
