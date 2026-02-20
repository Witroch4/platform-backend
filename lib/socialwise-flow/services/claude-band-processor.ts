/**
 * Claude Band Processor
 * Implements warmupButtons and routerLLM for Claude (Anthropic) provider
 * Used when AiAssistant.provider === "CLAUDE"
 *
 * Uses Vercel AI SDK (generateObject) for unified structured output.
 * Uses shared-llm-pipeline for prompts, schemas, and post-processing.
 */

import { generateObject } from "ai";
import { createLogger } from "@/lib/utils/logger";
import type { IntentCandidate, WarmupButtonsResponse, RouterDecision } from "@/services/openai-components/types";
import type { AssistantConfig } from "../processor-components/assistant-config";
import {
	buildWarmupRequest,
	buildRouterRequest,
	postProcessResponse,
} from "./shared-llm-pipeline";
import { createModel, buildProviderOptions } from "./ai-provider-factory";

const logger = createLogger("Claude-Band-Processor");

/**
 * Generates warmup buttons using Claude via Vercel AI SDK
 */
export async function generateWarmupButtonsClaude(
	userText: string,
	candidates: IntentCandidate[],
	agent: AssistantConfig,
	opts?: { channelType?: string; sessionId?: string },
): Promise<WarmupButtonsResponse | null> {
	try {
		const req = await buildWarmupRequest(userText, candidates, agent, opts);
		const model = createModel("CLAUDE", agent.model);
		const providerOptions = buildProviderOptions("CLAUDE", agent.model, {
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
			providerOptions,
		});

		return postProcessResponse<WarmupButtonsResponse>(object as WarmupButtonsResponse, req.channel);
	} catch (error: any) {
		logger.error("Claude warmup buttons failed", { error: error.message });
		return null;
	}
}

/**
 * Runs router LLM using Claude via Vercel AI SDK
 */
export async function routerLLMClaude(
	userText: string,
	agent: AssistantConfig,
	opts?: { channelType?: string; sessionId?: string; intentHints?: IntentCandidate[]; profile?: string },
): Promise<RouterDecision | null> {
	try {
		const req = await buildRouterRequest(userText, agent, opts);
		const model = createModel("CLAUDE", agent.model);
		const providerOptions = buildProviderOptions("CLAUDE", agent.model, {
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
			providerOptions,
		});

		const result = object as RouterDecision;
		// Ensure mode is valid
		result.mode = result.mode === "intent" ? "intent" : "chat";

		return postProcessResponse<RouterDecision>(result, req.channel);
	} catch (error: any) {
		logger.error("Claude router LLM failed", { error: error.message });
		return null;
	}
}
