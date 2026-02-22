import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCampaignProgress } from "@/lib/queue/campaign-orchestrator";

// =============================================================================
// GET — Progresso da campanha em tempo real
// =============================================================================

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ campaignId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { campaignId } = await params;
		const progress = await getCampaignProgress(campaignId);

		if (!progress) {
			return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
		}

		return NextResponse.json(
			{ success: true, data: progress },
			{
				headers: {
					"Cache-Control": "no-store, no-cache, must-revalidate",
				},
			},
		);
	} catch (error) {
		console.error("[campaigns/progress] GET error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}
