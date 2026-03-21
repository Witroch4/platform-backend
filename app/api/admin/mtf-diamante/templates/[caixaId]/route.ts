import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const BASE = "/api/v1/socialwise/admin/mtf-diamante/templates";

export async function GET(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
	const { caixaId } = await params;
	return proxyPlatformAdminRequest(request, `${BASE}/${caixaId}`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
	const { caixaId } = await params;
	return proxyPlatformAdminRequest(request, `${BASE}/${caixaId}`);
}
