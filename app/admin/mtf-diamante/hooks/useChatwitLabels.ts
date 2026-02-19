"use client";

import useSWR from "swr";
import { chatwitLabelsApi } from "../lib/api-clients";
import { useMemo } from "react";

export interface ChatwitLabelOption {
    title: string;
    color: string;
}

export function useChatwitLabels() {
    const { data, error, isLoading } = useSWR(
        "/api/admin/mtf-diamante/chatwit-labels",
        () => chatwitLabelsApi.getAll(),
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minuto
        }
    );

    return useMemo(() => ({
        chatwitLabels: (data || []) as ChatwitLabelOption[],
        isLoading,
        error,
    }), [data, isLoading, error]);
}
