import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { auth } from "@/auth";

/**
 * GET - Lista todos os leads ou filtra por parâmetros
 */
export async function GET(request: Request): Promise<Response> {
	try {
		// Verificar autenticação
		const session = await auth();

		if (!session || !session.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const url = new URL(request.url);
		const leadId = url.searchParams.get("id");
		const usuarioId = url.searchParams.get("usuarioId");
		const searchTerm = url.searchParams.get("search");
		const page = Number.parseInt(url.searchParams.get("page") || "1");
		const limit = Number.parseInt(url.searchParams.get("limit") || "10");
		const skip = (page - 1) * limit;

		// Parâmetros específicos para marketing
		const marketingMode = url.searchParams.get("marketing") === "true";
		const fezRecurso = url.searchParams.get("fezRecurso") === "true";
		const semRecurso = url.searchParams.get("semRecurso") === "true";
		const concluidoFilter = url.searchParams.get("concluido") === "true";
		const updatedAfterParam = url.searchParams.get("updatedAfter");
	const updatedBeforeParam = url.searchParams.get("updatedBefore");
		const onlyWithPhone = url.searchParams.get("onlyWithPhone") === "true";

		// Se um ID específico foi fornecido, buscar apenas esse lead
		if (leadId) {
			const lead = await prisma.leadOabData.findFirst({
				where: {
					id: leadId,
				},
				include: {
					lead: true,
					usuarioChatwit: {
						select: {
							name: true,
							channel: true,
						},
					},
					arquivos: {
						select: {
							id: true,
							fileType: true,
							dataUrl: true,
							pdfConvertido: true,
							createdAt: true,
						},
					},
				},
			});

			if (!lead) {
				console.log("[API Leads] Lead não encontrado para ID:", leadId);
				return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
			}

			if (!lead.lead) {
				console.log("[API Leads] Lead sem dados de relacionamento para ID:", leadId, lead);
				return NextResponse.json({ error: "Dados do lead inválidos" }, { status: 404 });
			}

			if (!lead.lead.name) {
				console.log("[API Leads] Lead sem nome para ID:", leadId, lead.lead);
				return NextResponse.json({ error: "Nome do lead não encontrado" }, { status: 404 });
			}

			console.log("[API Leads] Lead encontrado com sucesso:", lead.id, lead.lead.name);
			return NextResponse.json(lead);
		}

		// Lista de nomes de bots do sistema que devem ser excluídos da listagem
		const SYSTEM_BOT_NAMES = [
			"socialwise bot",
			"socialwisebot",
			"chatwit bot",
			"chatwitbot",
			"bot socialwise",
			"bot chatwit",
		];

		// Construir a cláusula where baseada nos parâmetros
		const where: any = marketingMode ? { AND: [] } : {};

		// Excluir bots do sistema da listagem
		const botExclusionFilter = {
			NOT: {
				OR: SYSTEM_BOT_NAMES.map((botName) => ({
					lead: {
						name: {
							contains: botName,
							mode: "insensitive" as const,
						},
					},
				})),
			},
		};

		if (marketingMode) {
			where.AND.push(botExclusionFilter);
		} else {
			where.NOT = botExclusionFilter.NOT;
		}

		// Garantir que o usuário exista no banco (após reset pode não existir)
		let currentUser = await prisma.user.findUnique({
			where: { id: session.user.id },
			select: { role: true, id: true },
		});
		if (!currentUser) {
			const email = (session.user as any)?.email as string | undefined;
			const name = session.user.name || undefined;
			const syntheticEmail = `${session.user.id}@local.invalid`;
			await prisma.user.create({
				data: {
					id: session.user.id,
					email: email || syntheticEmail,
					name,
				},
			});
			currentUser = await prisma.user.findUnique({
				where: { id: session.user.id },
				select: { role: true, id: true },
			});
		}

		// Buscar o usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			select: { chatwitAccessToken: true },
		});

		// Controle de acesso baseado em role
		if (currentUser!.role !== "SUPERADMIN") {
			if (usuarioChatwit?.chatwitAccessToken) {
				// Para usuários não-SUPERADMIN, filtrar apenas leads do próprio usuário
				const userFilter = {
					usuarioChatwit: {
						appUserId: session.user.id,
					},
				};

				if (marketingMode) {
					where.AND.push(userFilter);
				} else {
					where.usuarioChatwit = {
						appUserId: session.user.id,
					};
				}
			} else {
				// Se o usuário não tem token, não pode ver nenhum lead
				return NextResponse.json({
					leads: [],
					pagination: {
						total: 0,
						page,
						limit,
						totalPages: 0,
					},
				});
			}
		}

		// Filtros específicos para marketing
		if (marketingMode || onlyWithPhone) {
			const phoneFilters = [
				{
					lead: {
						phone: {
							not: null,
						},
					},
				},
				{
					lead: {
						phone: {
							not: "",
						},
					},
				},
			];

			if (marketingMode) {
				where.AND.push(...phoneFilters);
			} else {
				where.AND = where.AND || [];
				where.AND.push(...phoneFilters);
			}
		}

		// Filtro por recurso
		if (fezRecurso) {
			const recursoFilter = { fezRecurso: true };
			if (marketingMode) {
				where.AND.push(recursoFilter);
			} else {
				where.fezRecurso = true;
			}
		}

		// Filtro sem recurso
		if (semRecurso) {
			const semRecursoFilter = { fezRecurso: false };
			if (marketingMode) {
				where.AND.push(semRecursoFilter);
			} else {
				where.fezRecurso = false;
			}
		}

		// Filtro por concluido
		if (concluidoFilter) {
			const cf = { concluido: true };
			if (marketingMode) {
				where.AND.push(cf);
			} else {
				where.concluido = true;
			}
		}

		// Filtro por data de atualizacao
		if (updatedAfterParam) {
			try {
				const updatedAfterDate = new Date(updatedAfterParam);
				const dateFilter = { lead: { updatedAt: { gte: updatedAfterDate } } };
				if (marketingMode) {
					where.AND.push(dateFilter);
				} else {
					where.lead = { ...((where.lead as any) ?? {}), updatedAt: { gte: updatedAfterDate } };
				}
			} catch {
				// ignora data invalida
			}
		}

		if (updatedBeforeParam) {
			try {
				const updatedBeforeDate = new Date(updatedBeforeParam);
				const dateFilter = { lead: { updatedAt: { lte: updatedBeforeDate } } };
				if (marketingMode) {
					where.AND.push(dateFilter);
				} else {
					const existingLead = (where.lead as any) ?? {};
					where.lead = { ...existingLead, updatedAt: { ...(existingLead.updatedAt ?? {}), lte: updatedBeforeDate } };
				}
			} catch {
				// ignora data invalida
			}
		}

		if (usuarioId) {
			const usuarioFilter = { usuarioChatwitId: usuarioId };
			if (marketingMode) {
				where.AND.push(usuarioFilter);
			} else {
				where.usuarioChatwitId = usuarioId;
			}
		}

		if (searchTerm) {
			// Remover caracteres especiais do termo de busca para melhor matching com telefones
			const cleanedSearchTerm = searchTerm.replace(/[^\w@.-]/g, "");

			const searchFilter = {
				OR: [
					{
						lead: {
							name: {
								contains: searchTerm,
								mode: "insensitive",
							},
						},
					},
					{
						nomeReal: {
							contains: searchTerm,
							mode: "insensitive",
						},
					},
					{
						lead: {
							phone: {
								contains: searchTerm,
								mode: "insensitive",
							},
						},
					},
					// Busca adicional por telefone sem formatação (números apenas)
					...(cleanedSearchTerm !== searchTerm
						? [
								{
									lead: {
										phone: {
											contains: cleanedSearchTerm,
											mode: "insensitive",
										},
									},
								},
							]
						: []),
					{
						lead: {
							email: {
								contains: searchTerm,
								mode: "insensitive",
							},
						},
					},
					// Busca por ID do lead (útil para buscar por IDs completos)
					{
						id: {
							contains: searchTerm,
							mode: "insensitive",
						},
					},
					{
						leadId: {
							contains: searchTerm,
							mode: "insensitive",
						},
					},
				],
			};

			if (marketingMode) {
				where.AND.push(searchFilter);
			} else {
				where.OR = searchFilter.OR;
			}
		}

		// Buscar os leads e a contagem total
		const [leads, total] = await Promise.all([
			prisma.leadOabData.findMany({
				where: {
					...where,
				},
				skip,
				take: limit,
				// Ordenar por updatedAt para que leads recentemente atualizados (com novos arquivos, etc.) apareçam primeiro
				orderBy: { lead: { updatedAt: "desc" } },
				include: {
					lead: true,
					usuarioChatwit: {
						select: {
							name: true,
							channel: true,
						},
					},
					arquivos: {
						select: {
							id: true,
							fileType: true,
							dataUrl: true,
							pdfConvertido: true,
							createdAt: true,
						},
					},
				},
			}),
			prisma.leadOabData.count({
				where: {
					...where,
				},
			}),
		]);

		// Debug: Log dos dados dos leads
		console.log("[API Leads] Debug - Primeiros 3 leads encontrados:");
		leads.slice(0, 3).forEach((lead, index) => {
			console.log(`[API Leads] Lead ${index + 1}:`, {
				id: lead.id,
				leadId: lead.leadId,
				leadData: lead.lead
					? {
							id: lead.lead.id,
							name: lead.lead.name,
							email: lead.lead.email,
							phone: lead.lead.phone,
						}
					: "NULL",
				nomeReal: lead.nomeReal ?? null,
			});
		});

		// Transformar os dados para o formato esperado pelo frontend
		const transformedLeads = leads.map((lead) => {
			const leadData = lead.lead;

			// Garantir que nomeReal não seja 'undefined' como string
			const nomeRealProcessed =
				lead.nomeReal === "undefined" || !lead.nomeReal ? leadData?.name || "Nome não informado" : lead.nomeReal;

			const baseData = {
				id: lead.id,
				sourceId: lead.leadId, // ID do lead original
				name: leadData?.name || null,
				nomeReal: nomeRealProcessed,
				phoneNumber: leadData?.phone || null,
				email: leadData?.email || null,
				thumbnail: leadData?.avatarUrl || null,
				concluido: lead.concluido || false,
				fezRecurso: lead.fezRecurso || false,
				createdAt: leadData?.createdAt,
				updatedAt: leadData?.updatedAt,
				usuarioId: lead.usuarioChatwitId,
				usuario: lead.usuarioChatwit
					? {
							id: lead.usuarioChatwitId,
							name: lead.usuarioChatwit.name,
							email: lead.usuarioChatwit.name, // Usando name como fallback
							channel: lead.usuarioChatwit.channel,
						}
					: null,
			};

			// Se for modo marketing, retornar dados simplificados
			if (marketingMode) {
				return {
					...baseData,
					// Adicionar leadData para compatibilidade com o frontend de marketing
					leadData: {
						id: leadData?.id || lead.leadId,
						name: leadData?.name || "Nome não informado",
						email: leadData?.email || null,
						phone: leadData?.phone || null,
					},
				};
			}

			// Modo completo com todos os dados
			return {
				...baseData,
				anotacoes: lead.anotacoes || null,
				pdfUnificado: lead.pdfUnificado || null,
				imagensConvertidas: lead.imagensConvertidas || null,
				leadUrl: lead.leadUrl || null,
				datasRecurso: lead.datasRecurso || null,
				provaManuscrita: lead.provaManuscrita || null,
				manuscritoProcessado: lead.manuscritoProcessado || false,
				aguardandoManuscrito: lead.aguardandoManuscrito || false,
				espelhoCorrecao: lead.espelhoCorrecao || null,
				textoDOEspelho: lead.textoDOEspelho || null,
				analiseUrl: lead.analiseUrl || null,
				argumentacaoUrl: lead.argumentacaoUrl || null,
				analiseProcessada: lead.analiseProcessada || false,
				aguardandoAnalise: lead.aguardandoAnalise || false,
				analisePreliminar: lead.analisePreliminar || null,
				analiseValidada: lead.analiseValidada || false,
				consultoriaFase2: lead.consultoriaFase2 || false,
				seccional: lead.seccional || null,
				areaJuridica: lead.areaJuridica || null,
				notaFinal: lead.notaFinal || null,
				situacao: lead.situacao || null,
				inscricao: lead.inscricao || null,
				examesParticipados: lead.examesParticipados || null,
				// Campos de recurso
				recursoUrl: lead.recursoUrl || null,
				recursoPreliminar: lead.recursoPreliminar || null,
				aguardandoRecurso: lead.aguardandoRecurso || false,
				recursoValidado: lead.recursoValidado || false,
				recursoArgumentacaoUrl: lead.recursoArgumentacaoUrl || null,
				// Campos de espelho processamento
				espelhoProcessado: lead.espelhoProcessado || false,
				aguardandoEspelho: lead.aguardandoEspelho || false,
				// Campos de especialidade e espelho padrão
				especialidade: lead.especialidade || null,
				espelhoPadraoId: lead.espelhoPadraoId || null,
				arquivos: lead.arquivos || [],
			};
		});

		// Filtrar leads que têm dados válidos
		const validLeads = transformedLeads.filter((lead) => {
			if (!lead.name && !lead.nomeReal) {
				console.log("[API Leads] Lead sem nome:", lead.id, {
					name: lead.name,
					nomeReal: lead.nomeReal,
				});
				return false;
			}
			return true;
		});

		console.log("[API Leads] Total de leads válidos:", validLeads.length, "de", transformedLeads.length);

		const response = {
			leads: validLeads,
			pagination: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			},
			// Adicionar success flag para compatibilidade com marketing mode
			...(marketingMode && { success: true }),
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("[API Leads] Erro ao listar leads:", error);
		return NextResponse.json({ error: "Erro interno ao listar leads" }, { status: 500 });
	}
}

/**
 * POST - Atualiza os dados de um lead
 */
export async function POST(request: Request): Promise<Response> {
	try {
		const session = await auth();
		if (!session || !session.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}
		const currentUser = await prisma.user.findUnique({
			where: { id: session.user.id },
			select: { role: true },
		});
		const {
			id,
			nomeReal,
			email,
			anotacoes,
			concluido,
			fezRecurso,
			datasRecurso,
			textoDOEspelho,
			espelhoCorrecao,
			// Campos de processamento
			pdfUnificado,
			imagensConvertidas,
			// Campos relacionados à análise
			analiseUrl,
			analiseProcessada,
			aguardandoAnalise,
			analisePreliminar,
			analiseValidada,
			consultoriaFase2,
			// Campos relacionados ao manuscrito
			aguardandoManuscrito,
			manuscritoProcessado,
			provaManuscrita,
			// Campos relacionados ao espelho
			aguardandoEspelho,
			espelhoProcessado,
		} = await request.json();

		// Valide os dados recebidos
		if (!id) {
			return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
		}

		console.log("[API Leads] Atualizando lead:", id, {
			...(pdfUnificado !== undefined && { pdfUnificado }),
			...(imagensConvertidas !== undefined && {
				imagensConvertidas:
					typeof imagensConvertidas === "string"
						? "[" + JSON.parse(imagensConvertidas).length + " imagens]"
						: "[array de imagens]",
			}),
			...(aguardandoAnalise !== undefined && { aguardandoAnalise }),
			...(analiseProcessada !== undefined && { analiseProcessada }),
			...(analiseUrl !== undefined && { analiseUrl }),
			...(analisePreliminar !== undefined && { analisePreliminar: "Presente" }),
			...(analiseValidada !== undefined && { analiseValidada }),
			...(consultoriaFase2 !== undefined && { consultoriaFase2 }),
			...(aguardandoManuscrito !== undefined && { aguardandoManuscrito }),
			...(manuscritoProcessado !== undefined && { manuscritoProcessado }),
			...(provaManuscrita !== undefined && { provaManuscrita: "Presente" }),
			...(aguardandoEspelho !== undefined && { aguardandoEspelho }),
			...(espelhoProcessado !== undefined && { espelhoProcessado }),
		});

		// Verificar quais campos foram enviados e montar o objeto de update
		const updateData: any = {};

		if (nomeReal !== undefined) updateData.nomeReal = nomeReal;
		if (anotacoes !== undefined) updateData.anotacoes = anotacoes;
		if (concluido !== undefined) updateData.concluido = concluido;
		if (fezRecurso !== undefined) updateData.fezRecurso = fezRecurso;
		if (datasRecurso !== undefined) updateData.datasRecurso = datasRecurso;
		if (textoDOEspelho !== undefined) updateData.textoDOEspelho = textoDOEspelho;
		if (espelhoCorrecao !== undefined) updateData.espelhoCorrecao = espelhoCorrecao;
		if (pdfUnificado !== undefined) updateData.pdfUnificado = pdfUnificado;
		if (imagensConvertidas !== undefined) updateData.imagensConvertidas = imagensConvertidas;
		if (analiseUrl !== undefined) updateData.analiseUrl = analiseUrl;
		if (analiseProcessada !== undefined) updateData.analiseProcessada = analiseProcessada;
		if (aguardandoAnalise !== undefined) updateData.aguardandoAnalise = aguardandoAnalise;
		if (analisePreliminar !== undefined) updateData.analisePreliminar = analisePreliminar;
		if (analiseValidada !== undefined) updateData.analiseValidada = analiseValidada;
		if (consultoriaFase2 !== undefined) updateData.consultoriaFase2 = consultoriaFase2;
		if (aguardandoManuscrito !== undefined) updateData.aguardandoManuscrito = aguardandoManuscrito;
		if (manuscritoProcessado !== undefined) updateData.manuscritoProcessado = manuscritoProcessado;
		if (provaManuscrita !== undefined) updateData.provaManuscrita = provaManuscrita;
		if (aguardandoEspelho !== undefined) updateData.aguardandoEspelho = aguardandoEspelho;
		if (espelhoProcessado !== undefined) updateData.espelhoProcessado = espelhoProcessado;

		// Verificação de ownership
		const whereClause: any = { id };
		if (currentUser!.role !== "SUPERADMIN") {
			whereClause.usuarioChatwit = { appUserId: session.user.id };
		}
		// Atualize o lead
		const lead = await prisma.leadOabData.update({
			where: whereClause,
			data: updateData,
		});

		// Se houver campos para atualizar no modelo Lead, faça isso separadamente
		if (email !== undefined) {
			const leadUpdateData: any = {};
			if (email !== undefined) leadUpdateData.email = email;

			await prisma.lead.update({
				where: { id: lead.leadId },
				data: leadUpdateData,
			});
		}

		return NextResponse.json({
			success: true,
			lead,
		});
	} catch (error) {
		console.error("[API Leads] Erro ao atualizar lead:", error);
		return NextResponse.json({ error: "Erro interno ao atualizar lead" }, { status: 500 });
	}
}

/**
 * DELETE - Remove um lead e todos os seus arquivos
 */
export async function DELETE(request: Request): Promise<Response> {
	try {
		const session = await auth();
		if (!session || !session.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}
		const currentUser = await prisma.user.findUnique({
			where: { id: session.user.id },
			select: { role: true },
		});
		const url = new URL(request.url);
		const id = url.searchParams.get("id");

		if (!id) {
			return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
		}

		// Verificação de ownership
		const whereClause: any = { id };
		if (currentUser!.role !== "SUPERADMIN") {
			whereClause.usuarioChatwit = { appUserId: session.user.id };
		}
		// Verifica se o lead existe e pertence ao usuário
		const leadToDelete = await prisma.leadOabData.findFirst({
			where: whereClause,
		});
		if (!leadToDelete) {
			return NextResponse.json({ error: "Lead não encontrado ou acesso negado" }, { status: 404 });
		}

		// Remova o lead (arquivos serão removidos em cascata)
		await prisma.leadOabData.delete({ where: { id: leadToDelete.id } });

		return NextResponse.json({
			success: true,
			message: "Lead removido com sucesso",
		});
	} catch (error) {
		console.error("[API Leads] Erro ao remover lead:", error);
		return NextResponse.json({ error: "Erro interno ao remover lead" }, { status: 500 });
	}
}
