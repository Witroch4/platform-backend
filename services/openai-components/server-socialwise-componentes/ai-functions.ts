// services/openai-components/ai-functions.ts
import OpenAI from "openai";
import { z } from "zod";
import { IntentCandidate, AgentConfig, WarmupButtonsResponse, RouterDecision, ChannelType } from "../types";
import { withDeadlineAbort } from "../utils";
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

      // Instruções auxiliares (como developer message): INTENT_HINTS e política de desambiguação
      const intentLines = intents
        .slice(0, 5)
        .map((c, i) => {
          const sc = typeof c.score === 'number' ? Number(c.score!.toFixed(3)) : undefined;
          const desc = (c.desc || c.name || c.slug || '').replace(/\s+/g, ' ').trim().slice(0, 140);
          return `- @${c.slug}${sc !== undefined ? ` score:${sc}` : ''}${desc ? `\n  desc: ${desc}` : ''}`;
        })
        .join("\n");

      const guidance = `\n# INTENT_HINTS (para desambiguação)\nUse estes candidatos para montar os botões (2–3 opções).\n${intentLines}\n\n# POLÍTICA DE WARMUP (não restritiva)\n- Gere 2–3 botões objetivos com payloads usando EXCLUSIVAMENTE os slugs acima.\n- Se houver ambiguidade (ex.: premium vs. motoqueiro), faça uma pergunta curta no response_text e use os botões para o usuário se identificar.\n- Não invente dados operacionais (ex.: horário exato). Prefira linguagem neutra (ex.: “Posso confirmar seu caso, escolha uma opção”).\n- Pode incluir @falar_atendente quando fizer sentido.`;

      // Posicionar como mensagem de developer para orientar a LLM
      messages.unshift({ role: "developer", content: guidance });

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
          const sessionResult = await ensureSession({ sessionId: (opts!.sessionId as string), agent, channel }, createMasterPrompt, signal);
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
          statelessInit: isNewSession  // ← Usa a detecção real!
        },
        user
      );

      // FREE_CHAT - simplificado sem INTENT_HINTS
      const intentLinesWarmup = ""
        .split('')
        .map((c, i) => `char ${i}: ${c}`)
        .join("\n");

      const guidanceWarmup = `\n# INTENT_HINTS (para desambiguação)\nUse estes candidatos para montar os botões (2–3 opções).\n${intentLinesWarmup}\n\n# POLÍTICA DE WARMUP (não restritiva)\n- Gere 2–3 botões objetivos com payloads usando EXCLUSIVAMENTE os slugs acima.\n- Se houver ambiguidade (ex.: premium vs. motoqueiro), faça uma pergunta curta no response_text e use os botões para o usuário se identificar.\n- Não invente dados operacionais (ex.: horário exato). Prefira linguagem neutra (ex.: “Posso confirmar seu caso, escolha uma opção”).\n- Pode incluir @falar_atendente quando fizer sentido.`;

      // Posicionar como mensagem de developer para orientar a LLM
      messages.unshift({ role: "developer", content: guidanceWarmup });

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

  // Mantém o texto do usuário limpo; candidatos irão nas 'instructions'
  const user = `Mensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const caps = getModelCaps(agent.model);
      
      // 🔑 DETECÇÃO DE NOVA SESSÃO: Verificar se existe previous_response_id
      const hasSessionId = !!opts?.sessionId;
      let isNewSession = true; // Default para nova sessão
      
      if (hasSessionId) {
        try {
          const sessionResult = await ensureSession({ sessionId: opts!.sessionId!, agent, channel }, createMasterPrompt, signal);
          isNewSession = sessionResult.isNewSession;
        } catch (error) {
          console.warn("[Session] Erro ao obter sessão:", error);
          isNewSession = true; // Em caso de erro, tratar como nova sessão
        }
      }
      
      // 🎯 ENVIAR DEVELOPER PROMPTS APENAS EM NOVA SESSÃO
      const messages = buildMessages(
        { 
          channel, 
          taskType: "WARMUP_BUTTONS", 
          statelessInit: isNewSession  // ← Usa a detecção real!
        },
        user
      );

      // 🎯 PADRÃO CORRETO: Injetar INTENT_HINTS nas instructions junto com as do agente
      const intentLines = candidates
        .slice(0, 5)
        .map((c, i) => {
          const sc = typeof c.score === 'number' ? Number(c.score!.toFixed(3)) : undefined;
          const desc = (c.desc || c.name || c.slug || '').replace(/\s+/g, ' ').trim().slice(0, 140);
          return `- @${c.slug}${sc !== undefined ? ` score:${sc}` : ''}${desc ? `\n  desc: ${desc}` : ''}`;
        })
        .join("\n");

      const intentHintsGuidance = `\n\n# INTENT_HINTS (para desambiguação)\nUse estes candidatos para montar os botões (2–3 opções):\n${intentLines}\n\n# POLÍTICA DE WARMUP (não restritiva)\n- Gere 2–3 botões objetivos com payloads usando EXCLUSIVAMENTE os slugs acima.\n- Se houver ambiguidade (ex.: premium vs. motoqueiro), faça uma pergunta curta no response_text e use os botões para o usuário se identificar.\n- Não invente dados operacionais (ex.: horário exato). Prefira linguagem neutra (ex.: "Posso confirmar seu caso, escolha uma opção").\n- Pode incluir @falar_atendente quando fizer sentido.`;

      // Combinar instruções do agente com os INTENT_HINTS
      const combinedInstructions = (agent.instructions || "Você é um UX writer especializado em criar botões de navegação. Siga o schema estritamente e gere botões objetivos.") + intentHintsGuidance;

      const result = await structuredOrJson<WarmupButtonsResponse>({
        client: this.client,
        model: agent.model,
        messages,
        instructions: combinedInstructions,
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
    intentHints?: IntentCandidate[];
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
          const sessionResult = await ensureSession({ sessionId: (opts!.sessionId as string), agent, channel }, createMasterPrompt, signal);
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
          statelessInit: isNewSession  // ← Usa a detecção real!
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
