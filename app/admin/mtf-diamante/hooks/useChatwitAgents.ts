"use client";

import useSWR from "swr";
import { chatwitAgentsApi } from "../lib/api-clients";
import { useMemo } from "react";

export function useChatwitAgents() {
    const { data, error, isLoading } = useSWR(
        "/api/admin/mtf-diamante/chatwit-agents", // Cache key
        () => chatwitAgentsApi.getAll(),
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute
        }
    );

    return useMemo(() => ({
        chatwitAgents: data || [],
        isLoading,
        error
    }), [data, isLoading, error]);
}
