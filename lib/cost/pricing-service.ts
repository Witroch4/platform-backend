import { getPrismaInstance } from "@/lib/connections";
import { Provider, Unit, PrismaClient } from "@prisma/client";

const prisma = getPrismaInstance();

/**
 * Interface para informações de preço resolvido
 */
export interface ResolvedPrice {
	pricePerUnit: number;
	currency: string;
	priceCardId: string;
	effectiveFrom: Date;
	effectiveTo: Date | null;
	region: string | null;
	isRegionalPrice: boolean;
}

/**
 * Interface para cache de preços
 */
interface PriceCache {
	[key: string]: {
		price: ResolvedPrice;
		cachedAt: Date;
		ttl: number;
	};
}

/**
 * Serviço de precificação versionada com cache e fallbacks
 */
export class PricingService {
	private priceCache: PriceCache = {};
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

	/**
	 * Gera chave de cache para um preço
	 */
	private getCacheKey(provider: Provider, product: string, unit: Unit, when: Date, region?: string): string {
		const dateStr = when.toISOString().split("T")[0]; // YYYY-MM-DD
		return `${provider}:${product}:${unit}:${dateStr}:${region || "global"}`;
	}

	/**
	 * Verifica se um item do cache ainda é válido
	 */
	private isCacheValid(cacheItem: PriceCache[string]): boolean {
		const now = new Date();
		return now.getTime() - cacheItem.cachedAt.getTime() < cacheItem.ttl;
	}

	/**
	 * Resolve preço unitário com cache e fallbacks regionais
	 */
	async resolveUnitPrice(
		provider: Provider,
		product: string,
		unit: Unit,
		when: Date,
		region?: string,
	): Promise<ResolvedPrice | null> {
		// Verifica cache primeiro
		const cacheKey = this.getCacheKey(provider, product, unit, when, region);
		const cached = this.priceCache[cacheKey];

		if (cached && this.isCacheValid(cached)) {
			return cached.price;
		}

		try {
			// Busca no banco com fallback regional
			const priceCard = await this.findBestPriceCard(provider, product, unit, when, region);

			if (!priceCard) {
				return null;
			}

			const resolvedPrice: ResolvedPrice = {
				pricePerUnit: Number(priceCard.pricePerUnit),
				currency: priceCard.currency,
				priceCardId: priceCard.id,
				effectiveFrom: priceCard.effectiveFrom,
				effectiveTo: priceCard.effectiveTo,
				region: priceCard.region,
				isRegionalPrice: !!priceCard.region,
			};

			// Armazena no cache
			this.priceCache[cacheKey] = {
				price: resolvedPrice,
				cachedAt: new Date(),
				ttl: this.CACHE_TTL,
			};

			return resolvedPrice;
		} catch (error) {
			console.error("Erro ao resolver preço unitário:", error);
			return null;
		}
	}

	/**
	 * Encontra o melhor price card com fallback regional
	 */
	private async findBestPriceCard(provider: Provider, product: string, unit: Unit, when: Date, region?: string) {
		// Estratégia de busca:
		// 1. Preço específico da região (se fornecida)
		// 2. Preço global (region = null)

		const whereConditions = {
			provider,
			product,
			unit,
			effectiveFrom: { lte: when },
			OR: [{ effectiveTo: null }, { effectiveTo: { gte: when } }],
		};

		// Primeiro tenta preço regional específico
		if (region) {
			const regionalPrice = await prisma.priceCard.findFirst({
				where: {
					...whereConditions,
					region,
				},
				orderBy: [
					{ effectiveFrom: "desc" }, // Mais recente primeiro
				],
			});

			if (regionalPrice) {
				return regionalPrice;
			}
		}

		// Fallback para preço global
		const globalPrice = await prisma.priceCard.findFirst({
			where: {
				...whereConditions,
				region: null,
			},
			orderBy: [{ effectiveFrom: "desc" }],
		});

		return globalPrice;
	}

	/**
	 * Busca todos os preços ativos para um produto em uma data
	 */
	async getActivePrices(provider: Provider, product: string, when: Date = new Date()): Promise<ResolvedPrice[]> {
		try {
			const priceCards = await prisma.priceCard.findMany({
				where: {
					provider,
					product,
					effectiveFrom: { lte: when },
					OR: [{ effectiveTo: null }, { effectiveTo: { gte: when } }],
				},
				orderBy: [{ unit: "asc" }, { region: "asc" }, { effectiveFrom: "desc" }],
			});

			return priceCards.map((card) => ({
				pricePerUnit: Number(card.pricePerUnit),
				currency: card.currency,
				priceCardId: card.id,
				effectiveFrom: card.effectiveFrom,
				effectiveTo: card.effectiveTo,
				region: card.region,
				isRegionalPrice: !!card.region,
			}));
		} catch (error) {
			console.error("Erro ao buscar preços ativos:", error);
			return [];
		}
	}

	/**
	 * Busca histórico de preços para análise
	 */
	async getPriceHistory(
		provider: Provider,
		product: string,
		unit: Unit,
		region?: string,
		limit: number = 10,
	): Promise<ResolvedPrice[]> {
		try {
			const priceCards = await prisma.priceCard.findMany({
				where: {
					provider,
					product,
					unit,
					region: region || null,
				},
				orderBy: [{ effectiveFrom: "desc" }],
				take: limit,
			});

			return priceCards.map((card) => ({
				pricePerUnit: Number(card.pricePerUnit),
				currency: card.currency,
				priceCardId: card.id,
				effectiveFrom: card.effectiveFrom,
				effectiveTo: card.effectiveTo,
				region: card.region,
				isRegionalPrice: !!card.region,
			}));
		} catch (error) {
			console.error("Erro ao buscar histórico de preços:", error);
			return [];
		}
	}

	/**
	 * Verifica se existe preço para uma combinação específica
	 */
	async hasPriceFor(
		provider: Provider,
		product: string,
		unit: Unit,
		when: Date = new Date(),
		region?: string,
	): Promise<boolean> {
		const price = await this.resolveUnitPrice(provider, product, unit, when, region);
		return !!price;
	}

	/**
	 * Busca preços em lote para otimização
	 */
	async resolveBulkPrices(
		requests: Array<{
			provider: Provider;
			product: string;
			unit: Unit;
			when: Date;
			region?: string;
		}>,
	): Promise<Array<ResolvedPrice | null>> {
		const results: Array<ResolvedPrice | null> = [];

		// Processa em paralelo para melhor performance
		const promises = requests.map((req) =>
			this.resolveUnitPrice(req.provider, req.product, req.unit, req.when, req.region),
		);

		const resolvedPrices = await Promise.allSettled(promises);

		for (const result of resolvedPrices) {
			if (result.status === "fulfilled") {
				results.push(result.value);
			} else {
				console.error("Erro ao resolver preço em lote:", result.reason);
				results.push(null);
			}
		}

		return results;
	}

	/**
	 * Limpa cache de preços
	 */
	clearCache(): void {
		this.priceCache = {};
	}

	/**
	 * Limpa entradas expiradas do cache
	 */
	cleanExpiredCache(): void {
		const now = new Date();

		for (const [key, cacheItem] of Object.entries(this.priceCache)) {
			if (!this.isCacheValid(cacheItem)) {
				delete this.priceCache[key];
			}
		}
	}

	/**
	 * Obtém estatísticas do cache
	 */
	getCacheStats(): {
		totalEntries: number;
		validEntries: number;
		expiredEntries: number;
		hitRate?: number;
	} {
		const totalEntries = Object.keys(this.priceCache).length;
		let validEntries = 0;
		let expiredEntries = 0;

		for (const cacheItem of Object.values(this.priceCache)) {
			if (this.isCacheValid(cacheItem)) {
				validEntries++;
			} else {
				expiredEntries++;
			}
		}

		return {
			totalEntries,
			validEntries,
			expiredEntries,
		};
	}
}

/**
 * Instância singleton do serviço de precificação
 */
export const pricingService = new PricingService();

/**
 * Função utilitária para resolver preço (compatibilidade com código existente)
 */
export async function resolveUnitPrice(
	provider: Provider,
	product: string,
	unit: Unit,
	when: Date,
	region?: string,
): Promise<{
	pricePerUnit: number;
	currency: string;
	priceCardId: string;
} | null> {
	const resolved = await pricingService.resolveUnitPrice(provider, product, unit, when, region);

	if (!resolved) {
		return null;
	}

	return {
		pricePerUnit: resolved.pricePerUnit,
		currency: resolved.currency,
		priceCardId: resolved.priceCardId,
	};
}

/**
 * Função para processar eventos PENDING_PRICING em lote
 */
export async function processPendingPricingEvents(limit: number = 100): Promise<{
	processed: number;
	failed: number;
	total: number;
}> {
	try {
		const pendingEvents = await prisma.costEvent.findMany({
			where: {
				status: "PENDING_PRICING",
			},
			orderBy: {
				ts: "asc",
			},
			take: limit,
		});

		let processed = 0;
		let failed = 0;

		// Prepara requests para processamento em lote
		const priceRequests = pendingEvents.map((event) => ({
			provider: event.provider,
			product: event.product,
			unit: event.unit,
			when: event.ts,
			region: (event.raw as any)?.region,
		}));

		// Resolve preços em lote
		const resolvedPrices = await pricingService.resolveBulkPrices(priceRequests);

		// Atualiza eventos no banco
		for (let i = 0; i < pendingEvents.length; i++) {
			const event = pendingEvents[i];
			const price = resolvedPrices[i];

			try {
				if (price) {
					// Calcula custo baseado no tipo de unidade
					let cost: number;
					if (event.unit.startsWith("TOKENS_")) {
						cost = (Number(event.units) / 1_000_000) * price.pricePerUnit;
					} else {
						cost = Number(event.units) * price.pricePerUnit;
					}

					await prisma.costEvent.update({
						where: { id: event.id },
						data: {
							unitPrice: price.pricePerUnit,
							cost: cost,
							currency: price.currency,
							status: "PRICED",
						},
					});

					processed++;
				} else {
					failed++;
				}
			} catch (error) {
				console.error(`Erro ao atualizar evento ${event.id}:`, error);
				failed++;
			}
		}

		console.log(
			`Processamento de eventos pendentes: ${processed} processados, ${failed} falharam de ${pendingEvents.length} total`,
		);

		return {
			processed,
			failed,
			total: pendingEvents.length,
		};
	} catch (error) {
		console.error("Erro ao processar eventos PENDING_PRICING:", error);
		return {
			processed: 0,
			failed: 0,
			total: 0,
		};
	}
}
