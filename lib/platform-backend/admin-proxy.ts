import "server-only";

import { auth } from "@/auth";
import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_PLATFORM_BACKEND_URL =
	process.env.NODE_ENV === "production" ? "http://platform-api:8000" : "http://localhost:8000";

function getPlatformBackendBaseUrl(): string {
	return process.env.PLATFORM_BACKEND_INTERNAL_URL || process.env.PLATFORM_BACKEND_URL || DEFAULT_PLATFORM_BACKEND_URL;
}

function copyResponseHeaders(source: Headers): Headers {
	const headers = new Headers();
	for (const headerName of ["content-type", "content-disposition", "cache-control", "x-request-id"]) {
		const value = source.get(headerName);
		if (value) {
			headers.set(headerName, value);
		}
	}
	return headers;
}

export async function proxyPlatformAdminRequest(
	request: NextRequest,
	pathname: string,
): Promise<NextResponse> {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
	}

	const targetUrl = new URL(pathname, getPlatformBackendBaseUrl());
	targetUrl.search = new URL(request.url).search;

	const headers = new Headers({
		Accept: request.headers.get("accept") || "application/json",
		"X-Internal-API-Key": process.env.PLATFORM_API_KEY || "dev-platform-api-key",
		"X-App-User-Id": session.user.id,
	});

	const contentType = request.headers.get("content-type");
	if (contentType) {
		headers.set("Content-Type", contentType);
	}

	const body =
		request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

	try {
		const response = await fetch(targetUrl.toString(), {
			method: request.method,
			headers,
			body,
			cache: "no-store",
		});

		return new NextResponse(await response.arrayBuffer(), {
			status: response.status,
			headers: copyResponseHeaders(response.headers),
		});
	} catch (error) {
		console.error("[platform-admin-proxy] request failed:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Falha ao conectar ao platform-backend.",
			},
			{ status: 502 },
		);
	}
}
