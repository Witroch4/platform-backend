const MTF_DIAMANTE_QUERY_ROOT = ["mtf-diamante"] as const;

export const mtfDiamanteQueryKeys = {
	all: MTF_DIAMANTE_QUERY_ROOT,

	// Chatwit
	chatwitAgents: () => [...MTF_DIAMANTE_QUERY_ROOT, "chatwit-agents"] as const,
	chatwitLabels: () => [...MTF_DIAMANTE_QUERY_ROOT, "chatwit-labels"] as const,

	// Templates
	approvedTemplates: (inboxId: string | null) =>
		[...MTF_DIAMANTE_QUERY_ROOT, "approved-templates", inboxId] as const,

	// Mapeamentos
	mapeamentos: (caixaId: string) => [...MTF_DIAMANTE_QUERY_ROOT, "mapeamentos", caixaId] as const,
	mapeamentoTemplates: (caixaId: string) => [...MTF_DIAMANTE_QUERY_ROOT, "mapeamento-templates", caixaId] as const,
	mapeamentoFlows: (caixaId: string) => [...MTF_DIAMANTE_QUERY_ROOT, "mapeamento-flows", caixaId] as const,

	// Analytics
	analytics: {
		all: () => [...MTF_DIAMANTE_QUERY_ROOT, "analytics"] as const,
		kpis: (filters: Record<string, unknown>) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "kpis", filters] as const,
		alerts: (filters: Record<string, unknown>) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "alerts", filters] as const,
		funnel: (flowId: string, filters: Record<string, unknown>) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "funnel", flowId, filters] as const,
		heatmap: (filters: Record<string, unknown>) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "heatmap", filters] as const,
		nodeDetails: (flowId: string, nodeId: string) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "node-details", flowId, nodeId] as const,
		sessionReplay: (sessionId: string) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "session-replay", sessionId] as const,
		flows: (inboxId: string) =>
			[...MTF_DIAMANTE_QUERY_ROOT, "analytics", "flows", inboxId] as const,
	},

	// Interactive messages
	interactiveMessages: (inboxId?: string) =>
		[...MTF_DIAMANTE_QUERY_ROOT, "interactive-messages", inboxId] as const,

	// Flows
	flows: {
		all: () => [...MTF_DIAMANTE_QUERY_ROOT, "flows"] as const,
		detail: (flowId: string) => [...MTF_DIAMANTE_QUERY_ROOT, "flows", flowId] as const,
		canvas: (flowId: string) => [...MTF_DIAMANTE_QUERY_ROOT, "flows", "canvas", flowId] as const,
	},

	// Entities (for Phase 3)
	caixas: {
		all: () => [...MTF_DIAMANTE_QUERY_ROOT, "caixas"] as const,
		detail: (id: string) => [...MTF_DIAMANTE_QUERY_ROOT, "caixas", id] as const,
	},
	lotes: {
		all: () => [...MTF_DIAMANTE_QUERY_ROOT, "lotes"] as const,
	},
	variaveis: {
		all: () => [...MTF_DIAMANTE_QUERY_ROOT, "variaveis"] as const,
	},
	apiKeys: {
		all: () => [...MTF_DIAMANTE_QUERY_ROOT, "api-keys"] as const,
	},
};
