import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { formatMtfLoteDateTime } from "@/lib/mtf-diamante/lote-date-time";
import { Prisma } from "@prisma/client";
import { parseCurrencyToCents } from "@/lib/payment/parse-currency";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("API.MTFVariables");
const MIN_ANALYSIS_AMOUNT_CENTS = 100;

// Função helper para obter descrição das variáveis
function getDescricaoVariavel(chave: string): string {
	const descricoes: Record<string, string> = {
		chave_pix: "Chave PIX para pagamentos (máx. 15 caracteres)",
		nome_do_escritorio_rodape: "Nome do escritório que aparece no rodapé",
		analise: "Valor da análise jurídica (formato R$ X,XX)",
		lotes_oab: "Configuração dos lotes OAB (dados internos)",
	};
	return descricoes[chave] || "Variável customizada";
}

// GET: Busca todas as variáveis do usuário (incluindo lotes formatados)
export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Garantir existência do User após reset de banco
		try {
			const prisma = getPrismaInstance();
			const appUserId = session.user.id;
			const existing = await prisma.user.findUnique({ where: { id: appUserId } });
			if (!existing) {
				const syntheticEmail = ((session.user as any)?.email as string) || `${appUserId}@local.invalid`;
				await prisma.user.create({
					data: {
						id: appUserId,
						email: syntheticEmail,
						name: session.user.name || undefined,
					},
				});
			}
		} catch {}

		// Busca ou cria a configuração do MTF Diamante usando upsert
		let config = await getPrismaInstance().mtfDiamanteConfig.upsert({
			where: { userId: session.user.id },
			update: {},
			create: {
				userId: session.user.id,
				variaveis: {
					create: [
						{ chave: "chave_pix", valor: "57944155000101" },
						{ chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
						{ chave: "analise", valor: "R$ 27,90" },
					],
				},
			},
			include: { variaveis: true },
		});

		// Buscar lotes OAB e convertê-los em variáveis especiais
		const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");
		const lotes = lotesVariavel && Array.isArray(lotesVariavel.valor) ? (lotesVariavel.valor as unknown as any[]) : [];

		// Converter variáveis normais (excluindo lotes_oab e lote_* que são computadas)
		const variaveisNormais = config.variaveis
			.filter((v) => v.chave !== "lotes_oab" && !v.chave.startsWith("lote_"))
			.map((v) => ({
				id: v.id,
				chave: v.chave,
				valor: String(v.valor || ""),
				tipo: "normal" as const,
				descricao: getDescricaoVariavel(v.chave),
				displayName: v.chave.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
			}));

		// Helper para formatar data
		const formatarData = (dataStr: string) => {
			if (!dataStr) return "";
			try {
				return formatMtfLoteDateTime(dataStr);
			} catch {
				return dataStr;
			}
		};

		// Helper para formatar um lote em texto humanizado (bold por linha para WhatsApp)
		const formatarLote = (lote: any) => {
			const dataInicioFormatada = formatarData(lote.dataInicio);
			const dataFimFormatada = formatarData(lote.dataFim);
			return `*Lote ${lote.numero}: ${lote.nome || "Sem nome"}*\n*Valor: ${lote.valor}*\n*Período: ${dataInicioFormatada} às ${dataFimFormatada}*`;
		};

		// Helper para parse de moeda
		const parseCurrency = (valor: string): number => {
			const cleaned = valor.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim();
			return parseFloat(cleaned) || 0;
		};
		const fmtCurrency = (valor: number): string => {
			if (valor % 1 === 0) return `R$ ${valor.toFixed(0)}`;
			return `R$ ${valor.toFixed(2).replace(".", ",")}`;
		};

		// Buscar valor_analise para calcular complemento do lote ativo
		const valorAnaliseVar = config.variaveis.find((v) => v.chave === "analise" || v.chave === "valor_analise");
		const valorAnaliseStr = String(valorAnaliseVar?.valor || "");

		// Helper para formatar lote ativo com complemento calculado
		const formatarLoteAtivo = (lote: any) => {
			const base = formatarLote(lote);
			const loteNum = parseCurrency(lote.valor);
			const analiseNum = parseCurrency(valorAnaliseStr);
			if (loteNum > 0 && analiseNum > 0 && loteNum > analiseNum) {
				const complemento = loteNum - analiseNum;
				return `${base}\n(com complemento de apenas *${fmtCurrency(complemento)}*)`;
			}
			return base;
		};

		// Gerar variáveis de lote: lote_ativo + lote_1, lote_2, etc.
		const variaveisLotes = [];
		const loteAtivo = lotes.find((lote: any) => lote.isActive === true);

		// lote_ativo — lote atualmente ativo
		if (loteAtivo) {
			variaveisLotes.push({
				id: `lote_ativo`,
				chave: `lote_ativo`,
				valor: formatarLoteAtivo(loteAtivo),
				valorRaw: loteAtivo.valor,
				tipo: "lote" as const,
				descricao: `Lote Ativo - ${loteAtivo.nome} (${loteAtivo.numero})`,
				displayName: `Lote Ativo`,
				isActive: true,
				loteData: {
					id: loteAtivo.id,
					numero: loteAtivo.numero,
					nome: loteAtivo.nome,
					valor: loteAtivo.valor,
					dataInicio: loteAtivo.dataInicio,
					dataFim: loteAtivo.dataFim,
				},
			});
		} else {
			variaveisLotes.push({
				id: `lote_ativo`,
				chave: `lote_ativo`,
				valor:
					"*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*",
				valorRaw: "",
				tipo: "lote" as const,
				descricao: "Lote Ativo - Nenhum lote selecionado",
				displayName: `Lote Ativo`,
				isActive: false,
				loteData: null,
			});
		}

		// lote_1, lote_2, lote_3, etc. — cada lote individual por número
		const sortedLotes = [...lotes].sort((a: any, b: any) => a.numero - b.numero);
		for (const lote of sortedLotes) {
			variaveisLotes.push({
				id: `lote_${lote.numero}`,
				chave: `lote_${lote.numero}`,
				valor: formatarLote(lote),
				valorRaw: lote.valor,
				tipo: "lote" as const,
				descricao: `Lote ${lote.numero} - ${lote.nome || "Sem nome"}`,
				displayName: `Lote ${lote.numero}`,
				isActive: lote.isActive === true,
				loteData: {
					id: lote.id,
					numero: lote.numero,
					nome: lote.nome,
					valor: lote.valor,
					dataInicio: lote.dataInicio,
					dataFim: lote.dataFim,
				},
			});
		}

		// Combinar todas as variáveis
		const todasVariaveis = [...variaveisNormais, ...variaveisLotes];

		log.info(`Retornando ${todasVariaveis.length} variáveis para usuário ${session.user.id}`, {
			variaveis: todasVariaveis.map((v) => `${v.chave} (${v.tipo})`),
		});

		return NextResponse.json({ success: true, data: todasVariaveis });
	} catch (error) {
		log.error("Erro em GET /variaveis", error as Error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// POST: Cria ou atualiza variáveis
export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Garantir existência do User após reset de banco
		try {
			const prisma = getPrismaInstance();
			const appUserId = session.user.id;
			const existing = await prisma.user.findUnique({ where: { id: appUserId } });
			if (!existing) {
				const syntheticEmail = ((session.user as any)?.email as string) || `${appUserId}@local.invalid`;
				await prisma.user.create({
					data: {
						id: appUserId,
						email: syntheticEmail,
						name: session.user.name || undefined,
					},
				});
			}
		} catch {}

		const body = await request.json();
		const { variaveis } = body;

		if (!Array.isArray(variaveis)) {
			return NextResponse.json({ error: "Variáveis deve ser um array" }, { status: 400 });
		}

		// Busca ou cria a configuração do MTF Diamante usando upsert
		const config = await getPrismaInstance().mtfDiamanteConfig.upsert({
			where: { userId: session.user.id },
			update: {},
			create: { userId: session.user.id },
		});

		const variaveisSanitizadas = variaveis
			.filter((v: any) => typeof v?.chave === "string" && typeof v?.valor === "string")
			.map((v: any) => ({
				chave: v.chave.trim(),
				valor: v.valor.trim(),
			}))
			.filter((v: any) => v.chave && v.valor)
			.filter((v: any) => v.chave !== "lotes_oab" && !v.chave.startsWith("lote_"));

		const analysisVariable = variaveisSanitizadas.find((variavel: { chave: string; valor: string }) => variavel.chave === "analise");
		if (!analysisVariable) {
			return NextResponse.json({ error: "A variável analise é obrigatória." }, { status: 400 });
		}

		let analysisAmountCents = 0;
		try {
			analysisAmountCents = parseCurrencyToCents(analysisVariable.valor);
		} catch {
			return NextResponse.json({ error: "O valor da variável analise é inválido." }, { status: 400 });
		}

		if (analysisAmountCents < MIN_ANALYSIS_AMOUNT_CENTS) {
			return NextResponse.json({ error: "O valor da análise deve ser no mínimo R$ 1,00." }, { status: 400 });
		}

		// Remove e recria apenas variáveis editáveis, preservando lotes internos.
		await getPrismaInstance().mtfDiamanteVariavel.deleteMany({
			where: {
				configId: config.id,
				chave: {
					not: "lotes_oab",
				},
			},
		});

		if (variaveisSanitizadas.length > 0) {
			await getPrismaInstance().mtfDiamanteVariavel.createMany({
				data: variaveisSanitizadas.map((v: any) => ({
					configId: config.id,
					chave: v.chave,
					valor: v.valor,
				})),
			});
		}

		// Busca as variáveis criadas para retornar
		const variaveisCriadas = await getPrismaInstance().mtfDiamanteVariavel.findMany({
			where: { configId: config.id },
		});

		try {
			const { getRedisInstance } = await import("@/lib/connections");
			const redis = getRedisInstance();

			await redis.del(`mtf_variables:${session.user.id}`);
			await redis.del(`mtf_lotes:${session.user.id}`);
		} catch (cacheError) {
			log.warn("Erro ao invalidar cache", cacheError as Error);
		}

		return NextResponse.json({ success: true, data: variaveisCriadas });
	} catch (error) {
		log.error("Erro em POST /variaveis", error as Error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
