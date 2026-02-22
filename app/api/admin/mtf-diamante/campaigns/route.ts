import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// =============================================================================
// VALIDATION
// =============================================================================

const CreateCampaignSchema = z.object({
	name: z.string().min(1, "Nome é obrigatório").max(100),
	flowId: z.string().min(1, "flowId é obrigatório"),
	inboxId: z.string().min(1, "inboxId é obrigatório"),
	rateLimit: z.number().int().min(1).max(100).optional(),
	variables: z.record(z.unknown()).optional(),
});

// =============================================================================
// GET — Listar campanhas por inboxId
// =============================================================================

export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const inboxId = searchParams.get("inboxId");
		const status = searchParams.get("status");

		if (!inboxId) {
			return NextResponse.json({ success: false, error: "inboxId é obrigatório" }, { status: 400 });
		}

		const prisma = getPrismaInstance();
		const campaigns = await prisma.flowCampaign.findMany({
			where: {
				inboxId,
				...(status ? { status: status as any } : {}),
			},
			include: {
				flow: { select: { name: true, isCampaign: true } },
				_count: { select: { contacts: true } },
			},
			orderBy: { createdAt: "desc" },
		});

		return NextResponse.json({
			success: true,
			data: campaigns.map((c) => ({
				id: c.id,
				name: c.name,
				flowId: c.flowId,
				flowName: c.flow.name,
				inboxId: c.inboxId,
				status: c.status,
				totalContacts: c.totalContacts,
				sentCount: c.sentCount,
				failedCount: c.failedCount,
				skippedCount: c.skippedCount,
				rateLimit: c.rateLimit,
				contactCount: c._count.contacts,
				scheduledAt: c.scheduledAt,
				startedAt: c.startedAt,
				completedAt: c.completedAt,
				createdAt: c.createdAt,
				updatedAt: c.updatedAt,
			})),
		});
	} catch (error) {
		console.error("[campaigns] GET error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}

// =============================================================================
// POST — Criar nova campanha (DRAFT)
// =============================================================================

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const body = await request.json();
		const validation = CreateCampaignSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{ success: false, error: "Dados inválidos", details: validation.error.flatten() },
				{ status: 400 },
			);
		}

		const { name, flowId, inboxId, rateLimit, variables } = validation.data;
		const prisma = getPrismaInstance();

		// Validar que o flow existe, é de campanha, e está ativo
		const flow = await prisma.flow.findUnique({
			where: { id: flowId },
			select: { id: true, isCampaign: true, isActive: true, inboxId: true },
		});

		if (!flow) {
			return NextResponse.json({ success: false, error: "Flow não encontrado" }, { status: 404 });
		}
		if (!flow.isCampaign) {
			return NextResponse.json(
				{ success: false, error: "Este flow não é de campanha. Apenas flows de campanha podem ser usados." },
				{ status: 400 },
			);
		}
		if (!flow.isActive) {
			return NextResponse.json({ success: false, error: "O flow está desativado" }, { status: 400 });
		}
		if (flow.inboxId !== inboxId) {
			return NextResponse.json({ success: false, error: "Flow não pertence a esta inbox" }, { status: 400 });
		}

		const campaign = await prisma.flowCampaign.create({
			data: {
				name,
				flowId,
				inboxId,
				status: "DRAFT",
				rateLimit: rateLimit ?? 30,
				variables: (variables ?? {}) as Prisma.InputJsonValue,
			},
		});

		return NextResponse.json({
			success: true,
			data: {
				id: campaign.id,
				name: campaign.name,
				flowId: campaign.flowId,
				inboxId: campaign.inboxId,
				status: campaign.status,
				rateLimit: campaign.rateLimit,
				createdAt: campaign.createdAt,
			},
			message: "Campanha criada com sucesso",
		});
	} catch (error) {
		console.error("[campaigns] POST error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}
