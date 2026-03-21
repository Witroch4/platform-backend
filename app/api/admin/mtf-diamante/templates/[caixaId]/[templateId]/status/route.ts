import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const BASE = "/api/v1/socialwise/admin/mtf-diamante/templates";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ caixaId: string; templateId: string }> },
) {
	const { caixaId, templateId } = await params;
	return proxyPlatformAdminRequest(request, `${BASE}/${caixaId}/${templateId}/status`);
}
