import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { auth } from "@/auth";

/**
 * GET - Exporta todos os leads em formato CSV
 */
export async function GET(request: Request): Promise<Response> {
	try {
		// Verificar autenticação
		const session = await auth();

		if (!session || !session.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const url = new URL(request.url);
		const searchTerm = url.searchParams.get("search");

		// Construir a cláusula where baseada nos parâmetros
		const where: any = {};

		// Garantir que o usuário exista no banco
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
				where.usuarioChatwit = {
					appUserId: session.user.id,
				};
			} else {
				// Se o usuário não tem token, não pode ver nenhum lead
				return new Response("Nenhum lead disponível para exportação", {
					status: 404,
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
					},
				});
			}
		}

		if (searchTerm) {
			// Remover caracteres especiais do termo de busca para melhor matching com telefones
			const cleanedSearchTerm = searchTerm.replace(/[^\w@.-]/g, "");

			where.OR = [
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
			];
		}

		// Buscar todos os leads (sem paginação)
		const leads = await prisma.leadOabData.findMany({
			where,
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
		});

		// Função para escapar campos CSV
		const escapeCsv = (value: any): string => {
			if (value === null || value === undefined) return "";
			const str = String(value);
			// Se contém vírgula, aspas ou quebra de linha, envolver em aspas e escapar aspas duplas
			if (str.includes(",") || str.includes('"') || str.includes("\n")) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			return str;
		};

		// Função para formatar data
		const formatDate = (date: Date | null | undefined): string => {
			if (!date) return "";
			return new Date(date).toLocaleString("pt-BR");
		};

		// Função para contar arquivos por tipo
		const countFilesByType = (arquivos: any[]): { total: number; pdf: number; image: number } => {
			const total = arquivos.length;
			const pdf = arquivos.filter((a) => a.fileType?.toLowerCase().includes("pdf")).length;
			const image = arquivos.filter(
				(a) =>
					a.fileType?.toLowerCase().includes("image") ||
					a.fileType?.toLowerCase().includes("jpg") ||
					a.fileType?.toLowerCase().includes("png"),
			).length;
			return { total, pdf, image };
		};

		// Cabeçalho do CSV
		const headers = [
			"ID",
			"Nome",
			"Nome Real",
			"Telefone",
			"Email",
			"Usuário",
			"Canal",
			"Status",
			"Concluído",
			"Fez Recurso",
			"Datas Recurso",
			"Total Arquivos",
			"Arquivos PDF",
			"Arquivos Imagem",
			"PDF Unificado",
			"Imagens Convertidas",
			"Prova Manuscrita",
			"Manuscrito Processado",
			"Aguardando Manuscrito",
			"Espelho Processado",
			"Aguardando Espelho",
			"Análise Processada",
			"Aguardando Análise",
			"Análise Validada",
			"Consultoria Fase 2",
			"Especialidade",
			"Seccional",
			"Área Jurídica",
			"Nota Final",
			"Situação",
			"Inscrição",
			"Exames Participados",
			"Observações",
			"Data Criação",
			"Última Atualização",
		];

		// Linhas do CSV
		const rows = leads.map((lead) => {
			const leadData = lead.lead;
			const nomeRealProcessed =
				lead.nomeReal === "undefined" || !lead.nomeReal ? leadData?.name || "Nome não informado" : lead.nomeReal;

			const fileStats = countFilesByType(lead.arquivos || []);

			// Parse de datasRecurso
			let datasRecursoFormatted = "";
			if (lead.datasRecurso) {
				try {
					const datas = JSON.parse(lead.datasRecurso);
					datasRecursoFormatted = Array.isArray(datas) ? datas.join("; ") : "";
				} catch {
					datasRecursoFormatted = "";
				}
			}

			// Contar imagens convertidas
			let imagensConvertidasCount = 0;
			if (lead.imagensConvertidas) {
				try {
					const imagens = JSON.parse(lead.imagensConvertidas);
					imagensConvertidasCount = Array.isArray(imagens) ? imagens.length : 0;
				} catch {
					imagensConvertidasCount = 0;
				}
			}

			return [
				escapeCsv(lead.id),
				escapeCsv(leadData?.name || ""),
				escapeCsv(nomeRealProcessed),
				escapeCsv(leadData?.phone || ""),
				escapeCsv(leadData?.email || ""),
				escapeCsv(lead.usuarioChatwit?.name || ""),
				escapeCsv(lead.usuarioChatwit?.channel || ""),
				escapeCsv(lead.situacao || "Pendente"),
				escapeCsv(lead.concluido ? "Sim" : "Não"),
				escapeCsv(lead.fezRecurso ? "Sim" : "Não"),
				escapeCsv(datasRecursoFormatted),
				escapeCsv(fileStats.total),
				escapeCsv(fileStats.pdf),
				escapeCsv(fileStats.image),
				escapeCsv(lead.pdfUnificado ? "Sim" : "Não"),
				escapeCsv(imagensConvertidasCount > 0 ? `${imagensConvertidasCount}` : "Não"),
				escapeCsv(lead.provaManuscrita ? "Sim" : "Não"),
				escapeCsv(lead.manuscritoProcessado ? "Sim" : "Não"),
				escapeCsv(lead.aguardandoManuscrito ? "Sim" : "Não"),
				escapeCsv(lead.espelhoProcessado ? "Sim" : "Não"),
				escapeCsv(lead.aguardandoEspelho ? "Sim" : "Não"),
				escapeCsv(lead.analiseProcessada ? "Sim" : "Não"),
				escapeCsv(lead.aguardandoAnalise ? "Sim" : "Não"),
				escapeCsv(lead.analiseValidada ? "Sim" : "Não"),
				escapeCsv(lead.consultoriaFase2 ? "Sim" : "Não"),
				escapeCsv(lead.especialidade || ""),
				escapeCsv(lead.seccional || ""),
				escapeCsv(lead.areaJuridica || ""),
				escapeCsv(lead.notaFinal || ""),
				escapeCsv(lead.situacao || ""),
				escapeCsv(lead.inscricao || ""),
				escapeCsv(lead.examesParticipados || ""),
				escapeCsv(lead.anotacoes || ""),
				escapeCsv(formatDate(leadData?.createdAt)),
				escapeCsv(formatDate(leadData?.updatedAt)),
			].join(",");
		});

		// Montar o CSV completo
		const csv = [headers.join(","), ...rows].join("\n");

		// Adicionar BOM para UTF-8 (para Excel reconhecer corretamente)
		const bom = "\uFEFF";
		const csvWithBom = bom + csv;

		console.log(`[API Export CSV] Exportando ${leads.length} leads para usuário ${session.user.id}`);

		// Retornar o CSV como resposta
		return new Response(csvWithBom, {
			status: 200,
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="leads-chatwit-${new Date().toISOString().split("T")[0]}.csv"`,
			},
		});
	} catch (error) {
		console.error("[API Export CSV] Erro ao exportar leads:", error);
		return NextResponse.json({ error: "Erro interno ao exportar leads" }, { status: 500 });
	}
}
