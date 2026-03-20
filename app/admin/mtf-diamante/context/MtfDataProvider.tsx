// app/admin/mtf-diamante/context/MtfDataProvider.tsx
"use client";

import type React from "react";
import { createContext, useContext, useState, useCallback, useMemo, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";

// Import dedicated hooks (all use React Query internally)
import { useInteractiveMessages } from "../hooks/useInteractiveMessages";
import { useCaixasManager } from "../hooks/useCaixas";
import { useLotesManager } from "../hooks/useLotes";
import { useVariaveisManager } from "../hooks/useVariaveis";
import { useApiKeysManager } from "../hooks/useApiKeys";
import { useInboxButtonReactions } from "../hooks/useInboxButtonReactions";
import { useApprovedTemplates } from "../hooks/useApprovedTemplates";
import { useChatwitAgents } from "../hooks/useChatwitAgents";

// Import types
import type { MtfDataContextType } from "../lib/types";

const MtfDataContext = createContext<MtfDataContextType | undefined>(undefined);

export function useMtfData() {
	const context = useContext(MtfDataContext);
	if (!context) {
		throw new Error("useMtfData deve ser usado dentro de MtfDataProvider");
	}
	return context;
}

interface MtfDataProviderProps {
	children: React.ReactNode;
}

/**
 * Internal component that uses useSearchParams (requires Suspense boundary)
 */
function MtfDataProviderContent({ children }: MtfDataProviderProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();

	// Simple pause state management
	const [isPaused, setIsPaused] = useState(false);

	// Extract inboxId from URL (path or query). Query takes precedence to align keys across consumers.
	const inboxIdFromQuery = (searchParams?.get("inboxId") || searchParams?.get("caixaId")) ?? null;
	const inboxIdFromPath = pathname?.match(/\/inbox\/([^\/]+)/)?.[1] || null;
	const inboxId = inboxIdFromQuery || inboxIdFromPath;

	// Use dedicated hooks with pause support (all backed by React Query)
	const messagesHook = useInteractiveMessages(inboxId, isPaused);
	const caixasHook = useCaixasManager(isPaused);
	const lotesHook = useLotesManager(isPaused);
	const variaveisHook = useVariaveisManager(isPaused);
	const apiKeysHook = useApiKeysManager(isPaused);
	const buttonReactionsHook = useInboxButtonReactions({ inboxId, paused: isPaused });
	const approvedTemplatesHook = useApprovedTemplates(inboxId, isPaused);
	const chatwitAgentsHook = useChatwitAgents();

	// Pause/Resume functions
	const pauseUpdates = useCallback(() => {
		setIsPaused(true);
	}, []);

	const resumeUpdates = useCallback(() => {
		setIsPaused(false);
		// Invalidate all MTF queries to sync with server when resuming
		queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.all });
	}, [queryClient]);

	// Refresh functions — delegate to queryClient invalidation
	const refreshMessages = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.interactiveMessages(inboxId ?? undefined) }),
		[queryClient, inboxId],
	);
	const refreshCaixas = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() }),
		[queryClient],
	);
	const refreshLotes = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() }),
		[queryClient],
	);
	const refreshVariaveis = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() }),
		[queryClient],
	);
	const refreshApiKeys = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() }),
		[queryClient],
	);
	const refreshButtonReactions = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.buttonReactions(inboxId) }),
		[queryClient, inboxId],
	);

	// Button reactions compatibility functions
	const addButtonReactionCompat = useCallback(
		async (optimisticReaction: any, apiPayload: any) => {
			if (!inboxId) throw new Error("Inbox ID é obrigatório");

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
		return buttonReactionsHook.reactions.map((reaction: any) => {
			const action = reaction.actionPayload?.action || reaction.action || "";

			let linkedMessageId = reaction.linkedMessageId || reaction.actionPayload?.messageId || null;
			let linkedTemplateMetaId = reaction.linkedTemplateMetaId || null;
			if (!linkedMessageId && !linkedTemplateMetaId && action && typeof action === "string") {
				if (action.startsWith("send_interactive:")) {
					linkedMessageId = action.replace("send_interactive:", "");
				} else if (action.startsWith("send_template:")) {
					linkedTemplateMetaId = action.replace("send_template:", "");
				}
			}

			return {
				id: reaction.id,
				messageId: reaction.messageId || reaction.inboxId,
				buttonId: reaction.buttonId,
				emoji: reaction.actionPayload?.emoji || reaction.emoji || "",
				textResponse: reaction.actionPayload?.textReaction || reaction.textReaction || reaction.description || "",
				textReaction: reaction.actionPayload?.textReaction || reaction.textReaction || reaction.description || "",
				label: reaction.description || reaction.textReaction || "",
				action,
				linkedMessageId,
				linkedTemplateMetaId,
				actionPayload: reaction.actionPayload,
				createdAt: reaction.createdAt,
				updatedAt: reaction.updatedAt,
			};
		});
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

	// Context value
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

			// Approved Templates
			approvedTemplates: approvedTemplatesHook.templates,
			isLoadingTemplates: approvedTemplatesHook.isLoading,
			refreshTemplates: () => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.approvedTemplates(inboxId) }),

			// Chatwit Agents
			chatwitAgents: chatwitAgentsHook.chatwitAgents,

			// Pause Control
			isUpdatesPaused: isPaused,
			pauseUpdates,
			resumeUpdates,

			// Refresh functions
			refreshMessages,
			refreshCaixas,
			refreshLotes,
			refreshVariaveis,
			refreshApiKeys,
			refreshButtonReactions,

			// General state
			isInitialized,
		}),
		[
			messagesHook,
			caixasHook,
			lotesHook,
			variaveisHook,
			apiKeysHook,
			approvedTemplatesHook,
			chatwitAgentsHook,
			isPaused,
			pauseUpdates,
			resumeUpdates,
			refreshMessages,
			refreshCaixas,
			refreshLotes,
			refreshVariaveis,
			refreshApiKeys,
			refreshButtonReactions,
			isInitialized,
			addButtonReactionCompat,
			updateButtonReactionCompat,
			convertedButtonReactions,
			queryClient,
			inboxId,
		],
	);

	return <MtfDataContext.Provider value={contextValue}>{children}</MtfDataContext.Provider>;
}

/**
 * MtfDataProvider — orchestrates all MTF Diamante hooks via React Query.
 *
 * Replaces the old SwrProvider. All underlying hooks now use React Query (TanStack Query v5).
 * No SWR dependency remains.
 */
export function MtfDataProvider({ children }: MtfDataProviderProps) {
	return (
		<Suspense fallback={<div>Loading...</div>}>
			<MtfDataProviderContent>{children}</MtfDataProviderContent>
		</Suspense>
	);
}

// Backward-compatible export name
export { MtfDataProvider as SwrProvider };

export default MtfDataProvider;
