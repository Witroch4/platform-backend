// app/api/admin/leads/route.ts
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LeadSource, Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET - Lista leads usando o modelo unificado com filtros e paginação
 * Suporta filtros por source, busca por texto, paginação e ordenação
 */
export async function GET(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);

		// Parâmetros de paginação
		const page = Number.parseInt(searchParams.get("page") || "1");
		const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20"), 100); // Max 100 items
		const skip = (page - 1) * limit;

		// Parâmetros de filtro
		const source = searchParams.get("source") as LeadSource | null;
		const search = searchParams.get("search") || "";
		const tags = searchParams.get("tags")?.split(",").filter(Boolean) || [];

		// Parâmetros de ordenação
		const sortBy = searchParams.get("sortBy") || "createdAt";
		const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

		// Construir condições de filtro
                const whereConditions: Prisma.LeadWhereInput = {
                        userId: session.user.id,
                };

		// Filtro por source
		if (source && Object.values(LeadSource).includes(source)) {
			whereConditions.source = source;
		}

		// Filtro por tags
		if (tags.length > 0) {
			whereConditions.tags = {
				hasSome: tags,
			};
		}

		// Filtro de busca por texto (nome, email, telefone)
		if (search.trim()) {
			whereConditions.OR = [
				{ name: { contains: search, mode: "insensitive" } },
				{ email: { contains: search, mode: "insensitive" } },
				{ phone: { contains: search, mode: "insensitive" } },
			];
		}

		// Validar campo de ordenação
		const validSortFields = ["createdAt", "updatedAt", "name", "email", "phone"];
		const orderBy = validSortFields.includes(sortBy) ? { [sortBy]: sortOrder as Prisma.SortOrder } : { createdAt: "desc" as Prisma.SortOrder };

		console.log(
			`[Leads API] Buscando leads - Página: ${page}, Limite: ${limit}, Source: ${source}, Busca: "${search}"`,
		);

		// Buscar leads com dados relacionados
		const [leadsData, total] = await Promise.all([
			prisma.lead.findMany({
				where: whereConditions,
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
				orderBy,
				skip,
				take: limit,
			}),
			prisma.lead.count({ where: whereConditions }),
		]);

		// Formatar resposta
		const formattedLeads = leadsData.map((lead) => ({
			id: lead.id,
			name: lead.name,
			email: lead.email,
			phone: lead.phone,
			avatarUrl: lead.avatarUrl,
			source: lead.source,
			sourceIdentifier: lead.sourceIdentifier,
			tags: lead.tags,
			createdAt: lead.createdAt,
			updatedAt: lead.updatedAt,
			user: lead.user,
			account: lead.account,
			// Dados específicos por source
			instagramProfile: lead.instagramProfile,
			oabData: lead.oabData,
			// Contadores
			stats: {
				chatsCount: lead._count.chats,
				automacoesCount: lead._count.automacoes,
                                disparosCount: lead._count?.disparos ?? 0,
			},
		}));

		// Calcular metadados de paginação
		const totalPages = Math.ceil(total / limit);
		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		return NextResponse.json({
			leads: formattedLeads,
			pagination: {
				page,
				limit,
				total,
				totalPages,
				hasNextPage,
				hasPrevPage,
			},
			filters: {
				source,
				search,
				tags,
				sortBy,
				sortOrder,
			},
		});
	} catch (error) {
		console.error("[Leads API] Erro ao buscar leads:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * POST - Cria um novo lead usando o modelo unificado
 */
export async function POST(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const {
			name,
			email,
			phone,
			avatarUrl,
			source,
			sourceIdentifier,
			tags = [],
			accountId,
			// Dados específicos por source
			instagramProfile,
			oabData,
		} = body;

		// Validações básicas
		if (!source || !Object.values(LeadSource).includes(source)) {
			return NextResponse.json({ error: "Source é obrigatório e deve ser válido" }, { status: 400 });
		}

		if (!sourceIdentifier) {
			return NextResponse.json({ error: "sourceIdentifier é obrigatório" }, { status: 400 });
		}

		// Verificar se já existe um lead com o mesmo source e sourceIdentifier
		const existingLead = await prisma.lead.findFirst({
			where: {
				source,
				sourceIdentifier,
				userId: session.user.id,
				accountId: accountId || null,
			},
		});

		if (existingLead) {
			return NextResponse.json({ error: "Já existe um lead com este identificador para esta fonte" }, { status: 409 });
		}

		// Criar lead com dados relacionados
                const leadData: Prisma.LeadCreateInput = {
                        name,
                        email,
                        phone,
			avatarUrl,
			source,
			sourceIdentifier,
			tags,
			user: { connect: { id: session.user.id } },
			account: accountId ? { connect: { id: accountId } } : undefined,
		};

		// Adicionar dados específicos por source
		if (source === LeadSource.INSTAGRAM && instagramProfile) {
			leadData.instagramProfile = {
				create: {
					isFollower: instagramProfile.isFollower || false,
					lastMessageAt: instagramProfile.lastMessageAt ? new Date(instagramProfile.lastMessageAt) : null,
					isOnline: instagramProfile.isOnline || false,
				},
			};
		}

		if (source === LeadSource.CHATWIT_OAB && oabData) {
			leadData.oabData = {
				create: {
					usuarioChatwitId: oabData.usuarioChatwitId,
					concluido: oabData.concluido || false,
					anotacoes: oabData.anotacoes,
					seccional: oabData.seccional,
					areaJuridica: oabData.areaJuridica,
					especialidade: oabData.especialidade,
					inscricao: oabData.inscricao,
					situacao: oabData.situacao,
					notaFinal: oabData.notaFinal,
				},
			};
		}

		const newLead = await prisma.lead.create({
			data: leadData,
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
			},
		});

		console.log(`[Leads API] Lead criado com sucesso: ${newLead.id} (${source})`);

		return NextResponse.json(newLead, { status: 201 });
	} catch (error) {
		console.error("[Leads API] Erro ao criar lead:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
