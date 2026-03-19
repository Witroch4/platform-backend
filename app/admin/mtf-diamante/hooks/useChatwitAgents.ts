"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatwitAgentsApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";

export function useChatwitAgents() {
	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.chatwitAgents(),
		queryFn: chatwitAgentsApi.getAll,
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	});

	return useMemo(
		() => ({
			chatwitAgents: data || [],
			isLoading,
			error,
		}),
		[data, isLoading, error],
	);
}
