/**
 * Economic Mode Service
 * Based on requirements 15.1, 15.2, 15.3
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { EconomicModeConfig, CacheEntry } from "../types/cost-control";
import { LlmPromptContext, DynamicGenerationResult } from "../types/llm";
import log from "@/lib/log";
import crypto from "crypto";

export class EconomicModeService {
	private redis: Redis;
	private config: EconomicModeConfig;

	constructor(redis: Redis) {
		this.redis = redis;
		this.config = {
			enabled: process.env.ECONOMIC_MODE_ENABLED === "true",
			maxResponseLength: parseInt(process.env.ECONOMIC_MAX_RESPONSE_LENGTH || "200"),
			useOnlyMiniModel: true,
			skipLlmForCachedResponses: true,
			disableMediaHeaders: true,
			fallbackToTemplates: true,
		};
	}

	/**
	 * Check if economic mode should be applied
	 */
	async shouldUseEconomicMode(accountId: number): Promise<boolean> {
		if (!this.config.enabled) return false;

		const economicFlag = await this.redis.get(`economic:${accountId}`);
		return economicFlag === "1";
	}

	/**
	 * Apply economic mode constraints to LLM context
	 */
	applyEconomicConstraints(context: LlmPromptContext): LlmPromptContext {
		if (!context.economicMode) return context;

		return {
			...context,
			// Truncate conversation history to save tokens
			conversationHistory: context.conversationHistory?.slice(-2), // Only last 2 messages
			// Add economic mode instruction
			userMessage: this.truncateMessage(context.userMessage, 100),
		};
	}

	/**
	 * Apply economic mode constraints to generated response
	 */
	applyResponseConstraints(response: DynamicGenerationResult, economicMode: boolean): DynamicGenerationResult {
		if (!economicMode) return response;

		return {
			text: this.truncateMessage(response.text, this.config.maxResponseLength),
			buttons: response.buttons?.slice(0, 2), // Max 2 buttons in economic mode
			// Remove header in economic mode to save space
			header: this.config.disableMediaHeaders ? undefined : response.header,
			footer: response.footer,
		};
	}

	/**
	 * Get cached response if available
	 */
	async getCachedResponse(text: string, channel: string, accountId: number): Promise<CacheEntry | null> {
		if (!this.config.skipLlmForCachedResponses) return null;

		const normalizedText = this.normalizeTextForCache(text);
		const cacheKey = this.generateCacheKey(normalizedText, channel, accountId);

		const cached = await this.redis.get(cacheKey);
		if (!cached) return null;

		const entry: CacheEntry = JSON.parse(cached);

		// Check if expired
		if (new Date() > new Date(entry.expiresAt)) {
			await this.redis.del(cacheKey);
			return null;
		}

		// Increment hit count
		entry.hitCount++;
		await this.redis.setex(cacheKey, 1800, JSON.stringify(entry)); // 30 min TTL

		log.info("Cache hit for LLM response", {
			accountId,
			channel,
			cacheKey: cacheKey.substring(0, 20) + "...",
			hitCount: entry.hitCount,
		});

		return entry;
	}

	/**
	 * Cache LLM response
	 */
	async cacheResponse(
		text: string,
		channel: string,
		accountId: number,
		response: DynamicGenerationResult,
		tokensUsed: number,
	): Promise<void> {
		const normalizedText = this.normalizeTextForCache(text);
		const cacheKey = this.generateCacheKey(normalizedText, channel, accountId);

		const entry: CacheEntry = {
			key: cacheKey,
			response,
			tokensUsed,
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 1800000), // 30 minutes
			hitCount: 0,
		};

		await this.redis.setex(cacheKey, 1800, JSON.stringify(entry));

		log.info("Cached LLM response", {
			accountId,
			channel,
			cacheKey: cacheKey.substring(0, 20) + "...",
			tokensUsed,
		});
	}

	/**
	 * Get economic mode prompt instructions
	 */
	getEconomicModePrompt(): string {
		return `
MODO ECONÔMICO ATIVO:
- Resposta máxima: ${this.config.maxResponseLength} caracteres
- Máximo 2 botões
- Seja conciso e direto
- Evite explicações longas
- Use linguagem simples
    `.trim();
	}

	/**
	 * Check if response should use template fallback
	 */
	shouldFallbackToTemplate(text: string, economicMode: boolean): { shouldFallback: boolean; templateType?: string } {
		if (!economicMode || !this.config.fallbackToTemplates) {
			return { shouldFallback: false };
		}

		// Common patterns that should use templates
		const patterns = [
			{ regex: /\b(oi|olá|bom dia|boa tarde|boa noite)\b/i, template: "greeting" },
			{ regex: /\b(obrigad[oa]|valeu|vlw)\b/i, template: "thanks" },
			{ regex: /\b(tchau|até logo|falou)\b/i, template: "goodbye" },
			{ regex: /\b(ajuda|help|socorro)\b/i, template: "help" },
		];

		for (const pattern of patterns) {
			if (pattern.regex.test(text)) {
				return { shouldFallback: true, templateType: pattern.template };
			}
		}

		return { shouldFallback: false };
	}

	/**
	 * Get template response for common patterns
	 */
	getTemplateResponse(templateType: string, channel: string): DynamicGenerationResult {
		const templates: Record<string, DynamicGenerationResult> = {
			greeting: {
				text: "Olá! Como posso ajudar?",
				buttons: [
					{ type: "reply", title: "Suporte", id: "intent:support" },
					{ type: "reply", title: "Vendas", id: "intent:sales" },
				],
			},
			thanks: {
				text: "De nada! Posso ajudar com mais alguma coisa?",
				buttons: [
					{ type: "reply", title: "Sim", id: "intent:help" },
					{ type: "reply", title: "Não", id: "intent:end" },
				],
			},
			goodbye: {
				text: "Até logo! Estarei aqui quando precisar.",
				buttons: [{ type: "reply", title: "Falar com atendente", id: "intent:human" }],
			},
			help: {
				text: "Estou aqui para ajudar! O que você precisa?",
				buttons: [
					{ type: "reply", title: "Suporte", id: "intent:support" },
					{ type: "reply", title: "Atendente", id: "intent:human" },
				],
			},
		};

		return templates[templateType] || templates.help;
	}

	/**
	 * Get cache statistics for monitoring
	 */
	async getCacheStats(accountId?: number): Promise<{
		totalEntries: number;
		hitRate: number;
		avgTokensSaved: number;
	}> {
		const pattern = accountId ? `llm_cache:*:*:${accountId}` : "llm_cache:*";
		const keys = await this.redis.keys(pattern);

		let totalHits = 0;
		let totalEntries = keys.length;
		let totalTokensSaved = 0;

		for (const key of keys) {
			const cached = await this.redis.get(key);
			if (cached) {
				const entry: CacheEntry = JSON.parse(cached);
				totalHits += entry.hitCount;
				totalTokensSaved += entry.tokensUsed * entry.hitCount;
			}
		}

		const hitRate = totalEntries > 0 ? totalHits / totalEntries : 0;
		const avgTokensSaved = totalEntries > 0 ? totalTokensSaved / totalEntries : 0;

		return {
			totalEntries,
			hitRate,
			avgTokensSaved,
		};
	}

	private truncateMessage(text: string, maxLength: number): string {
		if (text.length <= maxLength) return text;

		// Try to truncate at word boundary
		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(" ");

		if (lastSpace > maxLength * 0.8) {
			return truncated.substring(0, lastSpace) + "...";
		}

		return truncated + "...";
	}

	private normalizeTextForCache(text: string): string {
		return text
			.toLowerCase()
			.trim()
			.replace(/\s+/g, " ")
			.replace(/[^\w\s]/g, ""); // Remove punctuation
	}

	private generateCacheKey(text: string, channel: string, accountId: number): string {
		const hash = crypto.createHash("sha256").update(`${text}:${channel}:${accountId}`).digest("hex").substring(0, 16);

		return `llm_cache:${hash}:${channel}:${accountId}`;
	}
}
