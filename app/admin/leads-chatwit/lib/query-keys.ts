const LEADS_QUERY_ROOT = ["leads"] as const;

export const leadsQueryKeys = {
	all: LEADS_QUERY_ROOT,
	messages: (leadId: string) => [...LEADS_QUERY_ROOT, "messages", leadId] as const,
	allMessages: (filters: Record<string, unknown>) =>
		[...LEADS_QUERY_ROOT, "all-messages", filters] as const,
	list: (filters?: Record<string, unknown>) => [...LEADS_QUERY_ROOT, "list", filters] as const,
	operationStatus: (leadId: string, stage: string) =>
		[...LEADS_QUERY_ROOT, "operation-status", leadId, stage] as const,
	detail: (leadId: string) => [...LEADS_QUERY_ROOT, "detail", leadId] as const,
	oabRubrics: () => [...LEADS_QUERY_ROOT, "oab-rubrics"] as const,
};
