/**
 * Access Control Middleware for AI Integration APIs
 *
 * Provides authentication and authorization middleware for AI integration
 * admin interfaces and sensitive operations.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { UserRole } from "@prisma/client";
import {
	AIPermission,
	requirePermission,
	AccessContext,
	logSuccessfulAccess,
	logFailedOperation,
} from "../services/access-control";
import log from "@/lib/log";

/**
 * Interface for middleware options
 */
export interface AccessControlOptions {
	requiredPermission?: AIPermission;
	requiredPermissions?: AIPermission[];
	allowedRoles?: UserRole[];
	requireAuth?: boolean;
	logAccess?: boolean;
	resourceType?: string;
	resourceId?: string;
}

/**
 * Creates access control middleware
 */
export function withAccessControl(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: AccessControlOptions = {},
) {
	return async (req: NextRequest): Promise<NextResponse> => {
		const {
			requiredPermission,
			requiredPermissions,
			allowedRoles,
			requireAuth = true,
			logAccess = true,
			resourceType = "AI_RESOURCE",
			resourceId,
		} = options;

		try {
			// Get session if authentication is required
			let session = null;
			if (requireAuth) {
				session = await auth();

				if (!session?.user) {
					return NextResponse.json({ error: "Authentication required" }, { status: 401 });
				}
			}

			// Create access context
			const context: AccessContext = {
				userId: session?.user?.id || "anonymous",
				userRole: (session?.user?.role as UserRole) || UserRole.DEFAULT,
				ipAddress: getClientIP(req),
				userAgent: req.headers.get("user-agent") || undefined,
				sessionId: session?.user?.id, // Using user ID as session identifier
			};

			// Check role-based access
			if (allowedRoles && !allowedRoles.includes(context.userRole)) {
				const error = new Error(`Access denied: Role ${context.userRole} not allowed`);

				if (logAccess) {
					await logFailedOperation(context, "ACCESS_DENIED_ROLE", resourceType, error, resourceId, {
						allowedRoles,
						userRole: context.userRole,
					});
				}

				return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
			}

			// Check specific permission
			if (requiredPermission) {
				try {
					requirePermission(context, requiredPermission);
				} catch (error) {
					return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
				}
			}

			// Check multiple permissions
			if (requiredPermissions && requiredPermissions.length > 0) {
				try {
					for (const permission of requiredPermissions) {
						requirePermission(context, permission);
					}
				} catch (error) {
					return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
				}
			}

			// Log successful access
			if (logAccess) {
				await logSuccessfulAccess(context, "API_ACCESS", resourceType, resourceId, {
					method: req.method,
					url: req.url,
					requiredPermission,
					requiredPermissions,
				});
			}

			// Call the actual handler
			const response = await handler(req, context);

			// Log successful operation
			if (logAccess && response.ok) {
				await logSuccessfulAccess(context, "API_OPERATION", resourceType, resourceId, {
					method: req.method,
					url: req.url,
					status: response.status,
				});
			}

			return response;
		} catch (error) {
			log.error("Access control middleware error", { error, url: req.url });

			// Log the error if we have context
			if (requireAuth) {
				try {
					const session = await auth();
					if (session?.user) {
						const context: AccessContext = {
							userId: session.user.id,
							userRole: (session.user.role as UserRole) || UserRole.DEFAULT,
							ipAddress: getClientIP(req),
							userAgent: req.headers.get("user-agent") || undefined,
						};

						await logFailedOperation(
							context,
							"API_ERROR",
							resourceType,
							error instanceof Error ? error : new Error("Unknown error"),
							resourceId,
							{ method: req.method, url: req.url },
						);
					}
				} catch (logError) {
					log.error("Failed to log access control error", { logError });
				}
			}

			return NextResponse.json({ error: "Internal server error" }, { status: 500 });
		}
	};
}

/**
 * Middleware specifically for admin-only endpoints
 */
export function withAdminAccess(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: Omit<AccessControlOptions, "allowedRoles"> = {},
) {
	return withAccessControl(handler, {
		...options,
		allowedRoles: [UserRole.ADMIN],
	});
}

/**
 * Middleware for audit log access
 */
export function withAuditAccess(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: Omit<AccessControlOptions, "requiredPermission"> = {},
) {
	return withAccessControl(handler, {
		...options,
		requiredPermission: AIPermission.VIEW_AUDIT_LOGS,
		resourceType: "AI_AUDIT_LOGS",
	});
}

/**
 * Middleware for queue management access
 */
export function withQueueAccess(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: Omit<AccessControlOptions, "requiredPermission"> = {},
) {
	return withAccessControl(handler, {
		...options,
		requiredPermission: AIPermission.MANAGE_QUEUES,
		resourceType: "AI_QUEUES",
	});
}

/**
 * Middleware for configuration access
 */
export function withConfigAccess(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: Omit<AccessControlOptions, "requiredPermission"> = {},
) {
	return withAccessControl(handler, {
		...options,
		requiredPermission: AIPermission.VIEW_CONFIG,
		resourceType: "AI_CONFIG",
	});
}

/**
 * Middleware for secret rotation access
 */
export function withSecretRotationAccess(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: Omit<AccessControlOptions, "requiredPermission"> = {},
) {
	return withAccessControl(handler, {
		...options,
		requiredPermission: AIPermission.ROTATE_SECRETS,
		resourceType: "AI_SECRETS",
	});
}

/**
 * Rate limiting middleware for sensitive operations
 */
export function withRateLimit(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	options: {
		windowMs?: number;
		maxRequests?: number;
		keyGenerator?: (req: NextRequest, context: AccessContext) => string;
	} = {},
) {
	const {
		windowMs = 60000, // 1 minute
		maxRequests = 10,
		keyGenerator = (req, context) => `${context.userId}:${req.url}`,
	} = options;

	// Simple in-memory rate limiting (in production, use Redis)
	const requests = new Map<string, { count: number; resetTime: number }>();

	return async (req: NextRequest, context: AccessContext): Promise<NextResponse> => {
		const key = keyGenerator(req, context);
		const now = Date.now();

		const current = requests.get(key);

		if (!current || now > current.resetTime) {
			// Reset or initialize
			requests.set(key, { count: 1, resetTime: now + windowMs });
		} else if (current.count >= maxRequests) {
			// Rate limit exceeded
			await logFailedOperation(context, "RATE_LIMIT_EXCEEDED", "AI_RATE_LIMIT", new Error("Rate limit exceeded"), key, {
				maxRequests,
				windowMs,
				currentCount: current.count,
			});

			return NextResponse.json(
				{
					error: "Rate limit exceeded",
					retryAfter: Math.ceil((current.resetTime - now) / 1000),
				},
				{
					status: 429,
					headers: {
						"Retry-After": Math.ceil((current.resetTime - now) / 1000).toString(),
					},
				},
			);
		} else {
			// Increment count
			current.count++;
		}

		return handler(req, context);
	};
}

/**
 * Extracts client IP address from request
 */
function getClientIP(req: NextRequest): string {
	// Check various headers for the real IP
	const forwarded = req.headers.get("x-forwarded-for");
	if (forwarded) {
		return forwarded.split(",")[0].trim();
	}

	const realIP = req.headers.get("x-real-ip");
	if (realIP) {
		return realIP;
	}

	const cfConnectingIP = req.headers.get("cf-connecting-ip");
	if (cfConnectingIP) {
		return cfConnectingIP;
	}

	// Fallback when no IP headers are available
	return "unknown";
}

/**
 * Validates request body size for security
 */
export function withBodySizeLimit(
	handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
	maxSizeBytes: number = 1024 * 1024, // 1MB default
) {
	return async (req: NextRequest, context: AccessContext): Promise<NextResponse> => {
		const contentLength = req.headers.get("content-length");

		if (contentLength && parseInt(contentLength) > maxSizeBytes) {
			await logFailedOperation(
				context,
				"REQUEST_TOO_LARGE",
				"AI_REQUEST_VALIDATION",
				new Error("Request body too large"),
				undefined,
				{ contentLength: parseInt(contentLength), maxSizeBytes },
			);

			return NextResponse.json({ error: "Request body too large" }, { status: 413 });
		}

		return handler(req, context);
	};
}

/**
 * Combines multiple middleware functions
 */
export function combineMiddleware(
	...middlewares: Array<
		(
			handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>,
		) => (req: NextRequest, context: AccessContext) => Promise<NextResponse>
	>
) {
	return (handler: (req: NextRequest, context: AccessContext) => Promise<NextResponse>) => {
		return middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
	};
}
