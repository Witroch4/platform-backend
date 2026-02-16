//app\admin\mtf-diamante\context\SwrProvider.tsx
"use client";

import type React from "react";
import { createContext, useContext, useState, useCallback, useMemo, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SWRConfig } from "swr";
import type { Middleware, SWRHook } from "swr";

// Import SSR helpers
import { createSWRFallback, type MtfInitialData } from "../lib/ssr-helpers";

// Import error handling utilities (mantidos para compatibilidade)
import { type ApiError } from "../lib/error-handling";

// Import cleanup utilities
import { deprecated, devLog } from "../lib/cleanup-utils";

// Middleware para observabilidade e métricas (conforme guia SWR 2.3)
const retryMetricsMw: Middleware = (useNext: SWRHook) => (key, fetcher, config) => {
	const t0 = performance.now();
	return useNext(key, fetcher, {
		errorRetryInterval: 3000,
		shouldRetryOnError: (err: any) => !String(err?.message).includes("401"),
		...config,
		onSuccess: (d: any, k: any, c: any) => {
			console.info("[SWR OK]", k, Math.round(performance.now() - t0), "ms");
			config?.onSuccess?.(d, k, c);
		},
		onError: (e: any, k: any, c: any) => {
			console.warn("[SWR ERR]", k, e);
			config?.onError?.(e, k, c);
		},
	});
};

// Import dedicated hooks
import { useInteractiveMessages } from "../hooks/useInteractiveMessages";
import { useCaixasManager } from "../hooks/useCaixas";
import { useLotesManager } from "../hooks/useLotes";
import { useVariaveisManager } from "../hooks/useVariaveis";
import { useApiKeysManager } from "../hooks/useApiKeys";
import { useInboxButtonReactions } from "../hooks/useInboxButtonReactions";

// Import types
import type { MtfDataContextType, ChatwitInbox } from "../lib/types";

// Legacy API function for compatibility
async function saveMessageWithReactions(payload: any, isEdit: boolean) {
	const url = "/api/admin/mtf-diamante/messages-with-reactions";
	const method = isEdit ? "PUT" : "POST";

	if (isEdit) {
		const messageId = payload.editingMessageId || payload.messageId || payload.message?.id || payload.id;

		if (!messageId || messageId.toString().startsWith("temp-")) {
			throw new Error("ID válido é obrigatório para edições. IDs temporários não são permitidos.");
		}

		payload.messageId = messageId;
	}

	const response = await fetch(url, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ error: "Falha na comunicação com o servidor." }));
		throw new Error(errorData.error || "Falha ao salvar a mensagem.");
	}

	return response.json();
}

const MtfDataContext = createContext<MtfDataContextType | undefined>(undefined);

export function useMtfData() {
	const context = useContext(MtfDataContext);
	if (!context) {
		throw new Error("useMtfData deve ser usado dentro de SwrProvider");
	}
	return context;
}

interface SwrProviderProps {
	children: React.ReactNode;
	initialData?: MtfInitialData; // Dados iniciais do SSR para evitar flicker
}

/**
 * Internal component that uses useSearchParams
 */
function SwrProviderContent({ children, initialData }: SwrProviderProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// Simple pause state management
	const [isPaused, setIsPaused] = useState(false);

	// Extract inboxId from URL (path or query). Query takes precedence to align keys across consumers.
	const inboxIdFromQuery = (searchParams?.get("inboxId") || searchParams?.get("caixaId")) ?? null;
	const inboxIdFromPath = pathname?.match(/\/inbox\/([^\/]+)/)?.[1] || null;
	const inboxId = inboxIdFromQuery || inboxIdFromPath;

	// Use dedicated hooks with pause support
	const messagesHook = useInteractiveMessages(inboxId, isPaused);
	const caixasHook = useCaixasManager(isPaused);
	const lotesHook = useLotesManager(isPaused);
	const variaveisHook = useVariaveisManager(isPaused);
	const apiKeysHook = useApiKeysManager(isPaused);
	const buttonReactionsHook = useInboxButtonReactions({ inboxId, paused: isPaused });

	// Pause/Resume functions
	const pauseUpdates = useCallback(() => {
		setIsPaused(true);
	}, []);

	const resumeUpdates = useCallback(() => {
		setIsPaused(false);

		// Trigger revalidation when resuming to sync with server
		messagesHook.mutate();
		caixasHook.mutate();
		lotesHook.mutate();
		variaveisHook.mutate();
		apiKeysHook.mutate();
		buttonReactionsHook.mutate();
	}, [messagesHook, caixasHook, lotesHook, variaveisHook, apiKeysHook, buttonReactionsHook]);

	// Legacy compatibility functions (deprecated but maintained)
	const saveMessage = useCallback(
		deprecated(
			async (apiPayload: any, isEdit: boolean): Promise<any> => {
				return saveMessageWithReactions(apiPayload, isEdit);
			},
			"saveMessage is deprecated",
			"addMessage or updateMessage from dedicated hooks",
		),
		[],
	);

	const updateMessagesCache = useCallback(
		deprecated(
			async (messageOrId: any, action: string, _reactions?: any[]): Promise<any> => {
				// Simple wrapper that delegates to the appropriate hook method
				try {
					if (action === "add" && typeof messageOrId === "object") {
						await messagesHook.addMessage(messageOrId, messageOrId);
					} else if (action === "update" && typeof messageOrId === "object") {
						await messagesHook.updateMessage(messageOrId, messageOrId);
					} else if (action === "remove" && typeof messageOrId === "string") {
						await messagesHook.deleteMessage(messageOrId);
					}
				} catch (error) {
					devLog.error("Error in updateMessagesCache wrapper:", error);
					throw error;
				}
			},
			"updateMessagesCache is deprecated",
			"dedicated hook methods",
		),
		[messagesHook],
	);

	// Refresh functions for backward compatibility
	const refreshMessages = useCallback(() => messagesHook.mutate(), [messagesHook]);
	const refreshCaixas = useCallback(() => caixasHook.mutate(), [caixasHook]);
	const refreshLotes = useCallback(() => lotesHook.mutate(), [lotesHook]);
	const refreshVariaveis = useCallback(() => variaveisHook.mutate(), [variaveisHook]);
	const refreshApiKeys = useCallback(() => apiKeysHook.mutate(), [apiKeysHook]);
	const refreshButtonReactions = useCallback(() => buttonReactionsHook.mutate(), [buttonReactionsHook]);

	// Prefetch function for smooth navigation
	const prefetchInbox = useCallback(async (id: string) => {
		// This could be implemented with SWR's global mutate if needed
		// Feature can be implemented when needed for performance optimization
	}, []);

	// Button reactions compatibility functions
	const addButtonReactionCompat = useCallback(
		async (optimisticReaction: any, apiPayload: any) => {
			if (!inboxId) throw new Error("Inbox ID é obrigatório");

			// Convert from the expected interface to our hook interface
			const reactionData = {
				buttonId: optimisticReaction.buttonId,
				actionType: "BUTTON_REACTION" as const,
				actionPayload: {
					emoji: optimisticReaction.emoji || null,
					textReaction: optimisticReaction.label || null,
					action: optimisticReaction.action || null,
				},
				description: optimisticReaction.label || null,
				inboxId,
			};

			await buttonReactionsHook.addButtonReaction(reactionData);
		},
		[buttonReactionsHook, inboxId],
	);

	const updateButtonReactionCompat = useCallback(
		async (updatedReaction: any, apiPayload: any) => {
			if (!updatedReaction.id) return;

			const updates = {
				buttonId: updatedReaction.buttonId,
				actionPayload: {
					emoji: updatedReaction.emoji || null,
					textReaction: updatedReaction.label || null,
					action: updatedReaction.action || null,
				},
				description: updatedReaction.label || null,
			};

			await buttonReactionsHook.updateButtonReaction(updatedReaction.id, updates);
		},
		[buttonReactionsHook],
	);

	// Convert button reactions to expected format
	const convertedButtonReactions = useMemo(() => {
		return buttonReactionsHook.reactions.map((reaction: any) => ({
			id: reaction.id,
			messageId: reaction.messageId || reaction.inboxId, // Use messageId first, then inboxId as fallback
			buttonId: reaction.buttonId,
			emoji: reaction.actionPayload?.emoji || reaction.emoji || "",
			textResponse: reaction.actionPayload?.textReaction || reaction.textReaction || reaction.description || "",
			textReaction: reaction.actionPayload?.textReaction || reaction.textReaction || reaction.description || "", // Alias for compatibility
			label: reaction.description || reaction.textReaction || "", // Legacy compatibility
			action: reaction.actionPayload?.action || reaction.action || "", // Use actionPayload.action first, then direct action field as fallback
			actionPayload: reaction.actionPayload, // Keep original actionPayload for full data access
			createdAt: reaction.createdAt,
			updatedAt: reaction.updatedAt,
		}));
	}, [buttonReactionsHook.reactions]);

	// Computed state
	const isInitialized = useMemo(() => {
		return (
			!messagesHook.isLoading &&
			!caixasHook.isLoading &&
			!lotesHook.isLoading &&
			!variaveisHook.isLoading &&
			!apiKeysHook.isLoading &&
			!buttonReactionsHook.isLoading
		);
	}, [
		messagesHook.isLoading,
		caixasHook.isLoading,
		lotesHook.isLoading,
		variaveisHook.isLoading,
		apiKeysHook.isLoading,
		buttonReactionsHook.isLoading,
	]);

	// Context value with maintained API compatibility
	const contextValue: MtfDataContextType = useMemo(
		() => ({
			// Interactive Messages
			interactiveMessages: messagesHook.messages,
			isLoadingMessages: messagesHook.isLoading,
			addMessage: messagesHook.addMessage,
			updateMessage: messagesHook.updateMessage,
			deleteMessage: messagesHook.deleteMessage,

			// Caixas
			caixas: caixasHook.caixas,
			isLoadingCaixas: caixasHook.isLoading,
			addCaixa: caixasHook.addCaixa,
			updateCaixa: caixasHook.updateCaixa,
			deleteCaixa: caixasHook.deleteCaixa,

			// Lotes
			lotes: lotesHook.lotes,
			isLoadingLotes: lotesHook.isLoading,
			addLote: lotesHook.addLote,
			updateLote: lotesHook.updateLote,
			deleteLote: lotesHook.deleteLote,

			// Variáveis
			variaveis: variaveisHook.variaveis,
			isLoadingVariaveis: variaveisHook.isLoading,
			addVariavel: variaveisHook.addVariavel,
			updateVariavel: variaveisHook.updateVariavel,
			deleteVariavel: variaveisHook.deleteVariavel,

			// API Keys
			apiKeys: apiKeysHook.apiKeys,
			isLoadingApiKeys: apiKeysHook.isLoading,
			addApiKey: apiKeysHook.addApiKey,
			updateApiKey: apiKeysHook.updateApiKey,
			deleteApiKey: apiKeysHook.deleteApiKey,

			// Button Reactions
			buttonReactions: convertedButtonReactions,
			isLoadingButtonReactions: buttonReactionsHook.isLoading,
			addButtonReaction: addButtonReactionCompat,
			updateButtonReaction: updateButtonReactionCompat,
			deleteButtonReaction: buttonReactionsHook.deleteButtonReaction,

			// Pause Control
			isUpdatesPaused: isPaused,
			pauseUpdates,
			resumeUpdates,

			// Legacy compatibility functions (deprecated)
			saveMessage,
			updateMessagesCache,

			// Refresh functions
			refreshMessages,
			refreshCaixas,
			refreshLotes,
			refreshVariaveis,
			refreshApiKeys,
			refreshButtonReactions,

			// Legacy properties for backward compatibility
			loadingVariaveis: variaveisHook.isLoading,
			loadingLotes: lotesHook.isLoading,
			loadingCaixas: caixasHook.isLoading,
			setCaixas: deprecated(
				() => {
					// No-op function for backward compatibility
				},
				"setCaixas is deprecated",
				"dedicated hook methods",
			) as React.Dispatch<React.SetStateAction<ChatwitInbox[]>>,
			prefetchInbox,

			// General state
			isInitialized,
		}),
		[
			messagesHook,
			caixasHook,
			lotesHook,
			variaveisHook,
			apiKeysHook,
			isPaused,
			pauseUpdates,
			resumeUpdates,
			saveMessage,
			updateMessagesCache,
			refreshMessages,
			refreshCaixas,
			refreshLotes,
			refreshVariaveis,
			refreshApiKeys,
			refreshButtonReactions,
			prefetchInbox,
			isInitialized,
			addButtonReactionCompat,
			updateButtonReactionCompat,
			convertedButtonReactions,
		],
	);

	return <MtfDataContext.Provider value={contextValue}>{children}</MtfDataContext.Provider>;
}

/**
 * Simplified SwrProvider that orchestrates dedicated hooks
 *
 * This refactored version:
 * - Removes complex useRef, timers and manual protections
 * - Uses dedicated hooks internally for each data type
 * - Maintains public API compatibility
 * - Implements simplified pause/resume functionality
 */
export function SwrProvider({ children, initialData }: SwrProviderProps) {
	return (
		<Suspense fallback={<div>Loading...</div>}>
			<SwrProviderContent initialData={initialData}>{children}</SwrProviderContent>
		</Suspense>
	);
}

/**
 * Provider wrapper with SWRConfig for centralized error handling and fallback data
 *
 * Features:
 * - Centralized error handling with logging
 * - SSR support with fallback data
 * - Intelligent retry strategy
 * - Global SWR configuration
 */
export function SwrProviderWithSWR({ children, initialData }: SwrProviderProps) {
	// Create fallback data for SWR from initialData
	const fallbackData = useMemo(() => createSWRFallback(initialData), [initialData]);

	// Global SWR configuration with enhanced error handling
	const swrConfig = useMemo(
		() => ({
			// Fetcher único JSON conforme guia SWR 2.3
			fetcher: async (url: string) => {
				const r = await fetch(url);
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			},

			// Fallback data for SSR
			fallback: fallbackData,

			// Error handling simplificado (conforme guia SWR 2.3)
			onError: (error: any, key: string) => {
				console.warn("[SWR ERR]", key, error);

				// Show user-friendly notifications for critical errors
				if (error.message?.includes("500")) {
					console.warn("⚠️ Erro interno do servidor. Os dados podem estar desatualizados.");
				} else if (!error.message?.includes("HTTP")) {
					console.warn("⚠️ Erro de conexão. Verificando conectividade...");
				}
			},

			// Intelligent retry strategy (conforme guia SWR 2.3)
			shouldRetryOnError: (err: any) => !String(err?.message).includes("401"),

			// Enhanced retry configuration with exponential backoff
			errorRetryCount: 3,
			errorRetryInterval: 3000, // Conforme guia SWR 2.3

			// Global revalidation settings
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
			revalidateIfStale: true,

			// Deduplication settings (conforme guia SWR 2.3)
			dedupingInterval: 1500, // 1.5 seconds

			// Loading timeout (conforme guia SWR 2.3)
			loadingTimeout: 15000, // 15 seconds

			// Success callback simplificado (conforme guia SWR 2.3)
			onSuccess: (data: any, key: string) => {
				if (process.env.NODE_ENV === "development") {
					console.info("[SWR OK]", key, {
						type: Array.isArray(data) ? "array" : typeof data,
						length: Array.isArray(data) ? data.length : "N/A",
					});
				}
			},

			// Loading state callback (conforme guia SWR 2.3)
			onLoadingSlow: (key: string) => {
				console.warn(`⏳ [SWR Slow Loading] ${key} está demorando mais que o esperado`);
			},

			// Error retry com exponential backoff simplificado (conforme guia SWR 2.3)
			onErrorRetry: (error: any, key: string, config: any, revalidate: any, { retryCount }: any) => {
				// Don't retry on 404
				if (error.message?.includes("404")) return;

				// Don't retry after 3 attempts
				if (retryCount >= 3) return;

				// Exponential backoff: 1s, 2s, 4s
				const delay = Math.pow(2, retryCount) * 1000;

				if (process.env.NODE_ENV === "development") {
					console.log(`🔄 [SWR Retry] ${key} - Attempt ${retryCount + 1}/3 in ${delay}ms`);
				}

				setTimeout(() => revalidate({ retryCount }), delay);
			},

			// Focus revalidation throttling (conforme guia SWR 2.3)
			focusThrottleInterval: 5000, // 5 seconds

			// Provider para cache (conforme guia SWR 2.3)
			provider: () => new Map(),

			// Middleware para observabilidade (conforme guia SWR 2.3)
			use: [retryMetricsMw],
		}),
		[fallbackData],
	);

	return (
		<SWRConfig value={swrConfig}>
			<SwrProvider initialData={initialData}>{children}</SwrProvider>
		</SWRConfig>
	);
}

// Export the SWR-wrapped version as default for better DX
export default SwrProviderWithSWR;
