"use client";

import useSWR from "swr";
import { useCallback, useState } from "react";

export interface Message {
	id: string;
	content: string;
	isFromLead: boolean;
	messageType: string;
	externalId: string | null;
	createdAt: string;
	updatedAt: string;
}

interface MessagesData {
	messages: Message[];
	hasMore: boolean;
	nextCursor?: string;
	totalCount: number;
}

const fetcher = async (url: string): Promise<MessagesData> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Erro ao buscar mensagens");
	return res.json();
};

export function useMessages(leadId: string | null) {
	const [allMessages, setAllMessages] = useState<Message[]>([]);
	const [hasLoadedMore, setHasLoadedMore] = useState(false);

	const key = leadId ? `/api/admin/leads-chatwit/messages?leadId=${leadId}` : null;

	const { data, error, isLoading, mutate } = useSWR<MessagesData>(key, fetcher, {
		revalidateOnFocus: false,
		keepPreviousData: true,
		onSuccess: (newData) => {
			// Reset quando trocar de lead
			if (!hasLoadedMore) {
				setAllMessages(newData.messages);
			}
		},
	});

	// Refresh manual
	const refresh = useCallback(async () => {
		setHasLoadedMore(false);
		const result = await mutate();
		if (result) {
			setAllMessages(result.messages);
		}
	}, [mutate]);

	// Carregar mensagens anteriores
	const loadMore = useCallback(async () => {
		if (!data?.nextCursor || !leadId) return;

		try {
			const res = await fetch(`/api/admin/leads-chatwit/messages?leadId=${leadId}&cursor=${data.nextCursor}`);
			if (!res.ok) throw new Error("Erro ao carregar mais mensagens");
			const moreData: MessagesData = await res.json();

			setAllMessages((prev) => [...moreData.messages, ...prev]);
			setHasLoadedMore(true);

			// Atualizar cache do SWR com novo cursor
			mutate(
				(current) => {
					if (!current) return current;
					return {
						...current,
						hasMore: moreData.hasMore,
						nextCursor: moreData.nextCursor,
					};
				},
				{ revalidate: false },
			);
		} catch (err) {
			console.error("[useMessages] Erro ao carregar mais:", err);
		}
	}, [data?.nextCursor, leadId, mutate]);

	// Reset quando trocar de lead
	const resetForNewLead = useCallback(() => {
		setAllMessages([]);
		setHasLoadedMore(false);
	}, []);

	return {
		messages: hasLoadedMore ? allMessages : data?.messages || [],
		hasMore: data?.hasMore || false,
		totalCount: data?.totalCount || 0,
		isLoading,
		error,
		refresh,
		loadMore,
		resetForNewLead,
	};
}
