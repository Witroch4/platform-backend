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

// ===== SCHEMAS ZOD (seguindo o guia à risca) =====

/** Helper para limites por canal (já existe abaixo, deixamos aqui o consumo) */

// Schema removido - usando ShortTitlesSchemaN dinâmico

/** Botão por canal (impõe também tamanho do payload) */
function createButtonSchemaForChannel(channel: ChannelType) {
  const { buttonTitleMax, titleWordMax, payloadMax } =
    getConstraintsForChannel(channel);
  const titleRegex = new RegExp(`^.{1,${buttonTitleMax}}$`, "u");
  const wordsRegex = new RegExp(
    `^(?:\\S+)(?:\\s+\\S+){0,${titleWordMax - 1}}$`,
    "u"
  );
  const payloadRegex = new RegExp(`^@[a-z0-9_]{1,${payloadMax}}$`, "u");
  return z
    .object({
      title: z
        .string()
        .regex(titleRegex, `máx ${buttonTitleMax} caracteres`)
        .regex(wordsRegex, `máx ${titleWordMax} palavras`),
      payload: z
        .string()
        .regex(payloadRegex, `formato @slug (1–${payloadMax})`),
    })
    .strict();
}

/** Schema Zod para botões de warmup/freechat */
function createButtonsSchema(channel: ChannelType) {
  const bodyMax =
    channel === "whatsapp" ? 1024 : channel === "instagram" ? 640 : 2000;
  const maxButtons = 3;
  const Btn = createButtonSchemaForChannel(channel);
  return z
    .object({
      introduction_text: z
        .string()
        .regex(
          new RegExp(`^.{1,${bodyMax}}$`, "u"),
          `máx ${bodyMax} caracteres`
        ),
      buttons: z.array(Btn).min(1).max(maxButtons),
    })
    .strict();
}

/** Schema Zod para decisão do router */
function createRouterSchema(channel: ChannelType) {
  const bodyMax =
    channel === "whatsapp" ? 1024 : channel === "instagram" ? 640 : 2000;
  const maxButtons = 3;
  const Btn = createButtonSchemaForChannel(channel);
  return z
    .object({
      mode: z.enum(["intent", "chat"]),
      intent_payload: z
        .string()
        .regex(/^@[a-z0-9_]+$/u)
        .nullable(),
      introduction_text: z
        .string()
        .regex(new RegExp(`^.{1,${bodyMax}}$`, "u"))
        .nullable(),
      text: z
        .string()
        .regex(new RegExp(`^.{1,${bodyMax}}$`, "u"))
        .nullable(),
      buttons: z.array(Btn).max(maxButtons).nullable(),
    })
    .strict();
}

// ===== TYPES INFERIDOS DO ZOD =====
// type TShortTitles removido - usando tipo dinâmico
// type TButton = z.infer<typeof ButtonSchema>; // substituído por schema por canal

/** Limites por canal (mantido para compatibilidade) */
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

// ==== Helpers GPT-5 (case-insensitive) ====
const isGPT5 = (m?: string) => (m || "").toLowerCase().includes("gpt-5");
const normEffort = (e?: string) =>
  e === "low" || e === "medium" || e === "high" ? e : "low"; // "minimal" => "low"
const normVerb = (v?: string) =>
  v === "low" || v === "medium" || v === "high" ? v : "low";

// Mescla Structured Outputs + (opcional) verbosity do GPT-5
function buildTextFormat<T>(schema: T, name: string, agent: AgentConfig) {
  const base: any = { format: zodTextFormat(schema as any, name) };
  if (isGPT5(agent.model)) base.verbosity = normVerb((agent as any).verbosity);
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

  const devRules = `
# OBJETIVO
Gerar títulos curtos e acionáveis para cada serviço jurídico.

# REGRAS
- Títulos: até 20 caracteres e até 4 palavras (obrigatório).
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
              z
                .string()
                .regex(/^.{1,20}$/u, "máx 20 caracteres")
                .regex(/^(?:\S+)(?:\s+\S+){0,3}$/u, "máx 4 palavras")
            )
            .length(intents.length),
        })
        .strict();

      const response = await this.client.responses.parse(
        {
          model: agent.model,
          instructions:
            "Você é um UX writer jurídico. Siga o schema estritamente.",
          input: [
            {
              role: "developer",
              content: agent.developer || agent.instructions || "",
            },
            { role: "developer", content: devRules },
            { role: "user", content: user },
          ],
          text: buildTextFormat(ShortTitlesSchemaN, "ShortTitles", agent),
          temperature: agent.tempSchema ?? 0.2,
          max_output_tokens: 256,
          ...(isGPT5(agent.model) && {
            reasoning: { effort: normEffort(agent.reasoningEffort) },
          }),
        },
        { signal }
      );

      if (response.status === "incomplete") {
        throw new Error(
          `Incomplete: ${response.incomplete_details?.reason || ""}`
        );
      }

      if (!response.output_parsed) throw new Error("Sem output_parsed.");

      const result = response.output_parsed as { titles: string[] };
      return result.titles;
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
  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);
  const c = getConstraintsForChannel(channel);

  const devRules = `
# OBJETIVO
Gerar uma resposta curta (introduction_text) e 2–3 botões objetivos para avançar a conversa.

# REGRAS
- Títulos de botões: até 20 caracteres e até 4 palavras (obrigatório).
- Payload: formato @slug (obrigatório).
- introduction_text: até ${c.bodyMax} caracteres.
- Linguagem neutra e profissional.
- Retorne SOMENTE no schema 'FreeChatButtons' (sem explicações fora do JSON).
`;

  const user = `Cliente: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await this.client.responses.parse(
        {
          model: agent.model,
          instructions:
            "Você é um UX writer jurídico. Siga o schema estritamente.",
          input: [
            {
              role: "developer",
              content: agent.developer || agent.instructions || "",
            },
            { role: "developer", content: devRules },
            { role: "developer", content: `Canal alvo: ${channel}` },
            { role: "user", content: user },
          ],
          text: buildTextFormat(schema, "FreeChatButtons", agent),
          temperature: agent.tempCopy ?? 0.7,
          max_output_tokens: 256,
          ...(isGPT5(agent.model) && {
            reasoning: { effort: normEffort(agent.reasoningEffort) },
          }),
        },
        { signal }
      );

      if (response.status === "incomplete") {
        throw new Error(
          `Incomplete: ${response.incomplete_details?.reason || ""}`
        );
      }

      if (!response.output_parsed) throw new Error("Sem output_parsed.");

      return response.output_parsed as WarmupButtonsResponse;
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

  const channel: ChannelType = opts?.channelType || "whatsapp";
  const schema = createButtonsSchema(channel);
  const c = getConstraintsForChannel(channel);

  const devRules = `
# OBJETIVO
Gerar uma pequena introdução e botões para desambiguar a intenção do usuário.

# REGRAS
- Títulos de botões: até 20 caracteres e até 4 palavras (obrigatório).
- Payload: formato @slug (obrigatório).
- introduction_text: até ${c.bodyMax} caracteres.
- Linguagem neutra e profissional.
- Retorne SOMENTE no schema 'WarmupButtons' (sem explicações fora do JSON).
`;

  const user = `Intenções candidatas:\n${candidatesText}\n\nMensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await this.client.responses.parse(
        {
          model: agent.model,
          instructions:
            "Você é um UX writer jurídico. Siga o schema estritamente.",
          input: [
            {
              role: "developer",
              content: agent.developer || agent.instructions || "",
            },
            { role: "developer", content: devRules },
            { role: "developer", content: `Canal alvo: ${channel}` },
            { role: "user", content: user },
          ],
          text: buildTextFormat(schema, "WarmupButtons", agent),
          temperature: agent.tempCopy ?? 0.5,
          max_output_tokens: 256,
          ...(isGPT5(agent.model) && {
            reasoning: { effort: normEffort(agent.reasoningEffort) },
          }),
        },
        { signal }
      );

      if (response.status === "incomplete") {
        throw new Error(
          `Incomplete: ${response.incomplete_details?.reason || ""}`
        );
      }

      if (!response.output_parsed) throw new Error("Sem output_parsed.");

      return response.output_parsed as WarmupButtonsResponse;
    } catch (error) {
      console.error("Erro ao gerar botões de aquecimento:", error);
      return null;
    }
  }, agent.softDeadlineMs || 300);
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

  const devRules = `
# OBJETIVO
Decida entre roteamento para intenção específica ou chat livre.

# REGRAS
- mode='intent' quando houver uma intenção clara (inclua intent_payload no formato @slug).
- mode='chat' caso contrário (inclua text ou introduction_text + buttons).
- Títulos de botões: até 20 caracteres e até 4 palavras.
- Payload: formato @slug.
- Textos: até ${c.bodyMax} caracteres.
- Retorne SOMENTE no schema 'RouterDecision' (sem explicações fora do JSON).
`;

  const user = `Mensagem do usuário: "${userText}"`;

  return withDeadlineAbort(async (signal) => {
    try {
      const response = await this.client.responses.parse(
        {
          model: agent.model,
          instructions:
            "Você é um roteador inteligente. Siga o schema estritamente.",
          input: [
            {
              role: "developer",
              content: agent.developer || agent.instructions || "",
            },
            { role: "developer", content: devRules },
            { role: "developer", content: `Canal alvo: ${channel}` },
            { role: "user", content: user },
          ],
          text: buildTextFormat(schema, "RouterDecision", agent),
          temperature: agent.tempCopy ?? 0.3,
          max_output_tokens: 512,
          ...(isGPT5(agent.model) && {
            reasoning: { effort: normEffort(agent.reasoningEffort) },
          }),
        },
        { signal }
      );

      if (response.status === "incomplete") {
        throw new Error(
          `Incomplete: ${response.incomplete_details?.reason || ""}`
        );
      }

      if (!response.output_parsed) throw new Error("Sem output_parsed.");

      const result = response.output_parsed as RouterDecision;

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
