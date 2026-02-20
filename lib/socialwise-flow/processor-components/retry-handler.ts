/**
 * Retry Handler for @retry Button
 * Orchestrates degraded model processing when user clicks "Tentar Novamente"
 *
 * Flow:
 * 1. Retrieve retry context from Redis
 * 2. Check retry attempts (max 2)
 * 3. Get message history from Redis
 * 4. Process with Gemini Flash (thinkingLevel: "minimal")
 * 5. Return response or force handoff
 */

import { createLogger } from "@/lib/utils/logger";
import { getRetryContext, incrementRetryAttempt, clearRetryContext } from "../services/retry-context";
import { getDegradedModelName } from "../services/gemini-degradation";
import { processDegradedRequestMultiProvider, type MultiProviderFallbackConfig } from "../services/multi-provider-processor";
import {
	getSessionHistory,
	appendToHistory,
	storeInteractiveMessageContext,
} from "@/services/openai-components/server-socialwise-componentes/session-manager";
import { buildChannelResponse, type ChannelResponse } from "../channel-formatting";
import { extractSessionId } from "../processor";

const retryLogger = createLogger("Retry-Handler");

/**
 * Result of retry processing
 */
export interface RetryResult {
	success: boolean;
	response?: ChannelResponse;
	forceHandoff?: boolean;
	reason?: string;
}

/**
 * Handles @retry button click with degraded model processing
 *
 * @param payload - The webhook payload
 * @param channelType - The channel type (e.g., "Channel::Whatsapp")
 * @param traceId - Optional trace ID for logging
 * @returns RetryResult with success/failure and response
 */
export async function handleRetryWithDegradation(
	payload: any,
	channelType: string,
	traceId?: string,
): Promise<RetryResult> {
	const sessionId = extractSessionId(payload, channelType);

	if (!sessionId) {
		retryLogger.warn("No sessionId found for @retry", { traceId });
		return {
			success: false,
			forceHandoff: true,
			reason: "no_session_id",
		};
	}

	retryLogger.info("Processing @retry request", {
		sessionId,
		traceId,
		degradedModel: getDegradedModelName(),
	});

	// 1. Get retry context from Redis
	const retryContext = await getRetryContext(sessionId);

	if (!retryContext) {
		retryLogger.warn("No retry context found (expired or never stored)", {
			sessionId,
			traceId,
		});

		// Return a friendly message instead of bare handoff
		const response = buildChannelResponse(
			channelType,
			"Desculpe, o tempo para tentar novamente expirou. Por favor, envie sua mensagem novamente.\n\nSe nenhum botão atender, digite sua solicitação",
			[
				{ title: "Atendimento Humano", payload: "@falar_atendente" },
			],
		);

		return {
			success: true,
			response,
			reason: "context_expired",
		};
	}

	// 2. Check retry attempts
	const currentAttempt = await incrementRetryAttempt(sessionId);

	retryLogger.info("Retry attempt", {
		sessionId,
		attempt: currentAttempt,
		maxRetries: retryContext.maxRetries,
		originalUserText: retryContext.originalUserText,
		traceId,
	});

	if (currentAttempt > retryContext.maxRetries) {
		retryLogger.warn("Max retries exceeded - forcing handoff", {
			sessionId,
			attempts: currentAttempt,
			maxRetries: retryContext.maxRetries,
			traceId,
		});

		await clearRetryContext(sessionId);

		return {
			success: false,
			forceHandoff: true,
			reason: "max_retries_exceeded",
		};
	}

	// 3. Get message history from Redis
	const history = await getSessionHistory(sessionId);

	retryLogger.info("Session history retrieved for retry", {
		sessionId,
		historyCount: history.length,
		traceId,
	});

	// 4. Process with degraded model (provider from DB or default Gemini)
	try {
		const fallbackConfig: MultiProviderFallbackConfig = {
			provider: retryContext.fallbackProvider || "GEMINI",
			model: retryContext.fallbackModel || getDegradedModelName(),
		};

		retryLogger.info("Using fallback provider", {
			provider: fallbackConfig.provider,
			model: fallbackConfig.model,
			sessionId,
		});

		const result = await processDegradedRequestMultiProvider(retryContext, history, fallbackConfig);

		if (!result.success || !result.response) {
			retryLogger.error("Degraded model processing failed", {
				sessionId,
				error: result.error,
				processingMs: result.processingMs,
				traceId,
			});

			// If this is the last attempt, force handoff
			if (currentAttempt >= retryContext.maxRetries) {
				await clearRetryContext(sessionId);
				return {
					success: false,
					forceHandoff: true,
					reason: "degraded_model_failed_final_attempt",
				};
			}

			// Still have retries left - show retry button again
			const retryResponse = buildChannelResponse(
				channelType,
				"Ainda não conseguimos processar sua solicitação. Tente novamente ou fale com um atendente.\n\nSe nenhum botão atender, digite sua solicitação",
				[
					{ title: "Tentar Novamente", payload: "@retry" },
					{ title: "Atendimento Humano", payload: "@falar_atendente" },
				],
			);

			return {
				success: true,
				response: retryResponse,
				reason: "degraded_model_failed_retryable",
			};
		}

		retryLogger.info("Degraded model processing successful", {
			sessionId,
			processingMs: result.processingMs,
			mode: result.decision?.mode,
			buttonsCount: result.decision?.buttons?.length || 0,
			traceId,
		});

		// 5. Store the response in session history
		try {
			// Append original user message to history (it wasn't stored due to timeout)
			await appendToHistory(sessionId, {
				role: "user",
				content: retryContext.originalUserText,
				timestamp: retryContext.timeoutTimestamp,
			});

			// Append degraded model response
			if (result.decision?.response_text) {
				await appendToHistory(sessionId, {
					role: "assistant",
					content: result.decision.response_text,
					timestamp: Date.now(),
				});
			}

			// Store interactive context for anti-loop
			if (result.decision?.buttons && result.decision.buttons.length > 0) {
				await storeInteractiveMessageContext(sessionId, {
					bodyText: result.decision.response_text,
					intentSlug: result.decision.intent_payload,
					timestamp: Date.now(),
					buttons: result.decision.buttons,
				});
			}
		} catch (historyError) {
			retryLogger.warn("Failed to update session history after retry", {
				error: historyError,
				sessionId,
			});
			// Non-fatal - continue with the response
		}

		// 6. Clear retry context on success
		await clearRetryContext(sessionId);

		return {
			success: true,
			response: result.response,
			reason: "degraded_model_success",
		};
	} catch (error: any) {
		retryLogger.error("Unexpected error during retry processing", {
			error: error.message,
			sessionId,
			traceId,
		});

		await clearRetryContext(sessionId);

		return {
			success: false,
			forceHandoff: true,
			reason: "unexpected_error",
		};
	}
}
