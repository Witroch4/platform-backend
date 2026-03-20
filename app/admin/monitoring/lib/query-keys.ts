const MONITORING_QUERY_ROOT = ["monitoring"] as const;

export const monitoringQueryKeys = {
	all: MONITORING_QUERY_ROOT,
	dashboard: (timeRange: string) => [...MONITORING_QUERY_ROOT, "dashboard", timeRange] as const,
	queues: (windowMinutes: number) => [...MONITORING_QUERY_ROOT, "queues", windowMinutes] as const,
	queueManagement: () => [...MONITORING_QUERY_ROOT, "queue-management"] as const,
	costOverview: () => [...MONITORING_QUERY_ROOT, "cost-overview"] as const,
};
