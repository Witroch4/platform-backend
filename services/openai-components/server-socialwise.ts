

// services/openai-components/server-socialwise.ts
import OpenAI from "openai";
import {
  IntentCandidate,
  AgentConfig,
  WarmupButtonsResponse,
  RouterDecision,
} from "./types";
import { responsesCall } from "@/lib/cost/openai-wrapper";
import { withDeadlineAbort } from "./utils";

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

  const prompt = `# INSTRUÇÃO
Você é um especialista em UX Writing para chatbots jurídicos.
Gere títulos curtos e acionáveis para os seguintes serviços jurídicos.

# REGRAS
- Máximo 4 palavras por título
- Máximo 20 caracteres por título
- Foque na ação do usuário (ex: "Recorrer Multa", "Ação Judicial")
- Use linguagem direta e profissional
- Retorne apenas um array JSON de strings

# SERVIÇOS
${intents.map((intent, i) => `${i + 1}. ${intent.slug}: ${intent.desc || intent.name || intent.slug}`).join("\n")}

# FORMATO DE RESPOSTA
Retorne apenas um array JSON com os títulos na mesma ordem:
["Título 1", "Título 2", "Título 3"]`;

  return withDeadlineAbort(
    async (signal) => {
      try {
        const response = await responsesCall(
          this.client,
          {
            model: agent.model,
            input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
            store: false,
            temperature: agent.tempSchema ?? 0.2,
            max_output_tokens: 512,
          },
          { traceId: `short-titles-batch-${Date.now()}`, intent: "short_titles_generation" },
          { signal, timeout: agent.warmupDeadlineMs || 250 }
        );

        const content = response.output_text?.trim();
        if (!content) return null;

        // Parse JSON response
        const titles = JSON.parse(content);
        if (!Array.isArray(titles)) return null;

        // Clamp each title to 20 characters and 4 words
        return titles.map((title: string) => {
          const clean = String(title || "")
            .replace(/\s+/g, " ")
            .trim();
          const words = clean.split(" ");
          const clamped = words.slice(0, 4).join(" ");
          return clamped.length <= 20 ? clamped : clamped.slice(0, 20).trim();
        });
      } catch (error) {
        console.error("Erro ao gerar títulos curtos em lote:", error);
        return null;
      }
    },
    agent.warmupDeadlineMs || 250
  );
}

/**
 * 🎯 NOVA FUNCIONALIDADE: Chat livre com IA gerando botões dinâmicos
 * Usado na banda LOW quando não há intenções claras mas cliente quer conversar
 */
export async function generateFreeChatButtons(
  this: { client: OpenAI },
  userText: string,
  agent: AgentConfig
): Promise<WarmupButtonsResponse | null> {
  // 🎯 USAR INSTRUÇÕES DO AGENTE configurado no Capitão
  const agentInstructions = agent.instructions || agent.developer || 'Você é um assistente especializado.';
  
  const prompt = `${agentInstructions}

O cliente disse: "${userText}"

Gere uma resposta natural (até 640 caracteres) e 3 botões para ajudar o cliente a continuar a conversa.

RESPOSTA (JSON apenas):
{
  "introduction_text": "Resposta natural baseada na sua especialidade (máx 640 chars)",
  "buttons": [
    {"title": "Opção 1", "payload": "@opcao1"},
    {"title": "Opção 2", "payload": "@opcao2"},
    {"title": "Mais Info", "payload": "@mais_info"}
  ]
}`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
          store: false,
          temperature: agent.tempCopy ?? 0.7, // Mais criativo para chat livre
          max_output_tokens: 256,
          ...(agent.reasoningEffort && (agent.model.includes('o1') || agent.model.includes('gpt-5')) && {
            reasoning: { effort: agent.reasoningEffort }
          }),
          ...(agent.verbosity && agent.model.includes('gpt-5') && {
            text: { verbosity: agent.verbosity }
          })
        },
        { traceId: `freechat-${Date.now()}`, intent: "freechat_generation" },
        { signal, timeout: agent.warmupDeadlineMs || 1000 }
      );

      const content = response.output_text?.trim();
      if (!content) return null;

      const result = JSON.parse(content) as WarmupButtonsResponse;

      // Validate and clamp the response
      if (!result.introduction_text || !Array.isArray(result.buttons)) {
        return null;
      }

      // Clamp introduction text to platform limits (Instagram: 640, WhatsApp: 1024)
      const maxLength = 640; // Usar limite do Instagram como padrão (mais restritivo)
      result.introduction_text =
        result.introduction_text.length <= maxLength
          ? result.introduction_text
          : result.introduction_text.slice(0, maxLength).trim();

      // Clamp button titles to 20 chars
      result.buttons = result.buttons
        .slice(0, 3) // Max 3 buttons
        .map((button, i) => ({
          title:
            button.title.length <= 20
              ? button.title
              : button.title.slice(0, 20).trim(),
          payload: button.payload.startsWith('@') 
            ? button.payload 
            : `@freechat_${i + 1}`
        }));

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
  agent: AgentConfig
): Promise<WarmupButtonsResponse | null> {
  if (!candidates.length) return null;

  const candidatesText = candidates
    .map((c, i) => `${i + 1}. @${c.slug}: ${c.desc || c.name || c.slug}`)
    .join("\n");

  // 🎯 CORRIGIDO: Usar instruções do agente configurado no Capitão
  const agentInstructions = agent.instructions || agent.developer || 'Você é um assistente especializado.';
  
  const prompt = `${agentInstructions}

CONTEXTO: O usuário fez uma pergunta ambígua. Gere botões para ajudá-lo.

INTENÇÕES CANDIDATAS:
${candidatesText}

MENSAGEM DO USUÁRIO: "${userText}"

RESPOSTA (JSON apenas):
{
  "introduction_text": "Como posso ajudar?",
  "buttons": [
    {"title": "Opção 1", "payload": "@${candidates[0]?.slug || 'intent1'}"},
    {"title": "Opção 2", "payload": "@${candidates[1]?.slug || 'intent2'}"}
  ]
}`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
          store: false,
          temperature: agent.tempCopy ?? 0.5,
          max_output_tokens: 256, // Reduzido para acelerar geração
        },
        { traceId: `warmup-buttons-${Date.now()}`, intent: "warmup_buttons_generation" },
        { signal, timeout: agent.softDeadlineMs || 300 }
      );

      const content = response.output_text?.trim();
      if (!content) return null;

      const result = JSON.parse(content) as WarmupButtonsResponse;

      // Validate and clamp the response
      if (!result.introduction_text || !Array.isArray(result.buttons)) {
        return null;
      }

      // Clamp introduction text to platform limits (Instagram: 640, WhatsApp: 1024)
      const maxLength = 640; // Usar limite do Instagram como padrão (mais restritivo)
      result.introduction_text =
        result.introduction_text.length <= maxLength
          ? result.introduction_text
          : result.introduction_text.slice(0, maxLength).trim();

      // Clamp button titles and validate payloads
      result.buttons = result.buttons
        .slice(0, 3) // Max 3 buttons
        .map((button) => ({
          title:
            button.title.length <= 20
              ? button.title
              : button.title.slice(0, 20).trim(),
          payload: button.payload.match(/^@[a-z0-9_]+$/)
            ? button.payload
            : `@${button.payload.replace(/[^a-z0-9_]/g, "_").toLowerCase()}`,
        }));

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
  agent: AgentConfig
): Promise<RouterDecision | null> {
  const prompt = `# INSTRUÇÃO
Você é um roteador inteligente para um chatbot jurídico.
Analise a mensagem do usuário e decida se deve:
1. Classificar como intenção específica (mode: "intent")
2. Engajar em conversa aberta (mode: "chat")

# MENSAGEM DO USUÁRIO
"${userText}"

# CRITÉRIOS DE DECISÃO
- Use "intent" se a mensagem indica uma necessidade jurídica específica
- Use "chat" se a mensagem é vaga, conversacional, ou precisa de esclarecimento
- Para "intent": forneça payload específico e botões opcionais
- Para "chat": forneça texto de resposta engajante

# FORMATO DE RESPOSTA
Para intenção específica:
{
  "mode": "intent",
  "intent_payload": "@nome_da_intencao",
  "introduction_text": "Texto opcional de confirmação",
  "buttons": [{"title": "Confirmar", "payload": "@intencao"}]
}

Para conversa aberta:
{
  "mode": "chat",
  "text": "Resposta conversacional que esclarece ou engaja o usuário"
}`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await responsesCall(
        this.client,
        {
          model: agent.model,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
          store: false,
          temperature: agent.tempCopy ?? 0.3,
          max_output_tokens: 768,
        },
        { traceId: `router-llm-${Date.now()}`, intent: "routing_decision" },
        { signal, timeout: agent.hardDeadlineMs || 400 }
      );

      const content = response.output_text?.trim();
      if (!content) return null;

      const result = JSON.parse(content) as RouterDecision;

      // Validate the response structure
      if (!result.mode || !["intent", "chat"].includes(result.mode)) {
        return null;
      }

      // Validate intent mode requirements
      if (result.mode === "intent" && !result.intent_payload) {
        return null;
      }

      // Validate chat mode requirements
      if (result.mode === "chat" && !result.text) {
        return null;
      }

      // Clamp text fields if present
      if (result.introduction_text) {
        result.introduction_text =
          result.introduction_text.length <= 180
            ? result.introduction_text
            : result.introduction_text.slice(0, 180).trim();
      }

      if (result.text) {
        result.text =
          result.text.length <= 1024
            ? result.text
            : result.text.slice(0, 1024).trim();
      }

      // Validate and clamp buttons if present
      if (result.buttons) {
        result.buttons = result.buttons.slice(0, 3).map((button) => ({
          title:
            button.title.length <= 20
              ? button.title
              : button.title.slice(0, 20).trim(),
          payload: button.payload.match(/^@[a-z0-9_]+$/)
            ? button.payload
            : `@${button.payload.replace(/[^a-z0-9_]/g, "_").toLowerCase()}`,
        }));
      }

      return result;
    } catch (error) {
      console.error("Erro no Router LLM:", error);
      return null;
    }
  }, agent.hardDeadlineMs || 400);
}
