import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const BASE = "/api/v1/socialwise/admin/mtf-diamante/templates";

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ metaTemplateId: string }> },
) {
	const { metaTemplateId } = await params;
	return proxyPlatformAdminRequest(request, `${BASE}/edit/${metaTemplateId}`);
}
