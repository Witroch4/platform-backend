// app/api/admin/leads/merge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { LeadSource } from "@prisma/client";

/**
 * POST - Mescla dois leads, mantendo o principal e transferindo dados do secundário
 */
export async function POST(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const { primaryLeadId, secondaryLeadId, mergeStrategy = "keep_primary" } = body;

		if (!primaryLeadId || !secondaryLeadId) {
			return NextResponse.json({ error: "IDs dos leads são obrigatórios" }, { status: 400 });
		}

		if (primaryLeadId === secondaryLeadId) {
			return NextResponse.json({ error: "Não é possível mesclar um lead com ele mesmo" }, { status: 400 });
		}

		// Buscar ambos os leads com todos os dados
		const [primaryLead, secondaryLead] = await Promise.all([
			prisma.lead.findFirst({
				where: {
					id: primaryLeadId,
					userId: session.user.id,
				},
				include: {
					instagramProfile: true,
					oabData: true,
					automacoes: true,
					chats: {
						include: {
							messages: true,
						},
					},
					disparos: true,
				},
			}),
			prisma.lead.findFirst({
				where: {
					id: secondaryLeadId,
					userId: session.user.id,
				},
				include: {
					instagramProfile: true,
					oabData: true,
					automacoes: true,
					chats: {
						include: {
							messages: true,
						},
					},
					disparos: true,
				},
			}),
		]);

		if (!primaryLead || !secondaryLead) {
			return NextResponse.json({ error: "Um ou ambos os leads não foram encontrados" }, { status: 404 });
		}

		// Verificar se os leads podem ser mesclados (mesmo source)
		if (primaryLead.source !== secondaryLead.source) {
			return NextResponse.json({ error: "Não é possível mesclar leads de fontes diferentes" }, { status: 400 });
		}

		console.log(`[Lead Merge API] Iniciando mesclagem: ${primaryLeadId} <- ${secondaryLeadId}`);

		// Executar mesclagem em transação
		const result = await prisma.$transaction(async (tx) => {
			// 1. Preparar dados para atualização do lead principal
			const updateData: any = {};

			if (mergeStrategy === "merge_data") {
				// Mesclar dados não vazios do lead secundário
				if (!primaryLead.name && secondaryLead.name) updateData.name = secondaryLead.name;
				if (!primaryLead.email && secondaryLead.email) updateData.email = secondaryLead.email;
				if (!primaryLead.phone && secondaryLead.phone) updateData.phone = secondaryLead.phone;
				if (!primaryLead.avatarUrl && secondaryLead.avatarUrl) updateData.avatarUrl = secondaryLead.avatarUrl;

				// Mesclar tags
				const mergedTags = Array.from(new Set([...primaryLead.tags, ...secondaryLead.tags]));
				if (mergedTags.length > primaryLead.tags.length) {
					updateData.tags = mergedTags;
				}
			}

			// 2. Transferir relacionamentos do lead secundário para o principal

			// Transferir automações
			if (secondaryLead.automacoes.length > 0) {
				await tx.leadAutomacao.updateMany({
					where: { leadId: secondaryLeadId },
					data: { leadId: primaryLeadId },
				});
			}

			// Transferir chats e mensagens
			if (secondaryLead.chats.length > 0) {
				await tx.chat.updateMany({
					where: { leadId: secondaryLeadId },
					data: { leadId: primaryLeadId },
				});
			}

			// Transferir disparos
			if (secondaryLead.disparos.length > 0) {
				await tx.disparoMtfDiamante.updateMany({
					where: { leadId: secondaryLeadId },
					data: { leadId: primaryLeadId },
				});
			}

			// 3. Mesclar dados específicos por source
			if (primaryLead.source === LeadSource.INSTAGRAM) {
				if (secondaryLead.instagramProfile && !primaryLead.instagramProfile) {
					// Transferir perfil do Instagram
					await tx.leadInstagramProfile.update({
						where: { leadId: secondaryLeadId },
						data: { leadId: primaryLeadId },
					});
				} else if (secondaryLead.instagramProfile && primaryLead.instagramProfile && mergeStrategy === "merge_data") {
					// Mesclar dados do perfil
					const profileUpdateData: any = {};
					if (
						secondaryLead.instagramProfile.lastMessageAt &&
						(!primaryLead.instagramProfile.lastMessageAt ||
							secondaryLead.instagramProfile.lastMessageAt > primaryLead.instagramProfile.lastMessageAt)
					) {
						profileUpdateData.lastMessageAt = secondaryLead.instagramProfile.lastMessageAt;
					}
					if (secondaryLead.instagramProfile.isFollower && !primaryLead.instagramProfile.isFollower) {
						profileUpdateData.isFollower = true;
					}

					if (Object.keys(profileUpdateData).length > 0) {
						await tx.leadInstagramProfile.update({
							where: { leadId: primaryLeadId },
							data: profileUpdateData,
						});
					}
				}
			}

			if (primaryLead.source === LeadSource.CHATWIT_OAB) {
				if (secondaryLead.oabData && !primaryLead.oabData) {
					// Transferir dados OAB
					await tx.leadOabData.update({
						where: { leadId: secondaryLeadId },
						data: { leadId: primaryLeadId },
					});
				} else if (secondaryLead.oabData && primaryLead.oabData && mergeStrategy === "merge_data") {
					// Mesclar dados OAB (manter dados mais completos)
					const oabUpdateData: any = {};
					if (!primaryLead.oabData.anotacoes && secondaryLead.oabData.anotacoes) {
						oabUpdateData.anotacoes = secondaryLead.oabData.anotacoes;
					}
					if (!primaryLead.oabData.notaFinal && secondaryLead.oabData.notaFinal) {
						oabUpdateData.notaFinal = secondaryLead.oabData.notaFinal;
					}
					if (!primaryLead.oabData.seccional && secondaryLead.oabData.seccional) {
						oabUpdateData.seccional = secondaryLead.oabData.seccional;
					}

					if (Object.keys(oabUpdateData).length > 0) {
						await tx.leadOabData.update({
							where: { leadId: primaryLeadId },
							data: oabUpdateData,
						});
					}
				}
			}

			// 4. Atualizar lead principal se necessário
			if (Object.keys(updateData).length > 0) {
				await tx.lead.update({
					where: { id: primaryLeadId },
					data: updateData,
				});
			}

			// 5. Remover lead secundário
			await tx.lead.delete({
				where: { id: secondaryLeadId },
			});

			// 6. Buscar lead mesclado final
			return await tx.lead.findUnique({
				where: { id: primaryLeadId },
				include: {
					user: {
						select: { id: true, name: true, email: true },
					},
					account: {
						select: { id: true, provider: true },
					},
					instagramProfile: true,
					oabData: {
						select: {
							id: true,
							concluido: true,
							anotacoes: true,
							seccional: true,
							areaJuridica: true,
							notaFinal: true,
							situacao: true,
							inscricao: true,
							especialidade: true,
						},
					},
					_count: {
						select: {
							chats: true,
							automacoes: true,
							disparos: true,
						},
					},
				},
			});
		});

		console.log(`[Lead Merge API] Mesclagem concluída: ${primaryLeadId} <- ${secondaryLeadId}`);

		return NextResponse.json({
			message: "Leads mesclados com sucesso",
			mergedLead: result,
			mergeStrategy,
			transferredData: {
				automacoes: secondaryLead.automacoes.length,
				chats: secondaryLead.chats.length,
				disparos: secondaryLead.disparos.length,
			},
		});
	} catch (error) {
		console.error("[Lead Merge API] Erro ao mesclar leads:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * GET - Busca leads duplicados potenciais baseados em critérios
 */
export async function GET(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const source = searchParams.get("source") as LeadSource | null;
		const criteria = searchParams.get("criteria") || "phone"; // phone, email, name

		// Construir condições de busca
		const whereConditions: any = {
			userId: session.user.id,
		};

		if (source && Object.values(LeadSource).includes(source)) {
			whereConditions.source = source;
		}

		// Buscar leads agrupados por critério de duplicação
		let duplicateGroups: any[] = [];

		if (criteria === "phone") {
			// Buscar leads com mesmo telefone
			const leadsWithPhone = await prisma.lead.findMany({
				where: {
					...whereConditions,
					phone: { not: null },
				},
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					source: true,
					sourceIdentifier: true,
					createdAt: true,
					_count: {
						select: {
							chats: true,
							automacoes: true,
							disparos: true,
						},
					},
				},
			});

			// Agrupar por telefone
			const phoneGroups = leadsWithPhone.reduce((groups: any, lead) => {
				const cleanPhone = lead.phone?.replace(/\D/g, "") || "";
				if (cleanPhone.length >= 10) {
					const key = cleanPhone.slice(-11); // Últimos 11 dígitos
					if (!groups[key]) groups[key] = [];
					groups[key].push(lead);
				}
				return groups;
			}, {});

			duplicateGroups = Object.entries(phoneGroups)
				.filter(([_, leads]: [string, any]) => leads.length > 1)
				.map(([phone, leads]: [string, any]) => ({
					criteria: "phone",
					value: phone,
					leads,
					count: leads.length,
				}));
		}

		if (criteria === "email") {
			// Buscar leads com mesmo email
			const leadsWithEmail = await prisma.lead.findMany({
				where: {
					...whereConditions,
					email: { not: null },
				},
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					source: true,
					sourceIdentifier: true,
					createdAt: true,
					_count: {
						select: {
							chats: true,
							automacoes: true,
							disparos: true,
						},
					},
				},
			});

			// Agrupar por email
			const emailGroups = leadsWithEmail.reduce((groups: any, lead) => {
				const email = lead.email?.toLowerCase() || "";
				if (email) {
					if (!groups[email]) groups[email] = [];
					groups[email].push(lead);
				}
				return groups;
			}, {});

			duplicateGroups = Object.entries(emailGroups)
				.filter(([_, leads]: [string, any]) => leads.length > 1)
				.map(([email, leads]: [string, any]) => ({
					criteria: "email",
					value: email,
					leads,
					count: leads.length,
				}));
		}

		console.log(`[Lead Merge API] Encontrados ${duplicateGroups.length} grupos de duplicatas por ${criteria}`);

		return NextResponse.json({
			duplicateGroups,
			criteria,
			source,
			totalGroups: duplicateGroups.length,
			totalDuplicates: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
		});
	} catch (error) {
		console.error("[Lead Merge API] Erro ao buscar duplicatas:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
