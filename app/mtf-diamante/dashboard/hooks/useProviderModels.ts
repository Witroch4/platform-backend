"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardQueryKeys } from "../lib/query-keys";

export interface ProviderModelOption {
	value: string;
	label: string;
	description: string;
	pricing: string;
	cutoff?: string;
	supportsReasoning?: boolean;
	fixedReasoning?: string;
	isNew?: boolean;
}

interface ProviderModelsPayload {
	openai: ProviderModelOption[];
	gemini: ProviderModelOption[];
	geminiAvailable: boolean;
}

const fetchProviderModels = async (): Promise<ProviderModelsPayload> => {
	const res = await fetch("/api/admin/mtf-agents/provider-models", { cache: "no-store" });
	if (!res.ok) {
		const detail = await res.json().catch(() => ({}));
		throw new Error(detail?.error || "Falha ao carregar modelos");
	}
	return res.json();
};

export function useProviderModels() {
	const { data, error, isLoading } = useQuery({
		queryKey: dashboardQueryKeys.providerModels(),
		queryFn: fetchProviderModels,
		staleTime: 10 * 60 * 1000, // 10min — reference data, models rarely change
		refetchOnWindowFocus: false,
		placeholderData: (prev) => prev,
	});

	return {
		openaiModels: data?.openai ?? null,
		geminiModels: data?.gemini ?? null,
		geminiAvailable: data?.geminiAvailable ?? false,
		isLoading,
		error,
	};
}
