import { useState, useEffect, useCallback } from "react";
import type { TemplateApprovalRequest, Template, User } from "@prisma/client";

export interface ApprovalRequestWithDetails extends TemplateApprovalRequest {
	templateLibrary: Template;
	requestedBy: Pick<User, "id" | "name" | "email">;
	processedBy?: Pick<User, "id" | "name" | "email"> | null;
}

export interface UseApprovalRequestsOptions {
	status?: "pending" | "approved" | "rejected";
	autoFetch?: boolean;
}

export interface ApprovalRequestsHook {
	requests: ApprovalRequestWithDetails[];
	loading: boolean;
	error: string | null;
	fetchRequests: () => Promise<void>;
	processRequest: (requestId: string, status: "approved" | "rejected", responseMessage?: string) => Promise<void>;
}

export function useApprovalRequests(options: UseApprovalRequestsOptions = {}): ApprovalRequestsHook {
	const [requests, setRequests] = useState<ApprovalRequestWithDetails[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchRequests = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const params = new URLSearchParams();

			if (options.status) {
				params.append("status", options.status);
			}

			const response = await fetch(`/api/admin/mtf-diamante/template-library/approval?${params}`);

			if (!response.ok) {
				throw new Error("Failed to fetch approval requests");
			}

			const data = await response.json();
			setRequests(data.requests);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	}, [options.status]);

	const processRequest = useCallback(
		async (requestId: string, status: "approved" | "rejected", responseMessage?: string) => {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch(`/api/admin/mtf-diamante/template-library/approval/${requestId}`, {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						status,
						responseMessage,
					}),
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || "Failed to process approval request");
				}

				// Refresh requests after processing
				await fetchRequests();
			} catch (err) {
				setError(err instanceof Error ? err.message : "An error occurred");
				throw err;
			} finally {
				setLoading(false);
			}
		},
		[fetchRequests],
	);

	// Auto-fetch on mount and when options change
	useEffect(() => {
		if (options.autoFetch !== false) {
			fetchRequests();
		}
	}, [fetchRequests, options.autoFetch]);

	return {
		requests,
		loading,
		error,
		fetchRequests,
		processRequest,
	};
}
