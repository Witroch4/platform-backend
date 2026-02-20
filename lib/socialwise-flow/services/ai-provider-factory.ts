/**
 * AI Provider Factory
 * Centralizes Vercel AI SDK model creation and provider-specific options.
 *
 * Replaces scattered logic from:
 * - gemini-band-processor.ts (buildThinkingConfig, isGemini3Model, REASONING_TO_BUDGET)
 * - claude-band-processor.ts (getThinkingBudget)
 * - model-capabilities.ts (resolveSamplingPrefs — OpenAI only, kept there)
 */

import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AiProviderType } from "../processor-components/assistant-config";

// ============ MODEL FACTORY ============

/**
 * Creates a Vercel AI SDK LanguageModel for the given provider and model string.
 * - OpenAI: uses Responses API by default (`openai.responses()`)
 * - Gemini: uses `google()` (maps to Google AI Studio / Vertex)
 * - Claude: uses `anthropic()`
 */
export function createModel(provider: AiProviderType, model: string): LanguageModel {
	switch (provider) {
		case "GEMINI":
			return google(model);
		case "CLAUDE":
			return anthropic(model);
		case "OPENAI":
		default:
			return openai.responses(model);
	}
}

/**
 * Creates a model for degraded/fallback processing.
 * OpenAI degraded uses Chat Completions (not Responses API) — no session state.
 */
export function createDegradedModel(provider: AiProviderType, model: string): LanguageModel {
	switch (provider) {
		case "GEMINI":
			return google(model);
		case "CLAUDE":
			return anthropic(model);
		case "OPENAI":
		default:
			return openai(model); // Chat Completions, not Responses API
	}
}

// ============ PROVIDER OPTIONS ============

export interface ProviderOptionsInput {
	reasoningEffort?: string;
	verbosity?: string;
	previousResponseId?: string;
	store?: boolean;
}

/**
 * Builds provider-specific options for generateObject/generateText.
 * Each provider has different parameters for thinking/reasoning.
 */
export function buildProviderOptions(
	provider: AiProviderType,
	model: string,
	opts: ProviderOptionsInput,
): Record<string, Record<string, any>> {
	switch (provider) {
		case "GEMINI":
			return { google: buildGoogleOptions(model, opts.reasoningEffort) };
		case "CLAUDE":
			return { anthropic: buildAnthropicOptions(opts.reasoningEffort) };
		case "OPENAI":
		default:
			return { openai: buildOpenAIOptions(model, opts) };
	}
}

// ============ GOOGLE/GEMINI ============

function isGemini3(model: string): boolean {
	return model.startsWith("gemini-3");
}

const REASONING_TO_BUDGET: Record<string, number> = {
	minimal: 0,
	low: 512,
	medium: 1024,
	high: 4096,
};

function buildGoogleOptions(model: string, reasoningEffort?: string): Record<string, any> {
	if (isGemini3(model)) {
		// Gemini 3: uses thinkingLevel ("minimal"|"low"|"medium"|"high")
		const level =
			reasoningEffort && ["minimal", "low", "medium", "high"].includes(reasoningEffort)
				? reasoningEffort
				: "minimal";
		return { thinkingConfig: { thinkingLevel: level, includeThoughts: false } };
	}
	// Gemini 2.5: uses thinkingBudget (integer tokens, 0 = disabled)
	const budget = REASONING_TO_BUDGET[reasoningEffort || "minimal"] ?? 0;
	return { thinkingConfig: { thinkingBudget: budget, includeThoughts: false } };
}

// ============ ANTHROPIC/CLAUDE ============

const CLAUDE_BUDGET_MAP: Record<string, number> = {
	high: 4096,
	medium: 1024,
	low: 512,
};

function buildAnthropicOptions(reasoningEffort?: string): Record<string, any> {
	const budget = CLAUDE_BUDGET_MAP[reasoningEffort || ""];
	if (!budget) return {}; // No extended thinking for "minimal" or undefined
	return { thinking: { type: "enabled", budgetTokens: budget } };
}

// ============ OPENAI ============

function isGPT5(model: string): boolean {
	return model.toLowerCase().includes("gpt-5");
}

function buildOpenAIOptions(model: string, opts: ProviderOptionsInput): Record<string, any> {
	const result: Record<string, any> = {};
	if (opts.previousResponseId) result.previousResponseId = opts.previousResponseId;
	if (opts.store !== undefined) result.store = opts.store;
	if (opts.reasoningEffort && isGPT5(model)) result.reasoningEffort = opts.reasoningEffort;
	if (opts.verbosity && isGPT5(model)) result.textVerbosity = opts.verbosity;
	return result;
}
