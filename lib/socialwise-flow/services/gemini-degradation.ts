/**
 * Gemini Degradation Service
 * Processes requests with Gemini Flash when primary LLM times out.
 *
 * Now delegates to multi-provider-processor.ts via Vercel AI SDK.
 * This file is kept for backward compatibility (exports used by retry-handler.ts).
 */

import { createLogger } from "@/lib/utils/logger";
import type { ConversationMessage } from "@/services/openai-components/server-socialwise-componentes/session-manager";
import type { RetryContext } from "./retry-context";
import { processDegradedRequestMultiProvider, type DegradedProcessingResult } from "./multi-provider-processor";

const logger = createLogger("Gemini-Degradation");

// Configuration
const DEGRADED_MODEL = process.env.DEGRADED_MODEL || "gemini-2.5-flash-lite";
const DEGRADED_TIMEOUT_MS = parseInt(process.env.DEGRADED_TIMEOUT_MS || "10000", 10);

/**
 * Processes a request with Gemini Flash (degraded model).
 * Delegates to the unified multi-provider processor.
 */
export async function processDegradedRequest(
	retryContext: RetryContext,
	history: ConversationMessage[],
): Promise<DegradedProcessingResult> {
	logger.info("Delegating to unified multi-provider processor (Gemini)", {
		model: DEGRADED_MODEL,
		timeout: DEGRADED_TIMEOUT_MS,
	});

	return processDegradedRequestMultiProvider(retryContext, history, {
		provider: "GEMINI",
		model: DEGRADED_MODEL,
	});
}

/**
 * Checks if the degraded model is available and configured
 */
export function isDegradedModelAvailable(): boolean {
	return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !!process.env.GOOGLE_API_KEY;
}

/**
 * Gets the configured degraded model name
 */
export function getDegradedModelName(): string {
	return DEGRADED_MODEL;
}

/**
 * Gets the configured timeout for degraded processing
 */
export function getDegradedTimeout(): number {
	return DEGRADED_TIMEOUT_MS;
}

// Re-export types for backward compatibility
export type { DegradedProcessingResult };
export type { DegradedRouterDecision } from "./multi-provider-processor";
