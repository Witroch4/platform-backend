import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

const BACKEND_PATH = "/api/v1/socialwise/admin/mtf-diamante/templates/ensure-media";

export async function POST(request: NextRequest) {
	return proxyPlatformAdminRequest(request, BACKEND_PATH);
}
