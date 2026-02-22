import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
	startCampaign,
	pauseCampaign,
	resumeCampaign,
	cancelCampaign,
} from "@/lib/queue/campaign-orchestrator";

// =============================================================================
// VALIDATION
// =============================================================================

const ActionSchema = z.object({
	action: z.enum(["start", "pause", "resume", "cancel"]),
});

const UpdateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	rateLimit: z.number().int().min(1).max(100).optional(),
	variables: z.record(z.unknown()).optional(),
});

// =============================================================================
// GET — Detalhes da campanha
// =============================================================================

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ campaignId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { campaignId } = await params;
		const prisma = getPrismaInstance();

		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			include: {
				flow: { select: { name: true, isCampaign: true } },
				contacts: {
					select: {
						id: true,
						contactId: true,
						contactPhone: true,
						contactName: true,
						status: true,
						sentAt: true,
						errorMessage: true,
						retryCount: true,
					},
					orderBy: { id: "desc" },
					take: 200,
				},
				_count: { select: { contacts: true } },
			},
		});

		if (!campaign) {
			return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
		}

		return NextResponse.json({
			success: true,
			data: {
				id: campaign.id,
				name: campaign.name,
				flowId: campaign.flowId,
				flowName: campaign.flow.name,
				inboxId: campaign.inboxId,
				status: campaign.status,
				totalContacts: campaign.totalContacts,
				sentCount: campaign.sentCount,
				failedCount: campaign.failedCount,
				skippedCount: campaign.skippedCount,
				rateLimit: campaign.rateLimit,
				variables: campaign.variables,
				contactCount: campaign._count.contacts,
				contacts: campaign.contacts,
				scheduledAt: campaign.scheduledAt,
				startedAt: campaign.startedAt,
				completedAt: campaign.completedAt,
				createdAt: campaign.createdAt,
				updatedAt: campaign.updatedAt,
			},
		});
	} catch (error) {
		console.error("[campaigns/id] GET error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}

// =============================================================================
// PATCH — Atualizar campanha (só DRAFT)
// =============================================================================

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ campaignId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { campaignId } = await params;
		const body = await request.json();
		const validation = UpdateSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{ success: false, error: "Dados inválidos", details: validation.error.flatten() },
				{ status: 400 },
			);
		}

		const prisma = getPrismaInstance();
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});

		if (!campaign) {
			return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
		}
		if (campaign.status !== "DRAFT") {
			return NextResponse.json(
				{ success: false, error: "Só é possível editar campanhas em rascunho" },
				{ status: 400 },
			);
		}

		const updateData: Prisma.FlowCampaignUpdateInput = {
			...(validation.data.name ? { name: validation.data.name } : {}),
			...(validation.data.rateLimit !== undefined ? { rateLimit: validation.data.rateLimit } : {}),
			...(validation.data.variables !== undefined ? { variables: validation.data.variables as Prisma.InputJsonValue } : {}),
		};

		const updated = await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: updateData,
		});

		return NextResponse.json({ success: true, data: updated });
	} catch (error) {
		console.error("[campaigns/id] PATCH error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}

// =============================================================================
// DELETE — Deletar campanha (só DRAFT ou CANCELLED)
// =============================================================================

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ campaignId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { campaignId } = await params;
		const prisma = getPrismaInstance();

		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});

		if (!campaign) {
			return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
		}
		if (campaign.status !== "DRAFT" && campaign.status !== "CANCELLED") {
			return NextResponse.json(
				{ success: false, error: "Só é possível excluir campanhas em rascunho ou canceladas" },
				{ status: 400 },
			);
		}

		// Deletar contatos primeiro, depois campanha
		await prisma.flowCampaignContact.deleteMany({ where: { campaignId } });
		await prisma.flowCampaign.delete({ where: { id: campaignId } });

		return NextResponse.json({ success: true, message: "Campanha excluída" });
	} catch (error) {
		console.error("[campaigns/id] DELETE error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}

// =============================================================================
// POST — Ações da campanha (start, pause, resume, cancel)
// =============================================================================

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ campaignId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { campaignId } = await params;
		const body = await request.json();
		const validation = ActionSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{ success: false, error: "Ação inválida. Use: start, pause, resume ou cancel." },
				{ status: 400 },
			);
		}

		const { action } = validation.data;

		switch (action) {
			case "start": {
				const result = await startCampaign({ campaignId });
				if (!result.success) {
					return NextResponse.json({ success: false, error: result.error }, { status: 400 });
				}
				return NextResponse.json({
					success: true,
					data: result,
					message: `Campanha iniciada com ${result.totalContacts} contatos em ${result.batchesCreated} lotes`,
				});
			}

			case "pause": {
				const ok = await pauseCampaign(campaignId);
				if (!ok) {
					return NextResponse.json(
						{ success: false, error: "Não foi possível pausar a campanha" },
						{ status: 400 },
					);
				}
				return NextResponse.json({ success: true, message: "Campanha pausada" });
			}

			case "resume": {
				const ok = await resumeCampaign(campaignId);
				if (!ok) {
					return NextResponse.json(
						{ success: false, error: "Não foi possível retomar a campanha" },
						{ status: 400 },
					);
				}
				return NextResponse.json({ success: true, message: "Campanha retomada" });
			}

			case "cancel": {
				const ok = await cancelCampaign(campaignId);
				if (!ok) {
					return NextResponse.json(
						{ success: false, error: "Não foi possível cancelar a campanha" },
						{ status: 400 },
					);
				}
				return NextResponse.json({ success: true, message: "Campanha cancelada" });
			}
		}
	} catch (error) {
		console.error("[campaigns/id] POST error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}
