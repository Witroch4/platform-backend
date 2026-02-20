/**
 * Multi-Provider Degraded Processor
 * Routes degraded/fallback requests to any provider using Vercel AI SDK.
 *
 * Replaces 3 separate provider implementations (OpenAI, Gemini, Claude)
 * with a single unified path via generateObject().
 */

import { z } from "zod";
import { generateObject } from "ai";
import { createLogger } from "@/lib/utils/logger";
import { buildChannelResponse, type ChannelResponse, type ButtonOption } from "../channel-formatting";
import type { ConversationMessage } from "@/services/openai-components/server-socialwise-componentes/session-manager";
import type { RetryContext } from "./retry-context";
import {
	normalizeHandoffButtons,
	ensureFinalNotice,
} from "@/services/openai-components/server-socialwise-componentes/text-normalizers";
import { getConstraintsForChannel } from "@/services/openai-components/server-socialwise-componentes/channel-constraints";
import type { ChannelType } from "@/services/openai-components/types";
import { createDegradedModel, buildProviderOptions } from "./ai-provider-factory";

const logger = createLogger("Multi-Provider-Processor");

// Configuration
const DEGRADED_TIMEOUT_MS = parseInt(process.env.DEGRADED_TIMEOUT_MS || "10000", 10);

export type FallbackProvider = "OPENAI" | "GEMINI" | "CLAUDE";

export interface MultiProviderFallbackConfig {
	provider: FallbackProvider;
	model: string;
	timeoutMs?: number;
}

/**
 * Result from degraded processing
 */
export interface DegradedProcessingResult {
	success: boolean;
	response?: ChannelResponse;
	decision?: DegradedRouterDecision;
	error?: string;
	processingMs?: number;
}

export interface DegradedRouterDecision {
	mode: "intent" | "chat";
	intent_payload?: string;
	response_text: string;
	buttons?: Array<{ title: string; payload: string }>;
}

// ============ SCHEMA ============

const degradedRouterSchema = z.object({
	mode: z.enum(["intent", "chat"]).default("chat"),
	response_text: z.string().max(1024),
	intent_payload: z.string().optional(),
	buttons: z
		.array(
			z.object({
				title: z.string().max(20),
				payload: z.string(),
			}),
		)
		.max(3)
		.default([]),
});

// ============ PROMPT BUILDER ============

/**
 * Builds a compact prompt for degraded processing (shared across all providers)
 */
function buildDegradedPrompt(
	userText: string,
	history: ConversationMessage[],
	intentHints?: string,
	agentInstructions?: string,
): string {
	const parts: string[] = [];

	parts.push(`# INSTRUÇÕES COMPACTAS
Você é um assistente de atendimento. Responda de forma direta e útil.
- Se a mensagem for uma saudação (oi, olá, bom dia, boa tarde), responda com uma saudação amigável e pergunte como pode ajudar.
- Se o usuário tiver uma dúvida específica, responda objetivamente.
- Sempre ofereça botões úteis quando apropriado.
- Limite: 200 caracteres no response_text.
- Máximo 3 botões.
- Títulos de botão: até 20 caracteres.
- Payloads de botão: use APENAS os @slugs das INTENÇÕES DISPONÍVEIS abaixo.`);

	if (agentInstructions) {
		parts.push(`\n# CONTEXTO DO AGENTE\n${agentInstructions.substring(0, 800)}`);
	}

	if (intentHints) {
		parts.push(`\n# INTENÇÕES DISPONÍVEIS (use esses @slugs nos payloads dos botões)\n${intentHints}`);
	}

	if (history.length > 0) {
		const recentHistory = history.slice(-5);
		const historyText = recentHistory
			.map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content.substring(0, 150)}`)
			.join("\n");
		parts.push(`\n# HISTÓRICO DA CONVERSA\n${historyText}`);
	}

	parts.push(`\n# CONTEXTO IMPORTANTE
O usuário enviou a mensagem abaixo mas o agente anterior NÃO conseguiu responder a tempo (timeout).
O usuário clicou em "Tentar Novamente" e você está assumindo a conversa.
Responda normalmente à mensagem, como se fosse a primeira vez que o agente responde.
NÃO mencione o timeout ou problema técnico — apenas responda à mensagem do usuário.`);

	parts.push(`\n# MENSAGEM DO USUÁRIO (responda a esta mensagem)\n${userText}`);

	return parts.join("\n");
}

// ============ HELPERS ============

/**
 * Maps channel type string to ChannelType for constraints
 */
function mapChannelType(channelType?: string): ChannelType {
	if (!channelType) return "whatsapp";
	const lower = channelType.toLowerCase();
	if (lower.includes("instagram")) return "instagram";
	if (lower.includes("facebook") || lower.includes("messenger")) return "facebook";
	return "whatsapp";
}

/**
 * Builds a static fallback when all providers fail
 */
function buildStaticFallback(userText: string): DegradedRouterDecision {
	const greetings = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "hey", "hello"];
	const isGreeting = greetings.some((g) => userText.toLowerCase().includes(g));

	if (isGreeting) {
		return {
			mode: "chat",
			response_text:
				"Olá! Desculpe pela demora anterior. Como posso ajudar você hoje?\n\nSe nenhum botão atender, digite sua solicitação",
			buttons: [
				{ title: "Informações", payload: "@informacoes" },
				{ title: "Atendimento Humano", payload: "@falar_atendente" },
			],
		};
	}

	return {
		mode: "chat",
		response_text:
			"Desculpe pela demora. Para melhor atendê-lo, escolha uma opção ou aguarde um atendente.\n\nSe nenhum botão atender, digite sua solicitação",
		buttons: [
			{ title: "Tentar Novamente", payload: "@retry" },
			{ title: "Atendimento Humano", payload: "@falar_atendente" },
		],
	};
}

/**
 * Post-processes degraded response (normalize handoff buttons + final notice)
 */
function postProcessDegraded(obj: z.infer<typeof degradedRouterSchema>, channelType?: string): DegradedRouterDecision {
	const channel = mapChannelType(channelType);
	const constraints = getConstraintsForChannel(channel);

	const decision: DegradedRouterDecision = {
		mode: obj.mode === "intent" ? "intent" : "chat",
		response_text: obj.response_text,
		intent_payload: obj.intent_payload || undefined,
		buttons: obj.buttons || [],
	};

	// Normalize handoff buttons
	decision.buttons = normalizeHandoffButtons(decision.buttons || [], constraints.buttonTitleMax);

	// Ensure at least one button
	if (!decision.buttons || decision.buttons.length === 0) {
		decision.buttons = [{ title: "Atendimento Humano", payload: "@falar_atendente" }];
	}

	// Add final notice
	decision.response_text = ensureFinalNotice(decision.response_text);

	return decision;
}

// ============ UNIFIED PROVIDER PROCESSOR ============

/**
 * Processes a degraded request using any provider via Vercel AI SDK.
 * Single unified path replaces separate processWithClaude, processWithOpenAIDegraded, processWithGemini.
 */
async function processWithProvider(
	retryContext: RetryContext,
	history: ConversationMessage[],
	provider: FallbackProvider,
	model: string,
): Promise<DegradedProcessingResult> {
	const startTime = Date.now();

	try {
		const prompt = buildDegradedPrompt(
			retryContext.originalUserText,
			history,
			retryContext.intentHints,
			retryContext.agentInstructions,
		);

		const aiModel = createDegradedModel(provider, model);
		const providerOptions = buildProviderOptions(provider, model, {});

		const timeoutMs = DEGRADED_TIMEOUT_MS;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		logger.info("Processing with provider (degraded)", {
			provider,
			model,
			timeoutMs,
			historyCount: history.length,
		});

		try {
			const { object } = await generateObject({
				model: aiModel,
				schema: degradedRouterSchema,
				prompt,
				temperature: 0.3,
				providerOptions,
				abortSignal: controller.signal,
			});

			clearTimeout(timeoutId);

			const decision = postProcessDegraded(object, retryContext.channelType);
			const processingMs = Date.now() - startTime;

			logger.info(`${provider} degradation successful`, { processingMs, mode: decision.mode });

			return {
				success: true,
				response: buildChannelResponse(retryContext.channelType, decision.response_text, decision.buttons as ButtonOption[]),
				decision,
				processingMs,
			};
		} catch (error: any) {
			clearTimeout(timeoutId);
			if (error.name === "AbortError") {
				return { success: false, error: `${provider} request timed out`, processingMs: Date.now() - startTime };
			}
			throw error;
		}
	} catch (error: any) {
		logger.error(`${provider} degradation failed`, { error: error.message });
		const fallback = buildStaticFallback(retryContext.originalUserText);
		return {
			success: true,
			response: buildChannelResponse(retryContext.channelType, fallback.response_text, fallback.buttons as ButtonOption[]),
			decision: fallback,
			processingMs: Date.now() - startTime,
			error: error.message,
		};
	}
}

// ============ MAIN DISPATCHER ============

/**
 * Processes a degraded request using the configured fallback provider.
 * All providers now use the same unified path via Vercel AI SDK generateObject().
 */
export async function processDegradedRequestMultiProvider(
	retryContext: RetryContext,
	history: ConversationMessage[],
	fallbackConfig: MultiProviderFallbackConfig,
): Promise<DegradedProcessingResult> {
	logger.info("Dispatching degraded request", {
		provider: fallbackConfig.provider,
		model: fallbackConfig.model,
		sessionId: retryContext.sessionId,
	});

	return processWithProvider(retryContext, history, fallbackConfig.provider, fallbackConfig.model);
}
