/**
 * TURBO Mode Authentication Middleware
 * Centralized authentication for TURBO mode features
 * Based on requirements 1.6, 2.4, 3.1, 5.3
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	verifyTurboModeAccess,
	verifyFeatureFlagManagementAccess,
	type RoleVerificationResult,
} from "./role-verification";
import log from "@/lib/utils/logger";

export interface AuthenticatedRequest extends NextRequest {
	user?: {
		id: string;
		role: string;
		email?: string;
	};
}

/**
 * Authenticate user for TURBO mode features
 */
export async function authenticateTurboModeUser(request: NextRequest): Promise<{
	success: boolean;
	session?: any;
	response?: NextResponse;
	verification?: RoleVerificationResult;
}> {
	try {
		const session = await auth();
		const verification = verifyTurboModeAccess(session);

		if (!verification.hasAccess) {
			log.warn("TURBO mode access denied", {
				reason: verification.reason,
				userId: verification.userId,
				role: verification.role,
				path: request.nextUrl.pathname,
			});

			return {
				success: false,
				response: NextResponse.json({ error: verification.reason || "Acesso negado." }, { status: 401 }),
				verification,
			};
		}

		log.info("TURBO mode access granted", {
			userId: verification.userId,
			role: verification.role,
			path: request.nextUrl.pathname,
		});

		return {
			success: true,
			session,
			verification,
		};
	} catch (error) {
		log.error("Error authenticating TURBO mode user", {
			error: error instanceof Error ? error.message : "Unknown error",
			path: request.nextUrl.pathname,
		});

		return {
			success: false,
			response: NextResponse.json({ error: "Erro interno de autenticação." }, { status: 500 }),
		};
	}
}

/**
 * Authenticate user for feature flag management
 */
export async function authenticateFeatureFlagManager(request: NextRequest): Promise<{
	success: boolean;
	session?: any;
	response?: NextResponse;
	verification?: RoleVerificationResult;
}> {
	try {
		const session = await auth();
		const verification = verifyFeatureFlagManagementAccess(session);

		if (!verification.hasAccess) {
			log.warn("Feature flag management access denied", {
				reason: verification.reason,
				userId: verification.userId,
				role: verification.role,
				path: request.nextUrl.pathname,
			});

			return {
				success: false,
				response: NextResponse.json({ error: verification.reason || "Acesso negado." }, { status: 403 }),
				verification,
			};
		}

		log.info("Feature flag management access granted", {
			userId: verification.userId,
			role: verification.role,
			path: request.nextUrl.pathname,
		});

		return {
			success: true,
			session,
			verification,
		};
	} catch (error) {
		log.error("Error authenticating feature flag manager", {
			error: error instanceof Error ? error.message : "Unknown error",
			path: request.nextUrl.pathname,
		});

		return {
			success: false,
			response: NextResponse.json({ error: "Erro interno de autenticação." }, { status: 500 }),
		};
	}
}

/**
 * Validate user ownership or admin access for user-specific operations
 */
export function validateUserAccess(
	sessionUserId: string,
	targetUserId: string,
	userRole: string,
): { hasAccess: boolean; reason?: string } {
	// User can access their own data
	if (sessionUserId === targetUserId) {
		return { hasAccess: true };
	}

	// ADMIN and SUPERADMIN can access any user's data
	if (userRole === "ADMIN" || userRole === "SUPERADMIN") {
		return { hasAccess: true };
	}

	return {
		hasAccess: false,
		reason: "Acesso negado. Você só pode acessar seus próprios dados.",
	};
}

/**
 * Create standardized authentication error response
 */
export function createAuthErrorResponse(message: string, status: number = 401): NextResponse {
	return NextResponse.json({ error: message }, { status });
}

/**
 * Create standardized success response with user context
 */
export function createAuthSuccessResponse(
	data: any,
	userContext?: {
		userId: string;
		role: string;
	},
): NextResponse {
	const response = NextResponse.json(data);

	// Add user context headers for debugging (non-sensitive info only)
	if (userContext) {
		response.headers.set("X-User-Role", userContext.role);
		response.headers.set("X-Request-Authenticated", "true");
	}

	return response;
}

/**
 * Middleware wrapper for API routes requiring TURBO mode authentication
 */
export function withTurboModeAuth(
	handler: (request: NextRequest, context: { params: any }, session: any) => Promise<NextResponse>,
) {
	return async (request: NextRequest, context: { params: any }) => {
		const authResult = await authenticateTurboModeUser(request);

		if (!authResult.success) {
			return authResult.response!;
		}

		return handler(request, context, authResult.session);
	};
}

/**
 * Middleware wrapper for API routes requiring feature flag management authentication
 */
export function withFeatureFlagAuth(
	handler: (request: NextRequest, context: { params: any }, session: any) => Promise<NextResponse>,
) {
	return async (request: NextRequest, context: { params: any }) => {
		const authResult = await authenticateFeatureFlagManager(request);

		if (!authResult.success) {
			return authResult.response!;
		}

		return handler(request, context, authResult.session);
	};
}
