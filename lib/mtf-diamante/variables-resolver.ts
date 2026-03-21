/**
 * Sistema de resolução de variáveis do MTF Diamante
 * Inclui variáveis normais e variáveis especiais dos lotes OAB
 */

import { getPrismaInstance } from "@/lib/connections";
import { formatMtfLoteDateTime } from "@/lib/mtf-diamante/lote-date-time";

interface LoteOab {
	id: string;
	numero: number;
	nome: string;
	valor: string;
	dataInicio: string;
	dataFim: string;
	isActive: boolean;
}

interface VariavelResolvida {
	chave: string;
	valor: string;
	tipo: "normal" | "lote";
	descricao?: string;
}

function formatarDataHora(dataStr: string): string {
	if (!dataStr) return "";
	try {
		return formatMtfLoteDateTime(dataStr);
	} catch {
		return dataStr;
	}
}

function parseCurrencyToNumber(valor: string): number {
	const cleaned = valor.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim();
	return parseFloat(cleaned) || 0;
}

function formatCurrency(valor: number): string {
	if (valor % 1 === 0) return `R$ ${valor.toFixed(0)}`;
	return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function formatarLote(lote: LoteOab): string {
	return `*Lote ${lote.numero}: ${lote.nome || "Sem nome"}*\n*Valor: ${lote.valor}*\n*Período: ${formatarDataHora(lote.dataInicio)} às ${formatarDataHora(lote.dataFim)}*`;
}

/**
 * Verifica se um lote está vencido (dataFim < agora)
 */
function isLoteVencido(lote: LoteOab): boolean {
	if (!lote.dataFim) return false;
	const dataFim = new Date(lote.dataFim);
	if (Number.isNaN(dataFim.getTime())) return false;
	return dataFim.getTime() < Date.now();
}

/**
 * Formata lote vencido com ~strikethrough~ WhatsApp em cada linha
 */
function formatarLoteVencido(lote: LoteOab): string {
	return formatarLote(lote)
		.split("\n")
		.map((line) => `~${line}~`)
		.join("\n");
}

function formatarLoteAtivo(lote: LoteOab, valorAnalise: string): string {
	const base = formatarLote(lote);
	const loteNum = parseCurrencyToNumber(lote.valor);
	const analiseNum = parseCurrencyToNumber(valorAnalise);
	if (loteNum > 0 && analiseNum > 0 && loteNum > analiseNum) {
		const complemento = loteNum - analiseNum;
		return `${base}\n(com complemento de apenas *${formatCurrency(complemento)}*)`;
	}
	return base;
}

/**
 * Busca todas as variáveis disponíveis para um usuário
 * Inclui variáveis normais e variáveis dos lotes
 */
export async function getAllVariablesForUser(userId: string): Promise<VariavelResolvida[]> {
	try {
		const prisma = getPrismaInstance();

		// Buscar configuração do usuário
		const config = await prisma.mtfDiamanteConfig.findUnique({
			where: { userId },
			include: { variaveis: true },
		});

		if (!config) {
			console.warn(`[MTF Variables] Configuração não encontrada para usuário ${userId}`);
			return [];
		}

		const variaveis: VariavelResolvida[] = [];

		// 1. Adicionar variáveis normais (exceto lotes_oab que é interna)
		for (const variavel of config.variaveis) {
			if (variavel.chave !== "lotes_oab") {
				variaveis.push({
					chave: variavel.chave,
					valor: String(variavel.valor || ""),
					tipo: "normal",
					descricao: getDescricaoVariavel(variavel.chave),
				});
			}
		}

		// 2. Buscar lotes e criar variáveis: lote_ativo + lote_1, lote_2, etc.
		const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");
		const valorAnalise = config.variaveis.find((v) => v.chave === "analise" || v.chave === "valor_analise");
		const valorAnaliseStr = String(valorAnalise?.valor || "");
		if (lotesVariavel && Array.isArray(lotesVariavel.valor)) {
			const lotes = lotesVariavel.valor as unknown as LoteOab[];
			const loteAtivo = lotes.find((lote) => lote.isActive === true);

			if (loteAtivo) {
				variaveis.push({
					chave: "lote_ativo",
					valor: formatarLoteAtivo(loteAtivo, valorAnaliseStr),
					tipo: "lote",
				});
			} else {
				variaveis.push({
					chave: "lote_ativo",
					valor:
						"*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*",
					tipo: "lote",
				});
			}

			// Individual lote_N variables
			const loteAtivoNumero = loteAtivo?.numero ?? -1;
			for (const lote of lotes) {
				let valor: string;
				if (lote.numero === loteAtivoNumero) {
					valor = ""; // Já aparece via {{lote_ativo}}, não duplicar
				} else if (isLoteVencido(lote)) {
					valor = formatarLoteVencido(lote);
				} else {
					valor = formatarLote(lote);
				}
				variaveis.push({
					chave: `lote_${lote.numero}`,
					valor,
					tipo: "lote",
				});
			}
		}

		console.log(`[MTF Variables] Total de variáveis resolvidas para usuário ${userId}: ${variaveis.length}`);
		return variaveis;
	} catch (error) {
		console.error(`[MTF Variables] Erro ao buscar variáveis para usuário ${userId}:`, error);
		return [];
	}
}

/**
 * Busca uma variável específica por chave
 */
export async function getVariableByKey(userId: string, chave: string): Promise<string> {
	const variaveis = await getAllVariablesForUser(userId);
	const variavel = variaveis.find((v) => v.chave === chave);
	return variavel?.valor || "";
}

/**
 * Busca o lote ativo formatado para um usuário
 */
export async function getLoteAtivoFormatado(userId: string): Promise<string> {
	try {
		const prisma = getPrismaInstance();

		const config = await prisma.mtfDiamanteConfig.findUnique({
			where: { userId },
			include: { variaveis: { where: { chave: { in: ["lotes_oab", "analise", "valor_analise"] } } } },
		});

		if (!config) {
			return "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*";
		}

		const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");
		if (!lotesVariavel || !Array.isArray(lotesVariavel.valor)) {
			return "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*";
		}

		const lotes = lotesVariavel.valor as unknown as LoteOab[];
		const loteAtivo = lotes.find((l) => l.isActive === true);

		if (!loteAtivo) {
			return "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*";
		}

		const valorAnalise = config.variaveis.find((v) => v.chave === "analise" || v.chave === "valor_analise");
		return formatarLoteAtivo(loteAtivo, String(valorAnalise?.valor || ""));
	} catch (error) {
		console.error(`[MTF Variables] Erro ao buscar lote ativo para usuário ${userId}:`, error);
		return "Erro ao buscar lote ativo";
	}
}

/**
 * Substitui variáveis em um texto usando a sintaxe {{variavel}}
 * Inclui processamento especial para lote ativo
 */
export async function replaceVariablesInText(userId: string, texto: string): Promise<string> {
	if (!texto) return texto;

	let textoSubstituido = texto;

	// Buscar todas as variáveis (inclui lote_ativo e lote_N)
	const variaveis = await getAllVariablesForUser(userId);

	for (const variavel of variaveis) {
		const regex = new RegExp(`\\{\\{${variavel.chave}\\}\\}`, "g");
		textoSubstituido = textoSubstituido.replace(regex, variavel.valor);
	}

	return textoSubstituido;
}

/**
 * Busca variáveis em cache ou banco de dados
 * Com cache Redis para performance
 */
export async function getCachedVariablesForUser(userId: string): Promise<VariavelResolvida[]> {
	try {
		const { getRedisInstance } = await import("@/lib/connections");
		const redis = getRedisInstance();

		const cacheKey = `mtf_variables:${userId}`;
		const cached = await redis.get(cacheKey);

		if (cached) {
			console.log(`[MTF Variables] Cache hit para usuário ${userId}`);
			return JSON.parse(cached);
		}

		// Cache miss - buscar do banco
		console.log(`[MTF Variables] Cache miss para usuário ${userId}, buscando do banco`);
		const variaveis = await getAllVariablesForUser(userId);

		// Cachear por 10 minutos
		await redis.setex(cacheKey, 600, JSON.stringify(variaveis));

		return variaveis;
	} catch (redisError) {
		console.warn("[MTF Variables] Erro no Redis, usando banco direto:", redisError);
		return getAllVariablesForUser(userId);
	}
}

/**
 * Invalida o cache de variáveis para um usuário
 */
export async function invalidateVariablesCache(userId: string): Promise<void> {
	try {
		const { getRedisInstance } = await import("@/lib/connections");
		const redis = getRedisInstance();

		await redis.del(`mtf_variables:${userId}`);
		console.log(`[MTF Variables] Cache invalidado para usuário ${userId}`);
	} catch (error) {
		console.warn("[MTF Variables] Erro ao invalidar cache:", error);
	}
}

// Função helper para descrições das variáveis
function getDescricaoVariavel(chave: string): string {
	const descricoes: Record<string, string> = {
		chave_pix: "Chave PIX para pagamentos (máx. 15 caracteres)",
		nome_do_escritorio_rodape: "Nome do escritório que aparece no rodapé",
		analise: "Valor da análise jurídica (formato R$ X,XX)",
	};
	return descricoes[chave] || "Variável customizada";
}

export type { VariavelResolvida, LoteOab };
