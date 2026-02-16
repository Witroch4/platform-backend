/**
 * Metrics Endpoint for Prometheus Scraping
 * Based on requirements 10.1, 10.2, 14.2
 */

import { NextRequest, NextResponse } from "next/server";
import { aiMetrics } from "../../../lib/ai-integration/utils/metrics";
import { aiLogger } from "../../../lib/ai-integration/utils/logger";

// Basic authentication for metrics endpoint
function isAuthorized(request: NextRequest): boolean {
	const authHeader = request.headers.get("authorization");

	if (!authHeader) {
		return false;
	}

	const expectedAuth = process.env.METRICS_AUTH_TOKEN;
	if (!expectedAuth) {
		// If no auth token is configured, allow access (for development)
		return process.env.NODE_ENV === "development";
	}

	return authHeader === `Bearer ${expectedAuth}`;
}

export async function GET(request: NextRequest) {
	const startTime = Date.now();

	try {
		// Check authorization
		if (!isAuthorized(request)) {
			aiLogger.warn("Unauthorized metrics access attempt", {
				stage: "admin",
				metadata: {
					ip:
						request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
						request.headers.get("x-real-ip") ||
						"unknown",
					userAgent: request.headers.get("user-agent"),
				},
			});

			return new NextResponse("Unauthorized", {
				status: 401,
				headers: {
					"WWW-Authenticate": "Bearer",
				},
			});
		}

		// Get query parameters
		const url = new URL(request.url);
		const format = url.searchParams.get("format") || "prometheus";
		const reset = url.searchParams.get("reset") === "true";

		let responseBody: string;
		let contentType: string;

		switch (format) {
			case "prometheus":
				responseBody = aiMetrics.exportPrometheus();
				contentType = "text/plain; version=0.0.4; charset=utf-8";
				break;

			case "json":
				const snapshot = aiMetrics.getSnapshot();
				responseBody = JSON.stringify(snapshot, null, 2);
				contentType = "application/json";
				break;

			case "summary":
				const summary = aiMetrics.getSummary();
				responseBody = JSON.stringify(summary, null, 2);
				contentType = "application/json";
				break;

			default:
				return new NextResponse("Invalid format. Use: prometheus, json, or summary", {
					status: 400,
				});
		}

		// Reset metrics if requested (useful for testing)
		if (reset && process.env.NODE_ENV !== "production") {
			aiMetrics.reset();
			aiLogger.info("Metrics reset requested", {
				stage: "admin",
				metadata: { format },
			});
		}

		// Log metrics access
		const duration = Date.now() - startTime;
		aiLogger.info("Metrics endpoint accessed", {
			stage: "admin",
			duration,
			metadata: {
				format,
				reset,
				responseSize: responseBody.length,
			},
		});

		return new NextResponse(responseBody, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "no-cache, no-store, must-revalidate",
				Pragma: "no-cache",
				Expires: "0",
			},
		});
	} catch (error) {
		const duration = Date.now() - startTime;

		aiLogger.errorWithStack("Metrics endpoint error", error as Error, {
			stage: "admin",
			duration,
		});

		return new NextResponse("Internal Server Error", { status: 500 });
	}
}

// Health check endpoint
export async function HEAD(request: NextRequest) {
	if (!isAuthorized(request)) {
		return new NextResponse(null, { status: 401 });
	}

	return new NextResponse(null, {
		status: 200,
		headers: {
			"Cache-Control": "no-cache",
		},
	});
}
