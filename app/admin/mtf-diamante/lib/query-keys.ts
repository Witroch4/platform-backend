const MTF_DIAMANTE_QUERY_ROOT = ["mtf-diamante"] as const;

export const mtfDiamanteQueryKeys = {
	all: MTF_DIAMANTE_QUERY_ROOT,
	chatwitAgents: () => [...MTF_DIAMANTE_QUERY_ROOT, "chatwit-agents"] as const,
	chatwitLabels: () => [...MTF_DIAMANTE_QUERY_ROOT, "chatwit-labels"] as const,
};
