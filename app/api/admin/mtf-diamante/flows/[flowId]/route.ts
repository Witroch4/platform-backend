import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

function getPlatformPath(flowId: string): string {
	return `/api/v1/socialwise/admin/mtf-diamante/flows/${encodeURIComponent(flowId)}`;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ flowId: string }> },
) {
	const { flowId } = await params;
	return proxyPlatformAdminRequest(request, getPlatformPath(flowId));
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ flowId: string }> },
) {
	const { flowId } = await params;
	return proxyPlatformAdminRequest(request, getPlatformPath(flowId));
}

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ flowId: string }> },
) {
	const { flowId } = await params;
	return proxyPlatformAdminRequest(request, getPlatformPath(flowId));
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ flowId: string }> },
) {
	const { flowId } = await params;
	return proxyPlatformAdminRequest(request, getPlatformPath(flowId));
}
