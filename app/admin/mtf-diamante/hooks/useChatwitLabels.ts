"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatwitLabelsApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";

export interface ChatwitLabelOption {
	title: string;
	color: string;
}

export function useChatwitLabels() {
	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.chatwitLabels(),
		queryFn: chatwitLabelsApi.getAll,
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	});

	return useMemo(
		() => ({
			chatwitLabels: (data || []) as ChatwitLabelOption[],
			isLoading,
			error,
		}),
		[data, isLoading, error],
	);
}
