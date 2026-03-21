import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const PLATFORM_PATH = "/api/v1/socialwise/admin/mtf-diamante/flows/import";

export async function POST(request: NextRequest) {
	return proxyPlatformAdminRequest(request, PLATFORM_PATH);
}
