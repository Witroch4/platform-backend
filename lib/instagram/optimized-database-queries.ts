/**
 * Optimized Database Queries for Instagram Translation
 *
 * This module provides optimized database queries with caching, connection pooling,
 * and performance monitoring specifically for Instagram message translation.
 */

import { getPrismaInstance } from "@/lib/connections";
import { CompleteMessageMapping } from "../dialogflow-database-queries";
import {
	instagramTemplateCache,
	getCachedTemplateMapping,
	setCachedTemplateMapping,
	recordQueryPerformance,
} from "../cache/instagram-template-cache";

// Connection pool configuration
const POOL_CONFIG = {
	maxConnections: 10,
	minConnections: 2,
	acquireTimeoutMillis: 30000,
	createTimeoutMillis: 30000,
	destroyTimeoutMillis: 5000,
	idleTimeoutMillis: 30000,
	reapIntervalMillis: 1000,
	createRetryIntervalMillis: 200,
};

// Query performance thresholds
const PERFORMANCE_THRESHOLDS = {
	SLOW_QUERY_MS: 1000, // Queries taking longer than 1 second are considered slow
	VERY_SLOW_QUERY_MS: 3000, // Queries taking longer than 3 seconds are very slow
	CACHE_MISS_THRESHOLD: 50, // Cache hit rate below 50% triggers warnings
};

// Prisma client with optimized configuration
import { PrismaClient } from "@prisma/client";
const prisma = getPrismaInstance();

// Query performance monitoring
interface QueryMetrics {
	queryName: string;
	executionTime: number;
	cacheHit: boolean;
	timestamp: Date;
	parameters?: any;
}

class QueryPerformanceMonitor {
	private metrics: QueryMetrics[] = [];
	private readonly MAX_METRICS = 1000;

	recordQuery(metrics: QueryMetrics): void {
		this.metrics.push(metrics);

		// Keep only recent metrics
		if (this.metrics.length > this.MAX_METRICS) {
			this.metrics.shift();
		}

		// Log slow queries
		if (metrics.executionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
			console.warn(`[Instagram DB] Slow query detected: ${metrics.queryName}`, {
				executionTime: metrics.executionTime,
				cacheHit: metrics.cacheHit,
				parameters: metrics.parameters,
			});
		}

		// Record in cache for monitoring
		recordQueryPerformance(
			metrics.queryName,
			metrics.executionTime,
			metrics.executionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS,
		).catch((error) => {
			console.error("[Instagram DB] Error recording query performance:", error);
		});
	}

	getAverageExecutionTime(queryName?: string): number {
		const relevantMetrics = queryName ? this.metrics.filter((m) => m.queryName === queryName) : this.metrics;

		if (relevantMetrics.length === 0) return 0;

		const totalTime = relevantMetrics.reduce((sum, m) => sum + m.executionTime, 0);
		return totalTime / relevantMetrics.length;
	}

	getCacheHitRate(queryName?: string): number {
		const relevantMetrics = queryName ? this.metrics.filter((m) => m.queryName === queryName) : this.metrics;

		if (relevantMetrics.length === 0) return 0;

		const cacheHits = relevantMetrics.filter((m) => m.cacheHit).length;
		return (cacheHits / relevantMetrics.length) * 100;
	}

	getSlowQueryCount(queryName?: string): number {
		const relevantMetrics = queryName ? this.metrics.filter((m) => m.queryName === queryName) : this.metrics;

		return relevantMetrics.filter((m) => m.executionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS).length;
	}

	getPerformanceReport(): {
		totalQueries: number;
		averageExecutionTime: number;
		cacheHitRate: number;
		slowQueries: number;
		verySlowQueries: number;
		queryBreakdown: Array<{
			queryName: string;
			count: number;
			averageTime: number;
			cacheHitRate: number;
			slowCount: number;
		}>;
	} {
		const queryGroups = new Map<string, QueryMetrics[]>();

		// Group metrics by query name
		for (const metric of this.metrics) {
			if (!queryGroups.has(metric.queryName)) {
				queryGroups.set(metric.queryName, []);
			}
			queryGroups.get(metric.queryName)!.push(metric);
		}

		const queryBreakdown = Array.from(queryGroups.entries()).map(([queryName, metrics]) => ({
			queryName,
			count: metrics.length,
			averageTime: metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length,
			cacheHitRate: (metrics.filter((m) => m.cacheHit).length / metrics.length) * 100,
			slowCount: metrics.filter((m) => m.executionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS).length,
		}));

		return {
			totalQueries: this.metrics.length,
			averageExecutionTime: this.getAverageExecutionTime(),
			cacheHitRate: this.getCacheHitRate(),
			slowQueries: this.getSlowQueryCount(),
			verySlowQueries: this.metrics.filter((m) => m.executionTime > PERFORMANCE_THRESHOLDS.VERY_SLOW_QUERY_MS).length,
			queryBreakdown,
		};
	}
}

const queryMonitor = new QueryPerformanceMonitor();

// Enhanced error handling for database operations
class DatabaseError extends Error {
	constructor(
		message: string,
		public queryName: string,
		public executionTime: number,
		public originalError?: Error,
	) {
		super(message);
		this.name = "DatabaseError";
	}
}

/**
 * Optimized template mapping query with caching and performance monitoring
 */
export async function findOptimizedCompleteMessageMapping(
	intentName: string,
	inboxId: string,
): Promise<CompleteMessageMapping | null> {
	const queryName = "findOptimizedCompleteMessageMapping";
	const startTime = Date.now();
	let cacheHit = false;
	// usuarioChatwitId needs to be available across try/catch scopes
	let usuarioChatwitId: string | null = null;

	try {
		// Try cache first - we need to get the usuarioChatwitId first for the cache key
		// For now, we'll skip cache on first attempt and get it from DB, then cache with proper key
		let cached: CompleteMessageMapping | null = null;

		console.log(`[Instagram DB] [DEBUG] Starting optimized query for template mapping:`, {
			intentName,
			inboxId,
			operation: "findOptimizedCompleteMessageMapping",
			step: "initial_lookup",
		});

		// Quick lookup to get usuarioChatwitId for cache key
		const quickInboxLookup = await prisma.chatwitInbox.findFirst({
			where: { inboxId: String(inboxId) },
			select: { usuarioChatwitId: true },
		});

		if (quickInboxLookup) {
			usuarioChatwitId = quickInboxLookup.usuarioChatwitId;

			console.log(`[Instagram DB] [DEBUG] User context resolved for cache lookup:`, {
				intentName,
				inboxId,
				usuarioChatwitId,
				cacheKeyFormat: `${intentName}:${usuarioChatwitId}:${inboxId}`,
			});

			cached = await getCachedTemplateMapping(intentName, usuarioChatwitId, inboxId);
		} else {
			console.log(`[Instagram DB] [DEBUG] No ChatwitInbox found for quick lookup:`, {
				intentName,
				inboxId,
				reason: "Unable to resolve usuarioChatwitId for cache key",
			});
		}

		if (cached) {
			cacheHit = true;
			const executionTime = Date.now() - startTime;

			queryMonitor.recordQuery({
				queryName,
				executionTime,
				cacheHit: true,
				timestamp: new Date(),
				parameters: { intentName, inboxId, usuarioChatwitId },
			});

			console.log(`[Instagram DB] [CACHE_HIT] Cache hit for template mapping:`, {
				userContext: { usuarioChatwitId, inboxId },
				intentName,
				executionTime,
				cacheKey: `${intentName}:${usuarioChatwitId}:${inboxId}`,
				messageType: cached.messageType,
			});

			return cached;
		}

		// Cache miss - query database with optimized query
		console.log(`[Instagram DB] [CACHE_MISS] Cache miss, querying database:`, {
			userContext: { usuarioChatwitId, inboxId },
			intentName,
			reason: cached === null ? "No cached data found" : "Cache lookup failed",
			step: "database_query",
		});

		const inboxIdString = String(inboxId);

		// Optimized query with selective includes to reduce data transfer
		const chatwitInbox = await prisma.chatwitInbox.findFirst({
			where: {
				inboxId: inboxIdString,
			},
			select: {
				id: true,
				nome: true,
				whatsappApiKey: true,
				phoneNumberId: true,
				whatsappBusinessAccountId: true,
				usuarioChatwit: {
					select: {
						id: true,
						configuracaoGlobalWhatsApp: {
							select: {
								phoneNumberId: true,
								whatsappApiKey: true,
								whatsappBusinessAccountId: true,
								graphApiBaseUrl: true,
							},
						},
					},
				},
			},
		});

		if (!chatwitInbox) {
			const executionTime = Date.now() - startTime;
			queryMonitor.recordQuery({
				queryName,
				executionTime,
				cacheHit: false,
				timestamp: new Date(),
				parameters: { intentName, inboxId, result: "no_inbox" },
			});

			console.log(`[Instagram DB] [ERROR] No ChatwitInbox found:`, {
				intentName,
				inboxId: inboxIdString,
				executionTime,
				error: "ChatwitInbox not found",
				step: "inbox_lookup",
			});
			return null;
		}

		// Optimized mapping query with selective includes
		let mapping = await prisma.mapeamentoIntencao.findUnique({
			where: {
				intentName_inboxId: {
					intentName,
					inboxId: chatwitInbox.id,
				},
			},
			select: {
				id: true,
				intentName: true,
				inboxId: true,
				template: {
					select: {
						id: true,
						name: true,
						type: true,
						scope: true,
						description: true,
						language: true,
						simpleReplyText: true,
						interactiveContent: {
							select: {
								id: true,
								header: {
									select: {
										type: true,
										content: true,
									},
								},
								body: {
									select: {
										text: true,
									},
								},
								footer: {
									select: {
										text: true,
									},
								},
								actionCtaUrl: {
									select: {
										displayText: true,
										url: true,
									},
								},
								actionReplyButton: {
									select: {
										buttons: true,
									},
								},
								actionList: {
									select: {
										buttonText: true,
										sections: true,
									},
								},
								actionFlow: {
									select: {
										flowId: true,
										flowCta: true,
										flowMode: true,
										flowData: true,
									},
								},
								actionLocationRequest: {
									select: {
										requestText: true,
									},
								},
							},
						},
						whatsappOfficialInfo: {
							select: {
								templateId: true,
								metaTemplateId: true,
								status: true,
								category: true,
								components: true,
								qualityScore: true,
							},
						},
					},
				},
			},
		});

		// Fallback: tentar busca case-insensitive se não encontrado (ex.: 'OAB' vs 'oab')
		if (!mapping) {
			console.log(`[Instagram DB] [DEBUG] No exact mapping found, trying case-insensitive match`, {
				intentName,
				inboxId: inboxIdString,
			});
			mapping = await prisma.mapeamentoIntencao.findFirst({
				where: {
					inboxId: chatwitInbox.id,
					intentName: { equals: intentName, mode: "insensitive" },
				},
				select: {
					id: true,
					intentName: true,
					inboxId: true,
					template: {
						select: {
							id: true,
							name: true,
							type: true,
							scope: true,
							description: true,
							language: true,
							simpleReplyText: true,
							interactiveContent: {
								select: {
									id: true,
									header: { select: { type: true, content: true } },
									body: { select: { text: true } },
									footer: { select: { text: true } },
									actionCtaUrl: { select: { displayText: true, url: true } },
									actionReplyButton: { select: { buttons: true } },
									actionList: { select: { buttonText: true, sections: true } },
									actionFlow: { select: { flowId: true, flowCta: true, flowMode: true, flowData: true } },
									actionLocationRequest: { select: { requestText: true } },
								},
							},
							whatsappOfficialInfo: {
								select: {
									templateId: true,
									metaTemplateId: true,
									status: true,
									category: true,
									components: true,
									qualityScore: true,
								},
							},
						},
					},
				},
			});
		}

		// Importante: NÃO usar aproximação por prefixo para não confundir intents distintas (ex.: 'oab' ≠ 'oab - pix')

		const executionTime = Date.now() - startTime;

		if (!mapping) {
			queryMonitor.recordQuery({
				queryName,
				executionTime,
				cacheHit: false,
				timestamp: new Date(),
				parameters: { intentName, inboxId, usuarioChatwitId: chatwitInbox.usuarioChatwit.id, result: "no_mapping" },
			});

			console.log(`[Instagram DB] [ERROR] No mapping found:`, {
				userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwit.id, inboxId: inboxIdString },
				intentName,
				executionTime,
				error: "MapeamentoIntencao not found",
				step: "mapping_lookup",
			});
			return null;
		}

		// Se não há template associado (pode ser um flow), retornar null
		if (!mapping.template) {
			console.log(`[Instagram DB] [INFO] MapeamentoIntencao found but no template (may have flowId):`, {
				userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwit.id, inboxId: inboxIdString },
				intentName,
				mappingId: mapping.id,
				step: "template_check",
			});
			return null;
		}

		// Build optimized WhatsApp config
		const whatsappConfig = buildOptimizedWhatsAppConfig(chatwitInbox);

		// Build result based on template type
		const result: CompleteMessageMapping = {
			id: mapping.id,
			intentName: mapping.intentName,
			caixaEntradaId: mapping.inboxId,
			usuarioChatwitId: chatwitInbox.usuarioChatwit.id,
			messageType: getOptimizedTemplateMessageType(mapping.template),
			whatsappConfig,
		};

		// Add template data based on type
		if (mapping.template.type === "WHATSAPP_OFFICIAL" && mapping.template.whatsappOfficialInfo) {
			result.messageType = "unified_template";
			result.unifiedTemplate = {
				id: mapping.template.id,
				name: mapping.template.name,
				type: mapping.template.type,
				scope: mapping.template.scope,
				description: mapping.template.description || undefined,
				language: mapping.template.language,
				interactiveContent: mapping.template.interactiveContent,
				whatsappOfficialInfo: mapping.template.whatsappOfficialInfo,
			};
		} else if (mapping.template.type === "INTERACTIVE_MESSAGE" && mapping.template.interactiveContent) {
			result.messageType = "unified_template";
			result.unifiedTemplate = {
				id: mapping.template.id,
				name: mapping.template.name,
				type: mapping.template.type,
				scope: mapping.template.scope,
				description: mapping.template.description || undefined,
				language: mapping.template.language,
				interactiveContent: mapping.template.interactiveContent,
				whatsappOfficialInfo: mapping.template.whatsappOfficialInfo,
			};
		} else if (mapping.template.type === "AUTOMATION_REPLY" && mapping.template.simpleReplyText) {
			result.messageType = "unified_template";
			result.unifiedTemplate = {
				id: mapping.template.id,
				name: mapping.template.name,
				type: mapping.template.type,
				scope: mapping.template.scope,
				description: mapping.template.description || undefined,
				language: mapping.template.language,
				simpleReplyText: mapping.template.simpleReplyText,
				interactiveContent: null,
				whatsappOfficialInfo: null,
			};
		} else {
			queryMonitor.recordQuery({
				queryName,
				executionTime,
				cacheHit: false,
				timestamp: new Date(),
				parameters: { intentName, inboxId, usuarioChatwitId: result.usuarioChatwitId, result: "invalid_template" },
			});

			console.log(`[Instagram DB] [ERROR] Template found but no valid content:`, {
				userContext: { usuarioChatwitId: result.usuarioChatwitId, inboxId },
				intentName,
				mappingId: mapping.id,
				templateType: mapping.template.type,
				executionTime,
				error: "Template has no valid content for conversion",
				step: "template_validation",
			});
			return null;
		}

		// Cache the result for future use
		console.log(`[Instagram DB] [DEBUG] Caching template mapping result:`, {
			userContext: { usuarioChatwitId: result.usuarioChatwitId, inboxId },
			intentName,
			cacheKey: `${intentName}:${result.usuarioChatwitId}:${inboxId}`,
			messageType: result.messageType,
			step: "cache_result",
		});

		await setCachedTemplateMapping(intentName, result.usuarioChatwitId, inboxId, result);

		queryMonitor.recordQuery({
			queryName,
			executionTime,
			cacheHit: false,
			timestamp: new Date(),
			parameters: {
				intentName,
				inboxId,
				usuarioChatwitId: result.usuarioChatwitId,
				result: "success",
				messageType: result.messageType,
			},
		});

		console.log(`[Instagram DB] [SUCCESS] Template mapping found and cached:`, {
			userContext: { usuarioChatwitId: result.usuarioChatwitId, inboxId },
			intentName,
			cacheKey: `${intentName}:${result.usuarioChatwitId}:${inboxId}`,
			executionTime,
			messageType: result.messageType,
			templateType: mapping.template.type,
			mappingId: result.id,
			step: "success",
		});

		return result;
	} catch (error) {
		const executionTime = Date.now() - startTime;

		queryMonitor.recordQuery({
			queryName,
			executionTime,
			cacheHit,
			timestamp: new Date(),
			parameters: {
				intentName,
				inboxId,
				usuarioChatwitId,
				error: error instanceof Error ? error.message : "Unknown error",
			},
		});

		console.error(`[Instagram DB] [ERROR] Error in optimized template mapping query:`, {
			userContext: { usuarioChatwitId, inboxId },
			intentName,
			executionTime,
			cacheHit,
			error:
				error instanceof Error
					? {
							message: error.message,
							name: error.name,
							stack: error.stack,
						}
					: error,
			operation: queryName,
			step: "error_handling",
		});

		throw new DatabaseError(
			`Failed to find template mapping for ${intentName}:${usuarioChatwitId}:${inboxId}`,
			queryName,
			executionTime,
			error instanceof Error ? error : undefined,
		);
	}
}

/**
 * Batch query for multiple template mappings with optimized caching
 */
export async function findBatchOptimizedTemplateMappings(
	requests: Array<{ intentName: string; inboxId: string }>,
): Promise<Map<string, CompleteMessageMapping | null>> {
	const queryName = "findBatchOptimizedTemplateMappings";
	const startTime = Date.now();
	const results = new Map<string, CompleteMessageMapping | null>();

	try {
		// Try batch cache lookup first
		const cacheResults = await instagramTemplateCache.batchGetTemplateMappings(requests);
		const cacheMisses: Array<{ intentName: string; inboxId: string }> = [];

		// Separate cache hits from misses
		for (const request of requests) {
			const cacheKey = `${request.intentName}:${request.inboxId}`;
			const cached = cacheResults.get(cacheKey);

			if (cached) {
				results.set(cacheKey, cached);
			} else {
				cacheMisses.push(request);
			}
		}

		console.log(`[Instagram DB] Batch query: ${results.size} cache hits, ${cacheMisses.length} cache misses`);

		// Query database for cache misses
		if (cacheMisses.length > 0) {
			const dbResults = await Promise.allSettled(
				cacheMisses.map((request) => findOptimizedCompleteMessageMapping(request.intentName, request.inboxId)),
			);

			// Process database results
			for (let i = 0; i < cacheMisses.length; i++) {
				const request = cacheMisses[i];
				const cacheKey = `${request.intentName}:${request.inboxId}`;
				const dbResult = dbResults[i];

				if (dbResult.status === "fulfilled") {
					results.set(cacheKey, dbResult.value);
				} else {
					console.error(`[Instagram DB] Batch query failed for ${cacheKey}:`, dbResult.reason);
					results.set(cacheKey, null);
				}
			}
		}

		const executionTime = Date.now() - startTime;

		queryMonitor.recordQuery({
			queryName,
			executionTime,
			cacheHit: cacheMisses.length === 0,
			timestamp: new Date(),
			parameters: {
				totalRequests: requests.length,
				cacheHits: results.size - cacheMisses.length,
				cacheMisses: cacheMisses.length,
			},
		});

		console.log(`[Instagram DB] Batch query completed`, {
			totalRequests: requests.length,
			cacheHits: results.size - cacheMisses.length,
			cacheMisses: cacheMisses.length,
			executionTime,
		});

		return results;
	} catch (error) {
		const executionTime = Date.now() - startTime;

		queryMonitor.recordQuery({
			queryName,
			executionTime,
			cacheHit: false,
			timestamp: new Date(),
			parameters: {
				totalRequests: requests.length,
				error: error instanceof Error ? error.message : "Unknown error",
			},
		});

		console.error(`[Instagram DB] Batch query error:`, {
			totalRequests: requests.length,
			executionTime,
			error: error instanceof Error ? error.message : "Unknown error",
		});

		throw new DatabaseError(
			`Batch template mapping query failed`,
			queryName,
			executionTime,
			error instanceof Error ? error : undefined,
		);
	}
}

/**
 * Optimized WhatsApp config builder with minimal data transfer
 */
function buildOptimizedWhatsAppConfig(chatwitInbox: any): CompleteMessageMapping["whatsappConfig"] {
	// Priority 1: ChatwitInbox specific credentials
	if (chatwitInbox.whatsappApiKey && chatwitInbox.phoneNumberId && chatwitInbox.whatsappBusinessAccountId) {
		return {
			phoneNumberId: chatwitInbox.phoneNumberId,
			whatsappToken: chatwitInbox.whatsappApiKey,
			whatsappBusinessAccountId: chatwitInbox.whatsappBusinessAccountId,
			fbGraphApiBase: "https://graph.facebook.com/v22.0",
		};
	}

	// Priority 2: WhatsAppGlobalConfig fallback
	if (chatwitInbox.usuarioChatwit?.configuracaoGlobalWhatsApp) {
		const globalConfig = chatwitInbox.usuarioChatwit.configuracaoGlobalWhatsApp;
		return {
			phoneNumberId: globalConfig.phoneNumberId,
			whatsappToken: globalConfig.whatsappApiKey,
			whatsappBusinessAccountId: globalConfig.whatsappBusinessAccountId,
			fbGraphApiBase: globalConfig.graphApiBaseUrl || "https://graph.facebook.com/v22.0",
		};
	}

	// Priority 3: Environment variables (last resort)
	return {
		phoneNumberId: process.env.FROM_PHONE_NUMBER_ID || "",
		whatsappToken: process.env.WHATSAPP_TOKEN || "",
		whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || "",
		fbGraphApiBase: "https://graph.facebook.com/v22.0",
	};
}

/**
 * Optimized template message type determination
 */
function getOptimizedTemplateMessageType(template: any): CompleteMessageMapping["messageType"] {
	if (!template) return "template";

	switch (template.type) {
		case "WHATSAPP_OFFICIAL":
			return "unified_template";
		case "INTERACTIVE_MESSAGE":
			return "unified_template";
		case "AUTOMATION_REPLY":
			return "unified_template";
		default:
			return "template";
	}
}

/**
 * Connection pool health check
 */
export async function checkDatabaseConnectionHealth(): Promise<{
	isHealthy: boolean;
	latency: number;
	activeConnections?: number;
	error?: string;
}> {
	const startTime = Date.now();

	try {
		await prisma.$queryRaw`SELECT 1`;
		const latency = Date.now() - startTime;

		return {
			isHealthy: true,
			latency,
		};
	} catch (error) {
		const latency = Date.now() - startTime;

		return {
			isHealthy: false,
			latency,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Get query performance statistics
 */
export function getQueryPerformanceStats(): {
	monitor: ReturnType<typeof queryMonitor.getPerformanceReport>;
	cache: ReturnType<typeof instagramTemplateCache.getStats>;
	recommendations: string[];
} {
	const monitorStats = queryMonitor.getPerformanceReport();
	const cacheStats = instagramTemplateCache.getStats();
	const recommendations: string[] = [];

	// Generate performance recommendations
	if (cacheStats.hitRate < PERFORMANCE_THRESHOLDS.CACHE_MISS_THRESHOLD) {
		recommendations.push(
			`Cache hit rate is low (${cacheStats.hitRate.toFixed(1)}%). Consider warming the cache or increasing TTL.`,
		);
	}

	if (monitorStats.slowQueries > 0) {
		recommendations.push(
			`${monitorStats.slowQueries} slow queries detected. Consider optimizing database indexes or query structure.`,
		);
	}

	if (monitorStats.averageExecutionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS / 2) {
		recommendations.push(
			`Average query time is high (${monitorStats.averageExecutionTime.toFixed(0)}ms). Consider query optimization.`,
		);
	}

	if (cacheStats.errors > 0) {
		recommendations.push(`${cacheStats.errors} cache errors detected. Check Redis connection and configuration.`);
	}

	return {
		monitor: monitorStats,
		cache: cacheStats,
		recommendations,
	};
}

/**
 * Warm cache with frequently accessed templates
 */
export async function warmInstagramTemplateCache(limit: number = 100): Promise<{ warmed: number; errors: number }> {
	const queryName = "warmInstagramTemplateCache";
	const startTime = Date.now();

	try {
		console.log(`[Instagram DB] Starting cache warming for top ${limit} templates`);

		// Get most frequently accessed templates (this would need to be tracked separately)
		// For now, get recent templates as a proxy
		const recentMappings = await prisma.mapeamentoIntencao.findMany({
			take: limit,
			select: {
				intentName: true,
				inboxId: true,
			},
		});

		let warmed = 0;
		let errors = 0;

		// Warm cache for each mapping
		for (const mapping of recentMappings) {
			try {
				await findOptimizedCompleteMessageMapping(mapping.intentName, mapping.inboxId);
				warmed++;
			} catch (error) {
				errors++;
				console.error(`[Instagram DB] Error warming cache for ${mapping.intentName}:${mapping.inboxId}:`, error);
			}
		}

		const executionTime = Date.now() - startTime;

		queryMonitor.recordQuery({
			queryName,
			executionTime,
			cacheHit: false,
			timestamp: new Date(),
			parameters: { limit, warmed, errors },
		});

		console.log(`[Instagram DB] Cache warming completed`, {
			warmed,
			errors,
			executionTime,
		});

		return { warmed, errors };
	} catch (error) {
		const executionTime = Date.now() - startTime;

		queryMonitor.recordQuery({
			queryName,
			executionTime,
			cacheHit: false,
			timestamp: new Date(),
			parameters: { limit, error: error instanceof Error ? error.message : "Unknown error" },
		});

		console.error(`[Instagram DB] Cache warming failed:`, error);
		return { warmed: 0, errors: 1 };
	}
}

/**
 * Clean up resources
 */
export async function cleanup(): Promise<void> {
	try {
		await prisma.$disconnect();
		console.log("[Instagram DB] Database connections closed");
	} catch (error) {
		console.error("[Instagram DB] Error during cleanup:", error);
	}
}

/**
 * Record database query performance for monitoring
 */
export function recordDatabaseQuery(queryName: string, executionTime: number, success: boolean, error?: Error): void {
	queryMonitor.recordQuery({
		queryName,
		executionTime,
		cacheHit: false,
		timestamp: new Date(),
		parameters: {
			success,
			error: error?.message,
		},
	});

	// Log performance for monitoring
	if (!success && error) {
		console.error(`[Instagram DB] Query failed: ${queryName}`, {
			executionTime,
			error: error.message,
		});
	} else if (executionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
		console.warn(`[Instagram DB] Slow query: ${queryName}`, {
			executionTime,
			success,
		});
	} else {
		console.log(`[Instagram DB] Query completed: ${queryName}`, {
			executionTime,
			success,
		});
	}
}

// Export the query monitor for external access
export { queryMonitor };
