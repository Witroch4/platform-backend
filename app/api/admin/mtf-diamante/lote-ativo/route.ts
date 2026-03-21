import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const PLATFORM_PATH = "/api/v1/socialwise/admin/mtf-diamante/lote-ativo";

export async function GET(request: NextRequest) {
	return proxyPlatformAdminRequest(request, PLATFORM_PATH);
}
