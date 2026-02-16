/**
 * Timeout Helpers for SocialWise Flow Processing
 * Provides early warning and fallback responses for slow LLM operations
 */

import { buildChannelResponse, ChannelResponse } from "../channel-formatting";
import type { ChannelType } from "@/services/openai-components/types";

export const EARLY_WARNING_MS = 5000; // 5s - Show "processing" message
export const FALLBACK_TIMEOUT_MS = 30000; // 30s - Show "system busy" fallback

/**
 * Creates an early warning response shown while LLM is processing
 * Appears after 5s if LLM hasn't responded yet
 */
export function buildEarlyWarningResponse(channelType: ChannelType): ChannelResponse {
	const text = "⏳ Processando sua solicitação, aguarde um momento...";
	const buttons = [
		{
			title: "Atendimento Humano",
			payload: "@falar_atendente",
		},
	];

	return buildChannelResponse(channelType, text, buttons);
}

/**
 * Creates a fallback response when LLM times out completely
 * Appears after 30s with option to retry or talk to human
 */
export function buildTimeoutFallbackResponse(channelType: ChannelType): ChannelResponse {
	const text = `🤖 Sistema temporariamente ocupado.

Você pode:
• Aguardar alguns segundos e tentar novamente
• Falar com um atendente humano agora

Se nenhum botão atender, digite sua solicitação`;

	const buttons = [
		{
			title: "Tentar Novamente",
			payload: "@retry",
		},
		{
			title: "Atendimento Humano",
			payload: "@falar_atendente",
		},
	];

	return buildChannelResponse(channelType, text, buttons);
}

/**
 * Executes an LLM operation with early warning and timeout fallback
 *
 * @param operation - The async LLM operation to execute
 * @param channelType - Channel type for response formatting
 * @param options - Configuration options
 * @returns Result with response and timing info
 */
export async function withTimeoutFallback<T>(
	operation: () => Promise<T>,
	channelType: ChannelType,
	options: {
		earlyWarningMs?: number;
		fallbackTimeoutMs?: number;
		onEarlyWarning?: (response: ChannelResponse) => void;
		onTimeout?: (response: ChannelResponse) => void;
	} = {},
): Promise<{
	result: T | null;
	timedOut: boolean;
	earlyWarningSent: boolean;
	responseTime: number;
}> {
	const startTime = Date.now();
	const earlyWarningMs = options.earlyWarningMs || EARLY_WARNING_MS;
	const fallbackTimeoutMs = options.fallbackTimeoutMs || FALLBACK_TIMEOUT_MS;

	let earlyWarningSent = false;
	let timedOut = false;
	let earlyWarningTimer: NodeJS.Timeout | null = null;
	let fallbackTimer: NodeJS.Timeout | null = null;
	let completed = false;

	try {
		// Create the operation promise
		const operationPromise = operation().then((result) => {
			completed = true;
			// Clear all timers on success
			if (earlyWarningTimer) clearTimeout(earlyWarningTimer);
			if (fallbackTimer) clearTimeout(fallbackTimer);
			return result;
		});

		// Set up early warning timer (5s)
		const earlyWarningPromise = new Promise<null>((resolve) => {
			earlyWarningTimer = setTimeout(() => {
				if (!completed) {
					earlyWarningSent = true;
					const warningResponse = buildEarlyWarningResponse(channelType);
					console.warn(`⏱️ EARLY WARNING: LLM taking longer than ${earlyWarningMs}ms - sending processing message`);
					if (options.onEarlyWarning) {
						options.onEarlyWarning(warningResponse);
					}
				}
				resolve(null);
			}, earlyWarningMs);
		});

		// Set up fallback timeout timer (30s)
		const fallbackPromise = new Promise<null>((resolve) => {
			fallbackTimer = setTimeout(() => {
				if (!completed) {
					timedOut = true;
					const fallbackResponse = buildTimeoutFallbackResponse(channelType);
					console.error(`❌ TIMEOUT FALLBACK: LLM exceeded ${fallbackTimeoutMs}ms - sending fallback message`);
					if (options.onTimeout) {
						options.onTimeout(fallbackResponse);
					}
				}
				resolve(null);
			}, fallbackTimeoutMs);
		});

		// Race between operation and fallback timeout
		// Note: early warning doesn't cancel the operation, just sends a message
		const result = await Promise.race([operationPromise, fallbackPromise]);

		// Cleanup
		if (earlyWarningTimer) clearTimeout(earlyWarningTimer);
		if (fallbackTimer) clearTimeout(fallbackTimer);

		const responseTime = Date.now() - startTime;

		return {
			result: result as T | null,
			timedOut,
			earlyWarningSent,
			responseTime,
		};
	} catch (error) {
		completed = true;
		if (earlyWarningTimer) clearTimeout(earlyWarningTimer);
		if (fallbackTimer) clearTimeout(fallbackTimer);

		const responseTime = Date.now() - startTime;

		console.error("Error in withTimeoutFallback:", error);

		return {
			result: null,
			timedOut: false,
			earlyWarningSent,
			responseTime,
		};
	}
}
