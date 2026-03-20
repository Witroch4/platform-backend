const DASHBOARD_QUERY_ROOT = ["dashboard"] as const;

export const dashboardQueryKeys = {
	all: DASHBOARD_QUERY_ROOT,
	agentCatalog: () => [...DASHBOARD_QUERY_ROOT, "agent-catalog"] as const,
	providerModels: () => [...DASHBOARD_QUERY_ROOT, "provider-models"] as const,
	agentBlueprints: () => [...DASHBOARD_QUERY_ROOT, "agent-blueprints"] as const,
	oabRubrics: () => [...DASHBOARD_QUERY_ROOT, "oab-rubrics"] as const,
	oabRubricDetail: (id: string) => [...DASHBOARD_QUERY_ROOT, "oab-rubrics", id] as const,
};
