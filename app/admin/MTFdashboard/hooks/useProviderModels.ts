"use client";

import useSWR from "swr";

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

const fetcher = async (url: string) => {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) {
		const detail = await res.json().catch(() => ({}));
		throw new Error(detail?.error || "Falha ao carregar modelos");
	}
	return res.json();
};

export function useProviderModels() {
	const { data, error, isLoading } = useSWR<ProviderModelsPayload>(
		"/api/admin/mtf-agents/provider-models",
		fetcher,
		{
			keepPreviousData: true,
			revalidateOnFocus: false,
			dedupingInterval: 60_000, // 1 min dedup no client
		},
	);

	return {
		openaiModels: data?.openai ?? null,
		geminiModels: data?.gemini ?? null,
		geminiAvailable: data?.geminiAvailable ?? false,
		isLoading,
		error,
	};
}
