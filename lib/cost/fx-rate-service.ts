/**
 * Serviço robusto para taxas USD/BRL com múltiplos provedores e PTAX
 */

import { PrismaClient } from "@prisma/client";
import log from "@/lib/log";

const prisma = new PrismaClient();

type Json = any;

interface FxRateData {
	date: Date;
	base: string;
	quote: string;
	rate: number;
}

export class FxRateService {
	private static readonly FALLBACK_RATE = 5.5; // último recurso
	private static readonly BASE = "USD";
	private static readonly QUOTE = "BRL";
	private static readonly REQ_TIMEOUT_MS = 10_000;
	private static readonly RETRIES = 2;

	/** ----- Utils ----- */
	private static async fetchJson(url: string, timeoutMs = FxRateService.REQ_TIMEOUT_MS): Promise<Json> {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetch(url, {
				headers: {
					Accept: "application/json",
					"User-Agent": "Socialwise-Chatwit/1.0",
				},
				signal: controller.signal,
			});
			if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
			return await res.json();
		} finally {
			clearTimeout(t);
		}
	}

	private static async tryWithRetries<T>(fn: () => Promise<T>, label: string): Promise<T> {
		let lastErr: unknown;
		for (let i = 0; i <= this.RETRIES; i++) {
			try {
				return await fn();
			} catch (err) {
				lastErr = err;
				const backoff = 250 * (i + 1);
				log.warn(`[FX] Falha em ${label} (tentativa ${i + 1}/${this.RETRIES + 1}): ${(err as Error).message}`);
				if (i < this.RETRIES) await new Promise((r) => setTimeout(r, backoff));
			}
		}
		throw lastErr;
	}

	/** ----- Providers ----- */
	private static async fromOpenERAPI(): Promise<number> {
		// Open endpoint (no key): https://open.er-api.com/v6/latest/USD
		const url = `https://open.er-api.com/v6/latest/${this.BASE}`;
		const data = await this.fetchJson(url);
		if (data?.result !== "success") throw new Error(`ER-API result=${data?.result}`);
		const rate = Number(data?.rates?.[this.QUOTE]);
		if (!Number.isFinite(rate)) throw new Error("ER-API: BRL ausente");
		return rate;
	}

	private static async fromExchangeRateHost(): Promise<number> {
		// Público; se você tiver chave, adicione ?access_key=... aqui
		const url = `https://api.exchangerate.host/latest?base=${this.BASE}&symbols=${this.QUOTE}`;
		const data = await this.fetchJson(url);
		const rate = Number(data?.rates?.[this.QUOTE]);
		if (!Number.isFinite(rate)) throw new Error("exchangerate.host: BRL ausente");
		return rate;
	}

	private static async fromAwesomeAPI(): Promise<number> {
		// Documentado como USDBRL.bid/ask
		const url = `https://economia.awesomeapi.com.br/last/${this.BASE}-${this.QUOTE}`;
		const data = await this.fetchJson(url);
		const str = data?.USDBRL?.ask ?? data?.USDBRL?.bid;
		const rate = Number(str);
		if (!Number.isFinite(rate)) throw new Error("AwesomeAPI: BRL ausente");
		return rate;
	}

	private static formatDateToBacen(d: Date): string {
		// PTAX usa 'MM-DD-YYYY'
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		const yyyy = d.getFullYear();
		return `${mm}-${dd}-${yyyy}`;
	}

	private static async fromBacenPTAX(target?: Date): Promise<number> {
		// Busca o último dia útil até 7 dias atrás
		let date = target ? new Date(target) : new Date();
		for (let i = 0; i < 7; i++) {
			const param = encodeURIComponent(this.formatDateToBacen(date));
			const url =
				`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` +
				`CotacaoDolarDia(dataCotacao='${param}')?$format=json`;
			const data = await this.fetchJson(url);
			const values: Array<{ cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }> = data?.value ?? [];

			if (values.length) {
				// pega o último registro do dia e usa cotacaoVenda (mais conservador)
				const last = values[values.length - 1];
				const rate = Number(last.cotacaoVenda);
				if (Number.isFinite(rate)) return rate;
			}

			// recua 1 dia (para finais de semana/feriados)
			date.setDate(date.getDate() - 1);
		}
		throw new Error("PTAX sem dados recentes");
	}

	private static async fetchFromProviders(): Promise<number> {
		const providers: Array<[string, () => Promise<number>]> = [
			["open.er-api", () => this.fromOpenERAPI()],
			["exchangerate.host", () => this.fromExchangeRateHost()],
			["awesomeapi", () => this.fromAwesomeAPI()],
			["bacen-ptax", () => this.fromBacenPTAX()],
		];

		for (const [name, fn] of providers) {
			try {
				const rate = await this.tryWithRetries(fn, name);
				log.info(`[FX] Provider '${name}' OK: ${rate}`);
				return rate;
			} catch (err) {
				log.warn(`[FX] Provider '${name}' falhou: ${(err as Error).message}`);
			}
		}
		throw new Error("Todos os provedores falharam");
	}

	/** ----- API Pública da classe ----- */

	/**
	 * Busca taxa de câmbio atual (com múltiplos provedores) e faz fallback para DB/constante.
	 */
	static async fetchCurrentRate(): Promise<number> {
		try {
			log.info("[FX] Buscando USD/BRL atual...");
			const rate = await this.fetchFromProviders();
			return rate;
		} catch (error) {
			log.error("[FX] Erro ao buscar taxa de câmbio:", error);

			// 1) Última taxa do banco
			const lastRate = await this.getLatestStoredRate();
			if (lastRate) {
				log.warn(`[FX] Usando última taxa conhecida: ${lastRate.rate} (${lastRate.date.toISOString()})`);
				return Number(lastRate.rate);
			}

			// 2) Fallback fixo
			log.warn(`[FX] Usando taxa de fallback: ${this.FALLBACK_RATE}`);
			return this.FALLBACK_RATE;
		}
	}

	/**
	 * Armazena taxa de câmbio no banco de dados
	 */
	static async storeRate(rate: number, date: Date = new Date()): Promise<void> {
		try {
			const normalizedDate = new Date(date);
			normalizedDate.setUTCHours(0, 0, 0, 0);

			await prisma.fxRate.upsert({
				where: {
					date_base_quote: {
						date: normalizedDate,
						base: this.BASE,
						quote: this.QUOTE,
					},
				},
				update: { rate },
				create: {
					date: normalizedDate,
					base: this.BASE,
					quote: this.QUOTE,
					rate,
				},
			});

			log.info(`[FX] Armazenada USD/BRL=${rate} em ${normalizedDate.toISOString().split("T")[0]}`);
		} catch (error) {
			log.error("[FX] Erro ao armazenar taxa:", error);
			throw error;
		}
	}

	/**
	 * Busca e armazena a taxa atual
	 */
	static async updateCurrentRate(): Promise<number> {
		const rate = await this.fetchCurrentRate();
		await this.storeRate(rate);
		return rate;
	}

	/**
	 * Obtém taxa para uma data específica (usa DB; se faltar, tenta PTAX até 7 dias úteis antes; por fim providers atuais)
	 */
	static async getRateForDate(date: Date): Promise<number> {
		try {
			const normalizedDate = new Date(date);
			normalizedDate.setUTCHours(0, 0, 0, 0);

			// 1) Exata no DB
			let fxRate = await prisma.fxRate.findUnique({
				where: {
					date_base_quote: {
						date: normalizedDate,
						base: this.BASE,
						quote: this.QUOTE,
					},
				},
			});
			if (fxRate) return Number(fxRate.rate);

			// 2) Mais próxima (até 7 dias antes)
			const sevenDaysAgo = new Date(normalizedDate);
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			fxRate = await prisma.fxRate.findFirst({
				where: {
					base: this.BASE,
					quote: this.QUOTE,
					date: { gte: sevenDaysAgo, lte: normalizedDate },
				},
				orderBy: { date: "desc" },
			});
			if (fxRate) {
				log.info(`[FX] Usando taxa próxima: ${fxRate.rate} de ${fxRate.date.toISOString().split("T")[0]}`);
				return Number(fxRate.rate);
			}

			// 3) PTAX do dia útil mais próximo
			try {
				const ptax = await this.fromBacenPTAX(normalizedDate);
				// cacheia para a data consultada
				await this.storeRate(ptax, normalizedDate);
				return ptax;
			} catch {
				// ignora e segue
			}

			// 4) Como último recurso, taxa atual (providers)
			log.warn(`[FX] Nenhuma taxa para ${normalizedDate.toISOString().split("T")[0]}, usando taxa atual`);
			return await this.fetchCurrentRate();
		} catch (error) {
			log.error("[FX] Erro ao buscar taxa para data:", error);
			return this.FALLBACK_RATE;
		}
	}

	/**
	 * Última taxa armazenada
	 */
	static async getLatestStoredRate(): Promise<FxRateData | null> {
		try {
			const fxRate = await prisma.fxRate.findFirst({
				where: { base: this.BASE, quote: this.QUOTE },
				orderBy: { date: "desc" },
			});
			if (!fxRate) return null;
			return { date: fxRate.date, base: fxRate.base, quote: fxRate.quote, rate: Number(fxRate.rate) };
		} catch (error) {
			log.error("[FX] Erro ao buscar última taxa:", error);
			return null;
		}
	}

	/**
	 * Converte USD → BRL
	 */
	static async convertUsdToBrl(
		usdAmount: number,
		date?: Date,
	): Promise<{ brlAmount: number; rate: number; date: Date }> {
		const targetDate = date || new Date();
		const rate = await this.getRateForDate(targetDate);
		const brlAmount = usdAmount * rate;
		return {
			brlAmount: Math.round(brlAmount * 100) / 100,
			rate,
			date: targetDate,
		};
	}

	/**
	 * Histórico (DB)
	 */
	static async getRateHistory(startDate: Date, endDate: Date): Promise<FxRateData[]> {
		try {
			const rates = await prisma.fxRate.findMany({
				where: {
					base: this.BASE,
					quote: this.QUOTE,
					date: { gte: startDate, lte: endDate },
				},
				orderBy: { date: "asc" },
			});
			return rates.map((r) => ({ date: r.date, base: r.base, quote: r.quote, rate: Number(r.rate) }));
		} catch (error) {
			log.error("[FX] Erro ao buscar histórico:", error);
			return [];
		}
	}

	/**
	 * Limpa taxas antigas (> 365 dias)
	 */
	static async cleanupOldRates(): Promise<number> {
		try {
			const oneYearAgo = new Date();
			oneYearAgo.setDate(oneYearAgo.getDate() - 365);
			const result = await prisma.fxRate.deleteMany({ where: { date: { lt: oneYearAgo } } });
			log.info(`[FX] Limpeza: ${result.count} registros removidos`);
			return result.count;
		} catch (error) {
			log.error("[FX] Erro na limpeza:", error);
			return 0;
		}
	}
}

export default FxRateService;
