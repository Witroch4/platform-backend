// Response Utilities for Flow Analytics API
// Standardized response formatting and error handling

import { NextResponse } from "next/server";
import type { ApiResponse, ApiSuccessResponse, ApiErrorResponse } from "@/types/flow-analytics";

/**
 * Create a success response
 */
export function successResponse<T>(data: T): NextResponse<ApiSuccessResponse<T>> {
	return NextResponse.json({
		success: true,
		data,
	});
}

/**
 * Create an error response
 */
export function errorResponse(
	error: string,
	status: number = 400,
	code?: string,
	details?: unknown,
): NextResponse<ApiErrorResponse> {
	return NextResponse.json(
		{
			success: false,
			error,
			code,
			details,
		},
		{ status },
	);
}

/**
 * Error codes for analytics API
 */
export const ErrorCodes = {
	INVALID_FILTERS: "INVALID_FILTERS",
	MISSING_REQUIRED_PARAM: "MISSING_REQUIRED_PARAM",
	FLOW_NOT_FOUND: "FLOW_NOT_FOUND",
	INBOX_NOT_FOUND: "INBOX_NOT_FOUND",
	SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
	INVALID_DATE_RANGE: "INVALID_DATE_RANGE",
	DATABASE_ERROR: "DATABASE_ERROR",
	UNAUTHORIZED: "UNAUTHORIZED",
	INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Handle database errors
 */
export function handleDatabaseError(error: unknown): NextResponse<ApiErrorResponse> {
	console.error("[Analytics API] Database error:", error);

	if (error instanceof Error) {
		return errorResponse("Erro ao acessar o banco de dados", 500, ErrorCodes.DATABASE_ERROR, error.message);
	}

	return errorResponse("Erro desconhecido ao acessar o banco de dados", 500, ErrorCodes.DATABASE_ERROR);
}

/**
 * Handle validation errors
 */
export function handleValidationError(message: string): NextResponse<ApiErrorResponse> {
	return errorResponse(message, 400, ErrorCodes.INVALID_FILTERS);
}

/**
 * Handle missing required parameter
 */
export function handleMissingParam(paramName: string): NextResponse<ApiErrorResponse> {
	return errorResponse(`Parâmetro obrigatório ausente: ${paramName}`, 400, ErrorCodes.MISSING_REQUIRED_PARAM);
}

/**
 * Handle not found errors
 */
export function handleNotFound(resourceType: string, resourceId: string): NextResponse<ApiErrorResponse> {
	const code =
		resourceType === "flow"
			? ErrorCodes.FLOW_NOT_FOUND
			: resourceType === "inbox"
				? ErrorCodes.INBOX_NOT_FOUND
				: ErrorCodes.SESSION_NOT_FOUND;

	return errorResponse(`${resourceType} não encontrado: ${resourceId}`, 404, code);
}

/**
 * Handle unauthorized access
 */
export function handleUnauthorized(): NextResponse<ApiErrorResponse> {
	return errorResponse("Usuário não autenticado", 401, ErrorCodes.UNAUTHORIZED);
}

/**
 * Wrap async handler with error handling
 */
export function withErrorHandling<T>(handler: () => Promise<NextResponse>): Promise<NextResponse> {
	return handler().catch((error: unknown) => {
		console.error("[Analytics API] Unhandled error:", error);

		if (error instanceof Error) {
			return errorResponse("Erro interno do servidor", 500, ErrorCodes.INTERNAL_ERROR, error.message);
		}

		return errorResponse("Erro interno desconhecido", 500, ErrorCodes.INTERNAL_ERROR);
	});
}

/**
 * Set cache headers for response
 */
export function setCacheHeaders(response: NextResponse, ttlSeconds: number): NextResponse {
	response.headers.set("Cache-Control", `private, max-age=${ttlSeconds}`);
	return response;
}

/**
 * Create a cached success response
 */
export function cachedSuccessResponse<T>(data: T, ttlSeconds: number = 30): NextResponse {
	const response = successResponse(data);
	return setCacheHeaders(response, ttlSeconds);
}
