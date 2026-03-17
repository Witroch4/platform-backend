/**
 * Flow Playground — List active flows for an inbox
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const inboxId = request.nextUrl.searchParams.get("inboxId");
	if (!inboxId) {
		return NextResponse.json({ error: "inboxId obrigatório" }, { status: 400 });
	}

	try {
		const prisma = getPrismaInstance();

		const flows = await prisma.flow.findMany({
			where: { inboxId, isActive: true },
			select: {
				id: true,
				name: true,
				isActive: true,
				isCampaign: true,
				_count: { select: { nodes: true } },
			},
			orderBy: { name: "asc" },
		});

		// Buscar intents mapeadas para cada flow
		const flowIds = flows.map((f) => f.id);
		const intents = await prisma.mapeamentoIntencao.findMany({
			where: { inboxId, flowId: { in: flowIds } },
			select: { flowId: true, intentName: true },
		});

		const intentsByFlow = new Map<string, string[]>();
		for (const intent of intents) {
			if (!intent.flowId) continue;
			const arr = intentsByFlow.get(intent.flowId) ?? [];
			arr.push(intent.intentName);
			intentsByFlow.set(intent.flowId, arr);
		}

		return NextResponse.json({
			flows: flows.map((f) => ({
				id: f.id,
				name: f.name,
				isActive: f.isActive,
				isCampaign: f.isCampaign,
				nodeCount: f._count.nodes,
				intents: intentsByFlow.get(f.id) ?? [],
			})),
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Erro ao buscar flows", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
