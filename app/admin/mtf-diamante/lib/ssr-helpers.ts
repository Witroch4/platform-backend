// app/admin/mtf-diamante/lib/ssr-helpers.ts
// Helper functions for Server-Side Rendering support

import type { InteractiveMessage, ChatwitInbox, MtfDiamanteLote, MtfDiamanteVariavel } from "./types";

/**
 * Interface for initial data that can be passed to SwrProvider
 * for SSR support and avoiding loading flickers
 */
export interface MtfInitialData {
	interactiveMessages?: InteractiveMessage[];
	caixas?: ChatwitInbox[];
	lotes?: MtfDiamanteLote[];
	variaveis?: MtfDiamanteVariavel[];
	apiKeys?: any[];
}

/**
 * Creates fallback data object for SWR from initial data
 * This is used internally by SwrProviderWithSWR
 *
 * @param initialData - Initial data from SSR or prefetch
 * @returns SWR fallback data object
 */
export function createSWRFallback(initialData?: MtfInitialData): Record<string, any> {
	if (!initialData) return {};

	const fallback: Record<string, any> = {};

	// Map initial data to SWR keys used by hooks
	if (initialData.interactiveMessages) {
		fallback["interactive-messages"] = initialData.interactiveMessages;
	}

	if (initialData.caixas) {
		fallback["caixas"] = initialData.caixas;
	}

	if (initialData.lotes) {
		fallback["lotes"] = initialData.lotes;
	}

	if (initialData.variaveis) {
		fallback["variaveis"] = initialData.variaveis;
	}

	if (initialData.apiKeys) {
		fallback["api-keys"] = initialData.apiKeys;
	}

	return fallback;
}

/**
 * Helper function to prefetch data for a specific inbox
 * Can be used in getServerSideProps or similar SSR functions
 *
 * @param inboxId - The inbox ID to prefetch data for
 * @returns Promise with prefetched data
 */
export async function prefetchInboxData(inboxId: string): Promise<MtfInitialData> {
	try {
		// In a real implementation, you would fetch data from your API here
		// For now, return empty data structure

		const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

		// Parallel fetch of all data types
		const [messagesRes, caixasRes, lotesRes, variaveisRes, apiKeysRes] = await Promise.allSettled([
			fetch(`${baseUrl}/api/admin/mtf-diamante/interactive-messages?inboxId=${inboxId}`),
			fetch(`${baseUrl}/api/admin/mtf-diamante/caixas`),
			fetch(`${baseUrl}/api/admin/mtf-diamante/lotes`),
			fetch(`${baseUrl}/api/admin/mtf-diamante/variaveis`),
			fetch(`${baseUrl}/api/admin/mtf-diamante/api-keys`),
		]);

		const initialData: MtfInitialData = {};

		// Process messages
		if (messagesRes.status === "fulfilled" && messagesRes.value.ok) {
			const data = await messagesRes.value.json();
			initialData.interactiveMessages = data.data || [];
		}

		// Process caixas
		if (caixasRes.status === "fulfilled" && caixasRes.value.ok) {
			const data = await caixasRes.value.json();
			initialData.caixas = data.data || [];
		}

		// Process lotes
		if (lotesRes.status === "fulfilled" && lotesRes.value.ok) {
			const data = await lotesRes.value.json();
			initialData.lotes = data.data || [];
		}

		// Process variaveis
		if (variaveisRes.status === "fulfilled" && variaveisRes.value.ok) {
			const data = await variaveisRes.value.json();
			initialData.variaveis = data.data || [];
		}

		// Process apiKeys
		if (apiKeysRes.status === "fulfilled" && apiKeysRes.value.ok) {
			const data = await apiKeysRes.value.json();
			initialData.apiKeys = data.data || [];
		}

		return initialData;
	} catch (error) {
		console.error("Error prefetching inbox data:", error);
		return {}; // Return empty data on error
	}
}

/**
 * Helper function to create empty initial data structure
 * Useful for testing or when no SSR data is available
 */
export function createEmptyInitialData(): MtfInitialData {
	return {
		interactiveMessages: [],
		caixas: [],
		lotes: [],
		variaveis: [],
		apiKeys: [],
	};
}

/**
 * Validates initial data structure
 * Ensures all arrays are properly formatted
 *
 * @param data - Initial data to validate
 * @returns Validated and sanitized initial data
 */
export function validateInitialData(data: any): MtfInitialData {
	const validated: MtfInitialData = {};

	if (Array.isArray(data?.interactiveMessages)) {
		validated.interactiveMessages = data.interactiveMessages;
	}

	if (Array.isArray(data?.caixas)) {
		validated.caixas = data.caixas;
	}

	if (Array.isArray(data?.lotes)) {
		validated.lotes = data.lotes;
	}

	if (Array.isArray(data?.variaveis)) {
		validated.variaveis = data.variaveis;
	}

	if (Array.isArray(data?.apiKeys)) {
		validated.apiKeys = data.apiKeys;
	}

	return validated;
}
