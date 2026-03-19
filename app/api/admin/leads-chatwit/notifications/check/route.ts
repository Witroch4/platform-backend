import { type NextRequest, NextResponse } from "next/server";
// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import("@/lib/sse-manager").then((m) => m.sseManager);

export async function GET(request: NextRequest) {
	const sseManager = await getSseManager();
	const status = sseManager.getStatus();

	return NextResponse.json(status);
}
