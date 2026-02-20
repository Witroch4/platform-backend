/**
 * Claude (Anthropic) Client Singleton
 * Follows same pattern as lib/oab-eval/gemini-client.ts
 */

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

let claudeInstance: Anthropic | null = null;

/**
 * Returns singleton Anthropic client instance.
 * Does not throw if key is missing - allows fallback to other providers.
 */
export function getClaudeClient(): Anthropic | null {
	if (!apiKey) {
		return null;
	}

	if (!claudeInstance) {
		claudeInstance = new Anthropic({ apiKey });
	}

	return claudeInstance;
}

/**
 * Checks if Claude is available (API key configured)
 */
export function isClaudeAvailable(): boolean {
	return !!apiKey;
}

/**
 * Checks if a model string is a Claude model
 */
export function isClaudeModel(model: string): boolean {
	return model.toLowerCase().startsWith("claude");
}

/**
 * Supported Claude models for SocialWise Flow
 */
export const CLAUDE_MODELS = [
	"claude-opus-4-5",
	"claude-sonnet-4-5",
	"claude-haiku-4-5",
] as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];
