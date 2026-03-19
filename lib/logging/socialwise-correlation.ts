function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, "");
}

export function normalizeSessionForLeadKey(sessionId: string | number): string {
	return String(sessionId)
		.trim()
		.replace(/^\+/, "")
		.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function buildLeadLogKey(
	accountId?: string | number | null,
	sessionId?: string | number | null,
): string | undefined {
	if (accountId === undefined || accountId === null || sessionId === undefined || sessionId === null) {
		return undefined;
	}

	const normalizedSessionId = normalizeSessionForLeadKey(sessionId);
	if (!normalizedSessionId) {
		return undefined;
	}

	return `acc${accountId}-id${normalizedSessionId}`;
}

export function buildChatwitConversationUrl(
	baseUrl?: string | null,
	accountId?: string | number | null,
	conversationDisplayId?: string | number | null,
): string | undefined {
	if (!baseUrl || accountId === undefined || accountId === null || conversationDisplayId === undefined || conversationDisplayId === null) {
		return undefined;
	}

	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	if (!normalizedBaseUrl) {
		return undefined;
	}

	try {
		const url = new URL(normalizedBaseUrl);
		url.pathname = `/app/accounts/${accountId}/conversations/${conversationDisplayId}`;
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return `${normalizedBaseUrl}/app/accounts/${accountId}/conversations/${conversationDisplayId}`;
	}
}