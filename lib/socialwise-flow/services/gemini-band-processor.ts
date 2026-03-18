/**
 * Gemini Band Processor
 * Implements warmupButtons and routerLLM for Gemini provider
 * Used when AiAssistant.provider === "GEMINI"
 *
 * Uses Vercel AI SDK (generateObject) for unified structured output.
 * Uses shared-llm-pipeline for prompts, schemas, and post-processing.
 *
 * Fallback chain: generateObject (strict) → generateObject (relaxed) → generateText + manual parse
 */

import { generateObject, generateText } from "ai";
import { createLogger } from "@/lib/utils/logger";
import type { IntentCandidate, WarmupButtonsResponse, RouterDecision } from "@/services/openai-components/types";
import type { AssistantConfig } from "../processor-components/assistant-config";
import {
	buildWarmupRequest,
	buildRouterRequest,
	postProcessResponse,
	validateAndNormalize,
} from "./shared-llm-pipeline";
import { createModel, buildProviderOptions } from "./ai-provider-factory";
import { createRelaxedRouterSchema } from "@/services/openai-components/server-socialwise-componentes/channel-constraints";
import { coerceLengths } from "@/services/openai-components/server-socialwise-componentes/structured-outputs";

const logger = createLogger("Gemini-Band-Processor");

/**
 * Generates warmup buttons using Gemini via Vercel AI SDK
 */
export async function generateWarmupButtonsGemini(
	userText: string,
	candidates: IntentCandidate[],
	agent: AssistantConfig,
	opts?: { channelType?: string; sessionId?: string },
): Promise<WarmupButtonsResponse | null> {
	try {
		const req = await buildWarmupRequest(userText, candidates, agent, opts);
		const model = createModel("GEMINI", agent.model);
		const providerOptions = buildProviderOptions("GEMINI", agent.model, {
			reasoningEffort: agent.reasoningEffort,
		});

		const { object } = await generateObject({
			model,
			schema: req.schema,
			system: `${req.systemPrompt}\n\n${req.ephemeralInstructions}`,
			messages: req.messages.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			})),
			temperature: 0.3,
			providerOptions,
		});

		return postProcessResponse<WarmupButtonsResponse>(object as WarmupButtonsResponse, req.channel);
	} catch (error: any) {
		logger.error("Gemini warmup buttons failed", { error: error.message });
		return null;
	}
}

/**
 * Runs router LLM using Gemini via Vercel AI SDK
 *
 * Fallback chain:
 * 1. generateObject (strict schema) — happy path
 * 2. generateObject (relaxed schema) — tolera <2 botões, campos extras
 * 3. generateText + manual parse — último recurso
 */
export async function routerLLMGemini(
	userText: string,
	agent: AssistantConfig,
	opts?: { channelType?: string; sessionId?: string; intentHints?: IntentCandidate[]; profile?: string },
): Promise<RouterDecision | null> {
	const req = await buildRouterRequest(userText, agent, opts);
	const model = createModel("GEMINI", agent.model);
	const providerOptions = buildProviderOptions("GEMINI", agent.model, {
		reasoningEffort: agent.reasoningEffort,
	});

	const systemPrompt = `${req.systemPrompt}\n\n${req.ephemeralInstructions}`;
	const messages = req.messages.map((m) => ({
		role: m.role as "user" | "assistant",
		content: m.content,
	}));

	// 1) Tentativa: generateObject com schema estrito
	try {
		const { object } = await generateObject({
			model,
			schema: req.schema,
			system: systemPrompt,
			messages,
			temperature: 0.3,
			providerOptions,
		});

		const result = object as RouterDecision;
		result.mode = result.mode === "intent" ? "intent" : "chat";
		return postProcessResponse<RouterDecision>(result, req.channel);
	} catch (error: any) {
		logger.warn("Gemini generateObject (strict) failed, trying relaxed schema", { error: error.message });
	}

	// 2) Fallback: generateObject com schema relaxado (tolera <2 botões, campos extras)
	try {
		const relaxedSchema = createRelaxedRouterSchema(req.channel);
		const { object } = await generateObject({
			model,
			schema: relaxedSchema,
			system: systemPrompt,
			messages,
			temperature: 0.3,
			providerOptions,
		});

		// coerceLengths garante que títulos, bodyMax e maxButtons respeitem o canal
		const result = coerceLengths(object as RouterDecision, req.channel);
		result.mode = result.mode === "intent" ? "intent" : "chat";
		logger.info("Gemini generateObject (relaxed) succeeded", {
			buttonsCount: result.buttons?.length ?? 0,
		});
		return postProcessResponse<RouterDecision>(result, req.channel);
	} catch (error: any) {
		logger.warn("Gemini generateObject (relaxed) failed, trying generateText fallback", { error: error.message });
	}

	// 3) Último recurso: generateText + parse manual
	try {
		const { text } = await generateText({
			model,
			system: systemPrompt,
			messages,
			temperature: 0.3,
			providerOptions,
		});

		const relaxedSchema = createRelaxedRouterSchema(req.channel);
		// validateAndNormalize já aplica coerceLengths internamente
		const parsed = validateAndNormalize<RouterDecision>(text, relaxedSchema, req.channel);
		if (parsed) {
			parsed.mode = parsed.mode === "intent" ? "intent" : "chat";
			logger.info("Gemini generateText fallback succeeded", {
				buttonsCount: parsed.buttons?.length ?? 0,
			});
			return parsed;
		}

		logger.error("Gemini generateText fallback: validation failed", { textSample: text?.slice(0, 300) });
	} catch (error: any) {
		logger.error("Gemini generateText fallback failed", { error: error.message });
	}

	return null;
}
