/**
 * API Response Types
 *
 * Common API response structures for the queue management system
 */

export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: ApiError;
	meta?: ApiMeta;
}

export interface ApiError {
	code: string;
	message: string;
	details?: any;
	requestId?: string;
	timestamp: Date;
}

export interface ApiMeta {
	pagination?: PaginationMeta;
	filters?: Record<string, any>;
	sort?: SortMeta;
	timestamp: Date;
}

export interface PaginationMeta {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
}

export interface SortMeta {
	field: string;
	direction: "asc" | "desc";
}

export interface BatchResult {
	total: number;
	successful: number;
	failed: number;
	errors: Array<{
		id: string;
		error: string;
	}>;
}

export interface ExportResult {
	format: "csv" | "json" | "xlsx";
	url: string;
	filename: string;
	size: number;
	expiresAt: Date;
}

export interface HealthCheck {
	status: "healthy" | "degraded" | "unhealthy";
	timestamp: Date;
	services: Record<string, ServiceHealth>;
	uptime: number;
	version: string;
}

export interface ServiceHealth {
	status: "healthy" | "degraded" | "unhealthy";
	responseTime?: number;
	error?: string;
	lastCheck: Date;
}
