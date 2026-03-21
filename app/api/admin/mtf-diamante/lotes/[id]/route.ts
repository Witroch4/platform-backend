import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

function getPlatformPath(id: string): string {
	return `/api/v1/socialwise/admin/mtf-diamante/lotes/${encodeURIComponent(id)}`;
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	return proxyPlatformAdminRequest(request, getPlatformPath(id));
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	return proxyPlatformAdminRequest(request, getPlatformPath(id));
}
