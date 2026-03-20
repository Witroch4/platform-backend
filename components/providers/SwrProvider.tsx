// DEPRECATED: SWR Provider is no longer used.
// All data fetching uses React Query (TanStack Query v5) via ReactQueryProvider.
// This file is kept as a no-op for backward compatibility during Phase 6 cleanup.
"use client";

export function SWRProvider({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
