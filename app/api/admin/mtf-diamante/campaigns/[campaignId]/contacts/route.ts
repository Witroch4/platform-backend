import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// =============================================================================
// VALIDATION
// =============================================================================

const AddContactsSchema = z.union([
	z.object({
		contacts: z.array(
			z.object({
				contactId: z.string().min(1),
				contactPhone: z.string().min(1, "Telefone é obrigatório"),
				contactName: z.string().optional().default(""),
				variables: z.record(z.unknown()).optional(),
			}),
		).min(1, "Pelo menos 1 contato é necessário"),
	}),
	z.object({
		selectAll: z.literal(true),
	}),
]);

const RemoveContactsSchema = z.object({
	contactIds: z.array(z.string().min(1)).min(1),
});

// =============================================================================
// GET — Listar contatos da campanha
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
		const { searchParams } = new URL(request.url);
		const status = searchParams.get("status");
		const page = Math.max(1, Number(searchParams.get("page")) || 1);
		const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

		const prisma = getPrismaInstance();

		const where = {
			campaignId,
			...(status ? { status: status as any } : {}),
		};

		const [contacts, total] = await Promise.all([
			prisma.flowCampaignContact.findMany({
				where,
				orderBy: { id: "desc" },
				skip: (page - 1) * limit,
				take: limit,
			}),
			prisma.flowCampaignContact.count({ where }),
		]);

		return NextResponse.json({
			success: true,
			data: contacts,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error("[campaigns/contacts] GET error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}

// =============================================================================
// POST — Adicionar contatos à campanha (só DRAFT)
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
		const validation = AddContactsSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{ success: false, error: "Dados inválidos", details: validation.error.flatten() },
				{ status: 400 },
			);
		}

		const prisma = getPrismaInstance();

		// Verificar que campanha está em DRAFT
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});
		if (!campaign) {
			return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
		}
		if (campaign.status !== "DRAFT") {
			return NextResponse.json(
				{ success: false, error: "Só é possível adicionar contatos a campanhas em rascunho" },
				{ status: 400 },
			);
		}

		// Buscar contatos já existentes para evitar duplicatas
		const existingPhones = new Set(
			(await prisma.flowCampaignContact.findMany({
				where: { campaignId },
				select: { contactPhone: true },
			})).map((c) => c.contactPhone),
		);

		let contactsToInsert: { contactId: string; contactPhone: string; contactName: string; variables: Prisma.InputJsonValue }[];
		let totalInput: number;

		if ("selectAll" in validation.data) {
			// Buscar todos os leads com telefone do banco
			const allLeads = await prisma.leadOabData.findMany({
				where: { lead: { phone: { not: null, notIn: [""] } } },
				select: {
					id: true,
					nomeReal: true,
					lead: { select: { phone: true, name: true } },
				},
			});
			totalInput = allLeads.length;
			contactsToInsert = allLeads
				.filter((l) => l.lead?.phone && !existingPhones.has(l.lead.phone))
				.map((l) => ({
					contactId: l.id,
					contactPhone: l.lead!.phone!,
					contactName: l.nomeReal || l.lead?.name || "",
					variables: {} as Prisma.InputJsonValue,
				}));
		} else {
			totalInput = validation.data.contacts.length;
			contactsToInsert = validation.data.contacts
				.filter((c) => !existingPhones.has(c.contactPhone))
				.map((c) => ({
					contactId: c.contactId,
					contactPhone: c.contactPhone,
					contactName: c.contactName || "",
					variables: (c.variables ?? {}) as Prisma.InputJsonValue,
				}));
		}

		if (contactsToInsert.length === 0) {
			return NextResponse.json({
				success: true,
				data: { added: 0, skipped: totalInput },
				message: "Todos os contatos já estão na campanha",
			});
		}

		await prisma.flowCampaignContact.createMany({
			data: contactsToInsert.map((c) => ({
				campaignId,
				contactId: c.contactId,
				contactPhone: c.contactPhone,
				contactName: c.contactName,
				status: "PENDING" as const,
				variables: c.variables,
			})),
		});

		return NextResponse.json({
			success: true,
			data: {
				added: contactsToInsert.length,
				skipped: totalInput - contactsToInsert.length,
			},
			message: `${contactsToInsert.length} contato(s) adicionado(s)`,
		});
	} catch (error) {
		console.error("[campaigns/contacts] POST error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}

// =============================================================================
// DELETE — Remover contatos da campanha (só DRAFT)
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
		const body = await request.json();
		const validation = RemoveContactsSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{ success: false, error: "contactIds é obrigatório" },
				{ status: 400 },
			);
		}

		const prisma = getPrismaInstance();

		// Verificar DRAFT
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});
		if (!campaign) {
			return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
		}
		if (campaign.status !== "DRAFT") {
			return NextResponse.json(
				{ success: false, error: "Só é possível remover contatos de campanhas em rascunho" },
				{ status: 400 },
			);
		}

		const result = await prisma.flowCampaignContact.deleteMany({
			where: {
				campaignId,
				id: { in: validation.data.contactIds },
			},
		});

		return NextResponse.json({
			success: true,
			data: { removed: result.count },
			message: `${result.count} contato(s) removido(s)`,
		});
	} catch (error) {
		console.error("[campaigns/contacts] DELETE error:", error);
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Erro interno" },
			{ status: 500 },
		);
	}
}
