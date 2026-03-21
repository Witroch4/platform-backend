import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const PLATFORM_PATH = "/api/v1/socialwise/admin/mtf-diamante/variaveis";

export async function GET(request: NextRequest) {
	return proxyPlatformAdminRequest(request, PLATFORM_PATH);
}

export async function POST(request: NextRequest) {
	return proxyPlatformAdminRequest(request, PLATFORM_PATH);
}
