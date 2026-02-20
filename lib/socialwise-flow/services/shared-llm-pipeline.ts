/**
 * Shared LLM Pipeline
 * Provider-agnostic logic for building requests and validating/normalizing responses.
 * Used by Gemini and Claude band processors to share the same quality as OpenAI.
 *
 * This module does NOT duplicate code — it re-uses existing functions from:
 * - prompt-manager.ts (createMasterPrompt, TASK_PROMPTS, buildEphemeralInstructions)
 * - channel-constraints.ts (getConstraintsForChannel, createButtonsSchema, createRouterSchema)
 * - text-normalizers.ts (normalizeHandoffButtons, ensureFinalNotice)
 * - structured-outputs.ts (stripCodeFences, extractJsonLoose, coerceLengths)
 * - ai-functions.ts (sanitizeHintsWithDesc)
 */

import type { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import {
	createButtonsSchema,
	createRouterSchema,
	getConstraintsForChannel,
	type ChannelConstraints,
} from "@/services/openai-components/server-socialwise-componentes/channel-constraints";
import {
	createMasterPrompt,
	TASK_PROMPTS,
	buildEphemeralInstructions,
} from "@/services/openai-components/server-socialwise-componentes/prompt-manager";
import {
	normalizeHandoffButtons,
	ensureFinalNotice,
} from "@/services/openai-components/server-socialwise-componentes/text-normalizers";
import {
	stripCodeFences,
	extractJsonLoose,
	coerceLengths,
} from "@/services/openai-components/server-socialwise-componentes/structured-outputs";
import { sanitizeHintsWithDesc } from "@/services/openai-components/server-socialwise-componentes/ai-functions";
import { getSessionHistory } from "@/services/openai-components/server-socialwise-componentes/session-manager";
import type { IntentCandidate, ChannelType, WarmupButtonsResponse, RouterDecision } from "@/services/openai-components/types";
import type { AssistantConfig } from "../processor-components/assistant-config";

const logger = createLogger("Shared-LLM-Pipeline");

// ============ TYPES ============

export interface LLMRequest {
	/** Master prompt + Task rules (use as system prompt) */
	systemPrompt: string;
	/** Agent instructions + hints (ephemeral, changes per request) */
	ephemeralInstructions: string;
	/** Conversation history + current user message */
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	/** Zod schema for post-parse validation */
	schema: z.ZodSchema;
	/** Channel constraints (bodyMax, buttonTitleMax, maxButtons) */
	constraints: ChannelConstraints;
	/** Suggested max output tokens */
	maxOutputTokens: number;
	/** Channel type for normalization */
	channel: ChannelType;
}

// ============ REQUEST BUILDERS ============

/**
 * Builds a complete warmup buttons request for any provider.
 * Uses the same prompts, hints, and constraints as the OpenAI pipeline.
 */
export async function buildWarmupRequest(
	userText: string,
	candidates: IntentCandidate[],
	agent: AssistantConfig,
	opts?: { channelType?: string; sessionId?: string },
): Promise<LLMRequest> {
	const channel: ChannelType = (opts?.channelType as ChannelType) || "whatsapp";
	const constraints = getConstraintsForChannel(channel);
	const schema = createButtonsSchema(channel);

	// Load history from Redis
	let history: Array<{ role: "user" | "assistant"; content: string }> = [];
	if (opts?.sessionId) {
		try {
			const sessionHistory = await getSessionHistory(opts.sessionId);
			history = sessionHistory.map((h) => ({ role: h.role, content: h.content }));
		} catch (error) {
			logger.warn("Failed to load session history", { error });
		}
	}

	// Rich hints with aliases, scores, descriptions (same as OpenAI)
	const hints = sanitizeHintsWithDesc(
		candidates.map((h) => ({ ...h, aliases: h.aliases })),
		4,
	);

	// System prompt: Master + Task rules
	const taskRules = TASK_PROMPTS.WARMUP_BUTTONS(agent.proposeHumanHandoff ?? true);
	const systemPrompt =
		createMasterPrompt(channel, agent.proposeHumanHandoff ?? true) +
		"\nTASK_RULES\n" +
		taskRules.trim();

	// Ephemeral instructions: agent instructions + channel limits + hints
	const ephemeralInstructions =
		(agent.instructions || "Siga o schema estritamente.") +
		"\n\n" +
		buildEphemeralInstructions({
			task: "WARMUP_BUTTONS",
			channel,
			hints,
			proposeHumanHandoff: agent.proposeHumanHandoff ?? true,
			disableIntentSuggestion: agent.disableIntentSuggestion ?? false,
		});

	// Build messages array (history + current)
	const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
	for (const msg of history.slice(-5)) {
		messages.push({ role: msg.role, content: msg.content });
	}
	messages.push({ role: "user", content: userText });

	return {
		systemPrompt,
		ephemeralInstructions,
		messages,
		schema,
		constraints,
		maxOutputTokens: agent.maxOutputTokens || Math.min(256, Math.max(128, Math.round(constraints.bodyMax * 1.5))),
		channel,
	};
}

/**
 * Builds a complete router LLM request for any provider.
 * Uses the same prompts, hints, and constraints as the OpenAI pipeline.
 */
export async function buildRouterRequest(
	userText: string,
	agent: AssistantConfig,
	opts?: {
		channelType?: string;
		sessionId?: string;
		intentHints?: IntentCandidate[];
		profile?: string;
	},
): Promise<LLMRequest> {
	const channel: ChannelType = (opts?.channelType as ChannelType) || "whatsapp";
	const constraints = getConstraintsForChannel(channel);
	const schema = createRouterSchema(channel);
	const profile = opts?.profile === "lite" ? "lite" : "full";

	// Load history from Redis
	let history: Array<{ role: "user" | "assistant"; content: string }> = [];
	if (opts?.sessionId) {
		try {
			const sessionHistory = await getSessionHistory(opts.sessionId);
			history = sessionHistory.map((h) => ({ role: h.role, content: h.content }));
		} catch (error) {
			logger.warn("Failed to load session history", { error });
		}
	}

	// Rich hints with aliases, scores, descriptions
	const topN = profile === "lite" ? 3 : 4;
	const hints = sanitizeHintsWithDesc(
		(opts?.intentHints ?? []).map((h) => ({ ...h, aliases: h.aliases })),
		topN,
	);

	// System prompt: Master + Router task rules
	const taskRules = TASK_PROMPTS.ROUTER_LLM(!!agent.instructions, agent.proposeHumanHandoff ?? true);
	const systemPrompt =
		createMasterPrompt(channel, agent.proposeHumanHandoff ?? true) +
		"\nTASK_RULES\n" +
		taskRules.trim();

	// Ephemeral instructions: agent instructions + hints
	let ephemeralInstructions = agent.instructions || "Siga o schema estritamente.";
	if (!agent.disableIntentSuggestion && hints.length > 0) {
		ephemeralInstructions += "\n\nINTENT_HINTS_JSON\n" + JSON.stringify(hints, null, 0);
	} else if (agent.disableIntentSuggestion) {
		ephemeralInstructions +=
			"\n\nINTENT_HINTS_DISABLED\n- Sistema de sugestão de intenção desativado. Siga estritamente as instruções do agente sem propor intenções baseadas em hints.";
	}

	// Add channel limits and guardrails
	const buttonRange = `2–${constraints.maxButtons}`;
	ephemeralInstructions += `\n\nGUARDRAILS\n- Não afirme dados operacionais sem fonte no contexto ou do usuário.\n- Não invente payloads: use somente slugs permitidos.`;
	ephemeralInstructions += `\n\nCHANNEL_LIMITS\n- response_text<=${constraints.bodyMax}; button_title<=${constraints.buttonTitleMax}; buttons=${buttonRange}; payload=@slug ou vazio ("").`;

	// Build messages array (history + current)
	const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
	for (const msg of history.slice(-5)) {
		messages.push({ role: msg.role, content: msg.content });
	}
	messages.push({ role: "user", content: userText });

	return {
		systemPrompt,
		ephemeralInstructions,
		messages,
		schema,
		constraints,
		maxOutputTokens:
			agent.maxOutputTokens ||
			(profile === "lite"
				? Math.min(256, Math.max(128, Math.round(constraints.bodyMax * 1.2)))
				: Math.min(384, Math.max(192, Math.round(constraints.bodyMax * 2)))),
		channel,
	};
}

// ============ RESPONSE VALIDATION & NORMALIZATION ============

/**
 * Universal post-processing for any provider's raw text response.
 * Applies the same validation and normalization as the OpenAI pipeline:
 * 1. Strip code fences + extract JSON
 * 2. Parse JSON
 * 3. Coerce lengths to channel limits
 * 4. Validate with Zod schema
 * 5. Normalize handoff buttons
 * 6. Add final notice to response_text
 */
export function validateAndNormalize<T extends { response_text?: string; buttons?: Array<{ title: string; payload: string }> }>(
	rawText: string,
	schema: z.ZodSchema<T>,
	channel: ChannelType,
): T | null {
	if (!rawText) return null;

	try {
		// 1. Clean raw text
		let jsonText = stripCodeFences(rawText).trim();

		// 2. Try to parse JSON directly
		let obj: any;
		try {
			obj = JSON.parse(jsonText);
		} catch {
			// Try extracting JSON block from surrounding text
			const extracted = extractJsonLoose(jsonText);
			if (extracted) {
				try {
					obj = JSON.parse(extracted);
				} catch {
					logger.warn("Failed to parse extracted JSON", { sample: extracted.slice(0, 200) });
					return null;
				}
			} else {
				logger.warn("No JSON found in response", { sample: jsonText.slice(0, 200) });
				return null;
			}
		}

		if (!obj || typeof obj !== "object") return null;

		// 3. Coerce lengths to channel constraints
		obj = coerceLengths(obj, channel);

		// 4. Validate with Zod schema
		let parsed: T;
		try {
			parsed = schema.parse(obj);
		} catch (zerr: any) {
			// If size issue, try coercing again and re-parse
			const issues = Array.isArray(zerr?.issues) ? zerr.issues : [];
			const hasSizeIssue = issues.some((it: any) =>
				it?.path?.includes("response_text") || it?.path?.includes("buttons"),
			);
			if (hasSizeIssue) {
				try {
					obj = coerceLengths(obj, channel);
					parsed = schema.parse(obj);
				} catch {
					logger.warn("Zod validation failed after coerce retry", { issues: zerr?.issues });
					return null;
				}
			} else {
				logger.warn("Zod validation failed", { issues: zerr?.issues });
				return null;
			}
		}

		// 5. Normalize handoff buttons
		const constraints = getConstraintsForChannel(channel);
		if ((parsed as any).buttons) {
			(parsed as any).buttons = normalizeHandoffButtons((parsed as any).buttons, constraints.buttonTitleMax);
		}

		// 6. Ensure final notice on response_text
		if ((parsed as any).response_text) {
			(parsed as any).response_text = ensureFinalNotice((parsed as any).response_text);
		}

		return parsed;
	} catch (error: any) {
		logger.error("validateAndNormalize failed", { error: error.message });
		return null;
	}
}

// ============ POST-PROCESS (Vercel AI SDK path) ============

/**
 * Post-processes a structured object returned by generateObject().
 * Applies business-logic normalizations only (handoff buttons + final notice).
 * JSON parsing and Zod validation are already handled by generateObject.
 */
export function postProcessResponse<T extends { response_text?: string; buttons?: Array<{ title: string; payload: string }> }>(
	obj: T,
	channel: ChannelType,
): T {
	const constraints = getConstraintsForChannel(channel);
	if (obj.buttons) {
		obj.buttons = normalizeHandoffButtons(obj.buttons, constraints.buttonTitleMax);
	}
	if (obj.response_text) {
		obj.response_text = ensureFinalNotice(obj.response_text);
	}
	return obj;
}

// ============ RE-EXPORTS for convenience ============

export { getConstraintsForChannel, type ChannelConstraints };
export { normalizeHandoffButtons, ensureFinalNotice };
export type { IntentCandidate, ChannelType, WarmupButtonsResponse, RouterDecision };
export type { AssistantConfig };
