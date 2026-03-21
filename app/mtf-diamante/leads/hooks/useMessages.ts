"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { leadsQueryKeys } from "../lib/query-keys";

export interface Message {
	id: string;
	content: string;
	isFromLead: boolean;
	messageType: string;
	externalId: string | null;
	createdAt: string;
	updatedAt: string;
}

interface MessagesPage {
	messages: Message[];
	hasMore: boolean;
	nextCursor?: string;
	totalCount: number;
}

const fetchMessages = async (leadId: string, cursor?: string): Promise<MessagesPage> => {
	const params = new URLSearchParams({ leadId });
	if (cursor) params.set("cursor", cursor);
	const res = await fetch(`/api/admin/leads-chatwit/messages?${params}`);
	if (!res.ok) throw new Error("Erro ao buscar mensagens");
	return res.json();
};

export function useMessages(leadId: string | null) {
	const query = useInfiniteQuery({
		queryKey: leadsQueryKeys.messages(leadId ?? "__none__"),
		queryFn: ({ pageParam }) => fetchMessages(leadId!, pageParam),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		getPreviousPageParam: () => undefined,
		maxPages: 10,
		enabled: !!leadId,
		staleTime: 0,
		refetchOnWindowFocus: false,
	});

	const allMessages = query.data?.pages.flatMap((p) => p.messages) ?? [];
	const lastPage = query.data?.pages[query.data.pages.length - 1];

	return {
		messages: allMessages,
		hasMore: lastPage?.hasMore ?? false,
		totalCount: lastPage?.totalCount ?? 0,
		isLoading: query.isLoading,
		error: query.error,
		refresh: query.refetch,
		loadMore: query.fetchNextPage,
		hasNextPage: query.hasNextPage,
		isFetchingNextPage: query.isFetchingNextPage,
	};
}
