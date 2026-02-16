/**
 * Request-Level Cost Tracking for SocialWise Flow
 * Implements cost calculation for embedding searches and LLM calls per request
 */

import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";
import { Provider, Unit } from "@prisma/client";
import { CostEventData, processCostEvent } from "./cost-worker";
import { pricingService } from "./pricing-service";

const costLogger = createLogger("SocialWise-RequestCost");

export interface RequestCostBreakdown {
	requestId: string;
	sessionId?: string;
	inboxId?: string;
	userId?: string;
	timestamp: Date;

	// Cost components
	embeddingCost: number;
	llmCosts: {
		classification?: number;
		warmupButtons?: number;
		microcopy?: number;
		shortTitles?: number;
		domainTopics?: number;
	};
	totalCost: number;
	currency: string;

	// Usage metrics
	embeddingTokens: number;
	llmTokens: {
		inputTokens: number;
		outputTokens: number;
		reasoningTokens?: number; // For GPT-5 models
	};

	// Performance metrics
	responseTimeMs: number;
	band: "HARD" | "SOFT" | "LOW" | "ROUTER";
	strategy: string;

	// Budget tracking
	budgetImpact: {
		dailyBudgetUsed: number;
		monthlyBudgetUsed: number;
		remainingDailyBudget: number;
		remainingMonthlyBudget: number;
	};
}

export interface CostOptimizationRecommendation {
	type: "embedding" | "llm" | "caching" | "degradation";
	priority: "high" | "medium" | "low";
	description: string;
	estimatedSavings: number;
	implementation: string;
}

export interface RequestCostConfig {
	enableDetailedTracking: boolean;
	enableBudgetAlerts: boolean;
	enableOptimizationRecommendations: boolean;
	costThresholds: {
		dailyBudget: number;
		monthlyBudget: number;
		alertThreshold: number; // Percentage of budget
	};
}

/**
 * Request-level cost tracker for SocialWise Flow
 */
export class RequestCostTracker {
	private prisma = getPrismaInstance();
	private redis = getRedisInstance();
	private requestCosts = new Map<string, Partial<RequestCostBreakdown>>();

	constructor(private config: RequestCostConfig) {}

	/**
	 * Start tracking costs for a new request
	 */
	async startRequest(
		requestId: string,
		context: {
			sessionId?: string;
			inboxId?: string;
			userId?: string;
			band?: "HARD" | "SOFT" | "LOW" | "ROUTER";
			strategy?: string;
		},
	): Promise<void> {
		const breakdown: Partial<RequestCostBreakdown> = {
			requestId,
			sessionId: context.sessionId,
			inboxId: context.inboxId,
			userId: context.userId,
			timestamp: new Date(),
			embeddingCost: 0,
			llmCosts: {},
			totalCost: 0,
			currency: "USD",
			embeddingTokens: 0,
			llmTokens: {
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
			},
			band: context.band,
			strategy: context.strategy,
		};

		this.requestCosts.set(requestId, breakdown);

		costLogger.debug("Started cost tracking for request", {
			requestId,
			sessionId: context.sessionId,
			inboxId: context.inboxId,
		});
	}

	/**
	 * Track embedding generation cost
	 */
	async trackEmbeddingCost(requestId: string, textLength: number, model = "text-embedding-3-small"): Promise<void> {
		const breakdown = this.requestCosts.get(requestId);
		if (!breakdown) {
			costLogger.warn("No cost tracking started for request", { requestId });
			return;
		}

		try {
			// Estimate tokens (roughly 4 characters per token)
			const estimatedTokens = Math.ceil(textLength / 4);

			// Get current pricing for embeddings
			const pricing = await pricingService.resolveUnitPrice(Provider.OPENAI, model, Unit.TOKENS_IN, new Date());

			if (pricing) {
				const cost = (estimatedTokens / 1_000_000) * pricing.pricePerUnit;
				breakdown.embeddingCost = (breakdown.embeddingCost || 0) + cost;
				breakdown.embeddingTokens = (breakdown.embeddingTokens || 0) + estimatedTokens;
				breakdown.totalCost = (breakdown.totalCost || 0) + cost;

				// Create cost event for detailed tracking
				if (this.config.enableDetailedTracking) {
					await this.createCostEvent({
						provider: Provider.OPENAI,
						product: model,
						unit: Unit.TOKENS_IN,
						units: estimatedTokens,
						requestId,
						sessionId: breakdown.sessionId,
						inboxId: breakdown.inboxId,
						userId: breakdown.userId,
						category: "embedding",
					});
				}

				costLogger.debug("Tracked embedding cost", {
					requestId,
					model,
					tokens: estimatedTokens,
					cost,
					totalCost: breakdown.totalCost,
				});
			}
		} catch (error) {
			costLogger.error("Failed to track embedding cost", {
				requestId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Track LLM call cost
	 */
	async trackLLMCost(
		requestId: string,
		operation: "classification" | "warmupButtons" | "microcopy" | "shortTitles" | "domainTopics",
		usage: {
			model: string;
			inputTokens: number;
			outputTokens: number;
			reasoningTokens?: number; // For GPT-5 models
		},
	): Promise<void> {
		const breakdown = this.requestCosts.get(requestId);
		if (!breakdown) {
			costLogger.warn("No cost tracking started for request", { requestId });
			return;
		}

		try {
			let totalCost = 0;

			// Calculate input token cost
			const inputPricing = await pricingService.resolveUnitPrice(
				Provider.OPENAI,
				usage.model,
				Unit.TOKENS_IN,
				new Date(),
			);

			if (inputPricing) {
				const inputCost = (usage.inputTokens / 1_000_000) * inputPricing.pricePerUnit;
				totalCost += inputCost;
			}

			// Calculate output token cost
			const outputPricing = await pricingService.resolveUnitPrice(
				Provider.OPENAI,
				usage.model,
				Unit.TOKENS_OUT,
				new Date(),
			);

			if (outputPricing) {
				const outputCost = (usage.outputTokens / 1_000_000) * outputPricing.pricePerUnit;
				totalCost += outputCost;
			}

			// Calculate reasoning token cost (GPT-5 models)
			// Note: TOKENS_REASONING not yet available in Prisma schema, using TOKENS_IN as fallback
			if (usage.reasoningTokens && usage.reasoningTokens > 0) {
				const reasoningPricing = await pricingService.resolveUnitPrice(
					Provider.OPENAI,
					usage.model,
					Unit.TOKENS_IN, // Fallback until TOKENS_REASONING is added to schema
					new Date(),
				);

				if (reasoningPricing) {
					const reasoningCost = (usage.reasoningTokens / 1_000_000) * reasoningPricing.pricePerUnit;
					totalCost += reasoningCost;
				}
			}

			// Update breakdown
			if (!breakdown.llmCosts) breakdown.llmCosts = {};
			breakdown.llmCosts[operation] = (breakdown.llmCosts[operation] || 0) + totalCost;
			breakdown.totalCost = (breakdown.totalCost || 0) + totalCost;

			// Update token counts
			if (!breakdown.llmTokens) {
				breakdown.llmTokens = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
			}
			breakdown.llmTokens.inputTokens += usage.inputTokens;
			breakdown.llmTokens.outputTokens += usage.outputTokens;
			if (usage.reasoningTokens) {
				breakdown.llmTokens.reasoningTokens = (breakdown.llmTokens.reasoningTokens || 0) + usage.reasoningTokens;
			}

			// Create detailed cost events
			if (this.config.enableDetailedTracking) {
				await this.createCostEvent({
					provider: Provider.OPENAI,
					product: usage.model,
					unit: Unit.TOKENS_IN,
					units: usage.inputTokens,
					requestId,
					sessionId: breakdown.sessionId,
					inboxId: breakdown.inboxId,
					userId: breakdown.userId,
					category: `llm_${operation}_input`,
				});

				await this.createCostEvent({
					provider: Provider.OPENAI,
					product: usage.model,
					unit: Unit.TOKENS_OUT,
					units: usage.outputTokens,
					requestId,
					sessionId: breakdown.sessionId,
					inboxId: breakdown.inboxId,
					userId: breakdown.userId,
					category: `llm_${operation}_output`,
				});

				if (usage.reasoningTokens && usage.reasoningTokens > 0) {
					await this.createCostEvent({
						provider: Provider.OPENAI,
						product: usage.model,
						unit: Unit.TOKENS_IN, // Fallback until TOKENS_REASONING is added
						units: usage.reasoningTokens,
						requestId,
						sessionId: breakdown.sessionId,
						inboxId: breakdown.inboxId,
						userId: breakdown.userId,
						category: `llm_${operation}_reasoning`,
					});
				}
			}

			costLogger.debug("Tracked LLM cost", {
				requestId,
				operation,
				model: usage.model,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				reasoningTokens: usage.reasoningTokens,
				cost: totalCost,
				totalCost: breakdown.totalCost,
			});
		} catch (error) {
			costLogger.error("Failed to track LLM cost", {
				requestId,
				operation,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Finalize request cost tracking
	 */
	async finalizeRequest(requestId: string, responseTimeMs: number): Promise<RequestCostBreakdown | null> {
		const breakdown = this.requestCosts.get(requestId);
		if (!breakdown) {
			costLogger.warn("No cost tracking found for request", { requestId });
			return null;
		}

		try {
			// Complete the breakdown
			breakdown.responseTimeMs = responseTimeMs;

			// Calculate budget impact
			if (breakdown.userId && this.config.enableBudgetAlerts) {
				breakdown.budgetImpact = await this.calculateBudgetImpact(breakdown.userId, breakdown.totalCost || 0);
			}

			// Store final breakdown
			const finalBreakdown = breakdown as RequestCostBreakdown;

			if (this.config.enableDetailedTracking) {
				await this.storeRequestCostBreakdown(finalBreakdown);
			}

			// Check for budget alerts
			if (this.config.enableBudgetAlerts && breakdown.budgetImpact) {
				await this.checkBudgetAlerts(breakdown.userId!, breakdown.budgetImpact);
			}

			// Generate optimization recommendations
			if (this.config.enableOptimizationRecommendations) {
				const recommendations = await this.generateOptimizationRecommendations(finalBreakdown);
				if (recommendations.length > 0) {
					costLogger.info("Cost optimization recommendations generated", {
						requestId,
						recommendationCount: recommendations.length,
						totalCost: finalBreakdown.totalCost,
					});
				}
			}

			// Clean up tracking data
			this.requestCosts.delete(requestId);

			costLogger.info("Finalized request cost tracking", {
				requestId,
				totalCost: finalBreakdown.totalCost,
				responseTimeMs,
				band: finalBreakdown.band,
			});

			return finalBreakdown;
		} catch (error) {
			costLogger.error("Failed to finalize request cost tracking", {
				requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	/**
	 * Create cost event for detailed tracking
	 */
	private async createCostEvent(data: {
		provider: Provider;
		product: string;
		unit: Unit;
		units: number;
		requestId: string;
		sessionId?: string;
		inboxId?: string;
		userId?: string;
		category: string;
	}): Promise<void> {
		const costEventData: CostEventData = {
			ts: new Date().toISOString(),
			provider: data.provider,
			product: data.product,
			unit: data.unit,
			units: data.units,
			externalId: data.requestId,
			traceId: data.requestId,
			sessionId: data.sessionId,
			inboxId: data.inboxId,
			userId: data.userId,
			raw: {
				category: data.category,
				requestId: data.requestId,
			},
		};

		await processCostEvent(costEventData);
	}

	/**
	 * Calculate budget impact for user
	 */
	private async calculateBudgetImpact(
		userId: string,
		requestCost: number,
	): Promise<RequestCostBreakdown["budgetImpact"]> {
		try {
			const today = new Date();
			const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
			const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

			// Get daily usage
			const dailyUsage = await this.prisma.costEvent.aggregate({
				where: {
					userId,
					ts: { gte: startOfDay },
					status: "PRICED",
				},
				_sum: { cost: true },
			});

			// Get monthly usage
			const monthlyUsage = await this.prisma.costEvent.aggregate({
				where: {
					userId,
					ts: { gte: startOfMonth },
					status: "PRICED",
				},
				_sum: { cost: true },
			});

			const dailyUsed = Number(dailyUsage._sum.cost || 0) + requestCost;
			const monthlyUsed = Number(monthlyUsage._sum.cost || 0) + requestCost;

			return {
				dailyBudgetUsed: dailyUsed,
				monthlyBudgetUsed: monthlyUsed,
				remainingDailyBudget: Math.max(0, this.config.costThresholds.dailyBudget - dailyUsed),
				remainingMonthlyBudget: Math.max(0, this.config.costThresholds.monthlyBudget - monthlyUsed),
			};
		} catch (error) {
			costLogger.error("Failed to calculate budget impact", {
				userId,
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				dailyBudgetUsed: 0,
				monthlyBudgetUsed: 0,
				remainingDailyBudget: this.config.costThresholds.dailyBudget,
				remainingMonthlyBudget: this.config.costThresholds.monthlyBudget,
			};
		}
	}

	/**
	 * Check for budget alerts
	 */
	private async checkBudgetAlerts(userId: string, budgetImpact: RequestCostBreakdown["budgetImpact"]): Promise<void> {
		const alertThreshold = this.config.costThresholds.alertThreshold / 100;

		// Check daily budget
		const dailyUsagePercent = budgetImpact.dailyBudgetUsed / this.config.costThresholds.dailyBudget;
		if (dailyUsagePercent >= alertThreshold) {
			costLogger.warn("Daily budget alert triggered", {
				userId,
				usagePercent: dailyUsagePercent * 100,
				used: budgetImpact.dailyBudgetUsed,
				budget: this.config.costThresholds.dailyBudget,
			});
		}

		// Check monthly budget
		const monthlyUsagePercent = budgetImpact.monthlyBudgetUsed / this.config.costThresholds.monthlyBudget;
		if (monthlyUsagePercent >= alertThreshold) {
			costLogger.warn("Monthly budget alert triggered", {
				userId,
				usagePercent: monthlyUsagePercent * 100,
				used: budgetImpact.monthlyBudgetUsed,
				budget: this.config.costThresholds.monthlyBudget,
			});
		}
	}

	/**
	 * Store request cost breakdown in database
	 */
	private async storeRequestCostBreakdown(breakdown: RequestCostBreakdown): Promise<void> {
		try {
			// Store in Redis for now until Prisma schema is updated
			const redis = getRedisInstance();
			const cacheKey = `request_cost:${breakdown.requestId}`;
			await redis.setex(cacheKey, 86400, JSON.stringify(breakdown)); // 24h TTL

			// TODO: Uncomment when Prisma schema includes requestCostBreakdown model
			// await this.prisma.requestCostBreakdown.create({
			//   data: {
			//     requestId: breakdown.requestId,
			//     sessionId: breakdown.sessionId,
			//     inboxId: breakdown.inboxId,
			//     userId: breakdown.userId,
			//     timestamp: breakdown.timestamp,
			//     embeddingCost: breakdown.embeddingCost,
			//     llmCosts: breakdown.llmCosts as any,
			//     totalCost: breakdown.totalCost,
			//     currency: breakdown.currency,
			//     embeddingTokens: breakdown.embeddingTokens,
			//     llmTokens: breakdown.llmTokens as any,
			//     responseTimeMs: breakdown.responseTimeMs,
			//     band: breakdown.band,
			//     strategy: breakdown.strategy,
			//     budgetImpact: breakdown.budgetImpact as any
			//   }
			// });
		} catch (error) {
			costLogger.error("Failed to store request cost breakdown", {
				requestId: breakdown.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Generate cost optimization recommendations
	 */
	private async generateOptimizationRecommendations(
		breakdown: RequestCostBreakdown,
	): Promise<CostOptimizationRecommendation[]> {
		const recommendations: CostOptimizationRecommendation[] = [];

		// High embedding costs
		if (breakdown.embeddingCost > breakdown.totalCost * 0.3) {
			recommendations.push({
				type: "embedding",
				priority: "medium",
				description:
					"Embedding costs are high relative to total request cost. Consider caching embeddings or using smaller models.",
				estimatedSavings: breakdown.embeddingCost * 0.5,
				implementation: "Implement embedding caching with 24h TTL or switch to text-embedding-3-small model",
			});
		}

		// High LLM costs
		const totalLLMCost = Object.values(breakdown.llmCosts).reduce((sum, cost) => sum + (cost || 0), 0);
		if (totalLLMCost > breakdown.totalCost * 0.7) {
			recommendations.push({
				type: "llm",
				priority: "high",
				description: "LLM costs dominate request cost. Consider using smaller models or reducing token usage.",
				estimatedSavings: totalLLMCost * 0.3,
				implementation: "Use gpt-5-nano instead of gpt-5, reduce max_tokens, or implement better caching",
			});
		}

		// Slow response times
		if (breakdown.responseTimeMs > 1000) {
			recommendations.push({
				type: "caching",
				priority: "high",
				description: "Response time is slow. Implement aggressive caching to reduce repeated computations.",
				estimatedSavings: breakdown.totalCost * 0.4,
				implementation: "Cache classification results and warmup buttons with appropriate TTLs",
			});
		}

		// SOFT band optimization
		if (breakdown.band === "SOFT" && breakdown.llmCosts.warmupButtons && breakdown.llmCosts.shortTitles) {
			const softCost = (breakdown.llmCosts.warmupButtons || 0) + (breakdown.llmCosts.shortTitles || 0);
			if (softCost > breakdown.totalCost * 0.5) {
				recommendations.push({
					type: "degradation",
					priority: "medium",
					description: "SOFT band processing is expensive. Consider degrading to deterministic responses under load.",
					estimatedSavings: softCost * 0.6,
					implementation: "Implement concurrency limits and degrade to humanized fallback buttons",
				});
			}
		}

		return recommendations;
	}

	/**
	 * Get cost analytics for user
	 */
	async getCostAnalytics(
		userId: string,
		timeRange: { start: Date; end: Date },
	): Promise<{
		totalCost: number;
		requestCount: number;
		averageCostPerRequest: number;
		costByBand: Record<string, number>;
		costByOperation: Record<string, number>;
		topCostlyRequests: Array<{ requestId: string; cost: number; timestamp: Date }>;
	}> {
		try {
			// For now, get analytics from Redis cache until Prisma schema is updated
			const redis = getRedisInstance();
			const keys = await redis.keys(`request_cost:*`);
			const breakdowns: RequestCostBreakdown[] = [];

			for (const key of keys) {
				try {
					const data = await redis.get(key);
					if (data) {
						const breakdown = JSON.parse(data) as RequestCostBreakdown;
						if (
							breakdown.userId === userId &&
							breakdown.timestamp >= timeRange.start &&
							breakdown.timestamp <= timeRange.end
						) {
							breakdowns.push(breakdown);
						}
					}
				} catch (parseError) {
					// Skip invalid entries
					continue;
				}
			}

			// Sort by cost descending
			breakdowns.sort((a, b) => b.totalCost - a.totalCost);

			const totalCost = breakdowns.reduce((sum: number, b: RequestCostBreakdown) => sum + b.totalCost, 0);
			const requestCount = breakdowns.length;
			const averageCostPerRequest = requestCount > 0 ? totalCost / requestCount : 0;

			const costByBand: Record<string, number> = {};
			const costByOperation: Record<string, number> = {};

			for (const breakdown of breakdowns) {
				// Cost by band
				if (breakdown.band) {
					costByBand[breakdown.band] = (costByBand[breakdown.band] || 0) + breakdown.totalCost;
				}

				// Cost by operation
				const llmCosts = breakdown.llmCosts || {};
				for (const [operation, cost] of Object.entries(llmCosts)) {
					if (typeof cost === "number") {
						costByOperation[operation] = (costByOperation[operation] || 0) + cost;
					}
				}
			}

			const topCostlyRequests = breakdowns.slice(0, 10).map((b: RequestCostBreakdown) => ({
				requestId: b.requestId,
				cost: b.totalCost,
				timestamp: b.timestamp,
			}));

			return {
				totalCost,
				requestCount,
				averageCostPerRequest,
				costByBand,
				costByOperation,
				topCostlyRequests,
			};
		} catch (error) {
			costLogger.error("Failed to get cost analytics", {
				userId,
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				totalCost: 0,
				requestCount: 0,
				averageCostPerRequest: 0,
				costByBand: {},
				costByOperation: {},
				topCostlyRequests: [],
			};
		}
	}
}

/**
 * Create request cost tracker with default configuration
 */
export function createRequestCostTracker(overrides: Partial<RequestCostConfig> = {}): RequestCostTracker {
	const defaultConfig: RequestCostConfig = {
		enableDetailedTracking: true,
		enableBudgetAlerts: true,
		enableOptimizationRecommendations: true,
		costThresholds: {
			dailyBudget: 10.0, // $10 per day
			monthlyBudget: 200.0, // $200 per month
			alertThreshold: 80, // 80% of budget
		},
		...overrides,
	};

	return new RequestCostTracker(defaultConfig);
}
