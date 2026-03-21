import { type NextRequest } from "next/server";
import { proxyPlatformAdminRequest } from "@/lib/platform-backend/admin-proxy";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ flowId: string }> },
) {
	const { flowId } = await params;
	return proxyPlatformAdminRequest(
		request,
		`/api/v1/socialwise/admin/mtf-diamante/flows/${encodeURIComponent(flowId)}/export`,
	);
}
