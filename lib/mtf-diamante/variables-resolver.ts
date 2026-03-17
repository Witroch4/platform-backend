/**
 * Sistema de resolução de variáveis do MTF Diamante
 * Inclui variáveis normais e variáveis especiais dos lotes OAB
 */

import { getPrismaInstance } from "@/lib/connections";

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
		const data = new Date(dataStr);
		return data.toLocaleDateString("pt-BR", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return dataStr;
	}
}

function formatarLote(lote: LoteOab): string {
	return `Lote ${lote.numero}: ${lote.nome || "Sem nome"}\nValor: ${lote.valor}\nPeríodo: ${formatarDataHora(lote.dataInicio)} às ${formatarDataHora(lote.dataFim)}`;
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
		if (lotesVariavel && Array.isArray(lotesVariavel.valor)) {
			const lotes = lotesVariavel.valor as unknown as LoteOab[];
			const loteAtivo = lotes.find((lote) => lote.isActive === true);

			if (loteAtivo) {
				variaveis.push({
					chave: "lote_ativo",
					valor: formatarLote(loteAtivo),
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
			for (const lote of lotes) {
				variaveis.push({
					chave: `lote_${lote.numero}`,
					valor: formatarLote(lote),
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
			include: { variaveis: { where: { chave: "lotes_oab" } } },
		});

		if (!config || !config.variaveis[0]) {
			return "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*";
		}

		const lotesVariavel = config.variaveis[0];
		if (!Array.isArray(lotesVariavel.valor)) {
			return "Formato de lotes inválido";
		}

		const lotes = lotesVariavel.valor as unknown as LoteOab[];
		const loteAtivo = lotes.find((l) => l.isActive === true);

		if (!loteAtivo) {
			return "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*";
		}

		return formatarLote(loteAtivo);
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
		valor_analise: "Valor padrão da análise jurídica",
	};
	return descricoes[chave] || "Variável customizada";
}

export type { VariavelResolvida, LoteOab };
