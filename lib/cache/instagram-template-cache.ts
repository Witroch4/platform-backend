import { getRedisInstance } from "../connections";
import { CompleteMessageMapping } from "../dialogflow-database-queries";
import {
  logCacheHit,
  logCacheMiss,
  logCacheSet,
  logCacheInvalidation,
  logCacheError,
  logCacheKeyGeneration,
  createCacheLogContext,
  type CacheLogContext,
} from "../logging/cache-logging";

// Cache key prefixes for organization
const CACHE_PREFIXES = {
  TEMPLATE_MAPPING: "instagram_template_mapping",
  TEMPLATE_CONTENT: "instagram_template_content",
  CONVERSION_RESULT: "instagram_conversion_result",
  QUERY_PERFORMANCE: "instagram_query_perf",
  HEALTH: "instagram_cache_health",
} as const;

// TTL constants (in seconds)
const TTL = {
  TEMPLATE_MAPPING: 60 * 60 * 2, // 2 hours - templates don't change often
  TEMPLATE_CONTENT: 60 * 60 * 4, // 4 hours - content is more stable
  CONVERSION_RESULT: 60 * 30, // 30 minutes - conversion results can be cached briefly
  QUERY_PERFORMANCE: 60 * 60, // 1 hour - performance metrics
  HEALTH: 60 * 40, //  xx minutes - health status
} as const;

// Cache interfaces
export interface CachedTemplateMapping {
  mapping: CompleteMessageMapping;
  cachedAt: Date;
  hitCount: number;
  lastAccessed: Date;
}

export interface CachedConversionResult {
  fulfillmentMessages: any[];
  templateType: "generic" | "button" | "incompatible";
  processingTime: number;
  cachedAt: Date;
  originalBodyLength: number;
  buttonsCount: number;
  hasImage: boolean;
}

export interface QueryPerformanceMetrics {
  queryType: string;
  averageTime: number;
  totalQueries: number;
  slowQueries: number;
  lastUpdated: Date;
}

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  evictions: number;
  lastUpdated: Date;
  hitRate: number;
  averageResponseTime: number;
}

export interface CacheHealth {
  isConnected: boolean;
  latency: number;
  memoryUsage?: string;
  keyCount: number;
  lastCheck: Date;
}

export class InstagramTemplateCache {
  private redis: ReturnType<typeof getRedisInstance>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    evictions: 0,
    lastUpdated: new Date(),
    hitRate: 0,
    averageResponseTime: 0,
  };
  private responseTimes: number[] = [];

  constructor(redisConnection?: ReturnType<typeof getRedisInstance>) {
    this.redis = redisConnection || getRedisInstance();
    this.initializeHealthCheck();
  }

  // Initialize periodic health checks
  private initializeHealthCheck(): void {
    // Skip health checks in test environment
    if (process.env.NODE_ENV === "test") {
      return;
    }

    // Check health every 5 minutes
    setInterval(
      () => {
        this.checkHealth().catch((error) => {
          console.error("[InstagramTemplateCache] Health check failed:", error);
        });
      },
      5 * 60 * 1000
    );
  }

  // Generate cache key
  private getCacheKey(prefix: string, identifier: string): string {
    return `chatwit:${prefix}:${identifier}`;
  }

  // Record response time for performance tracking
  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);

    // Keep only last 100 measurements
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    // Update average response time
    this.stats.averageResponseTime =
      this.responseTimes.reduce((sum, t) => sum + t, 0) /
      this.responseTimes.length;
  }

  // Get template mapping from cache
  async getTemplateMapping(
    intentName: string,
    usuarioChatwitId: string,
    inboxId: string
  ): Promise<CompleteMessageMapping | null> {
    const cacheKeyComponents = { intentName, usuarioChatwitId, inboxId };
    const key = this.getCacheKey(
      CACHE_PREFIXES.TEMPLATE_MAPPING,
      `${intentName}:${usuarioChatwitId}:${inboxId}`
    );

    // Log cache key generation for debugging
    const logContext = createCacheLogContext(
      usuarioChatwitId,
      inboxId,
      intentName,
      "getTemplateMapping"
    );
    logCacheKeyGeneration(
      logContext,
      cacheKeyComponents,
      "chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId",
      { generatedKey: key }
    );

    try {
      const start = Date.now();
      const cached = await this.redis.get(key);
      const latency = Date.now() - start;
      this.recordResponseTime(latency);

      if (cached) {
        this.stats.hits++;
        const cachedData: CachedTemplateMapping = JSON.parse(cached);

        // Update access tracking
        cachedData.hitCount++;
        cachedData.lastAccessed = new Date();

        // Update cache with new access data (fire and forget)
        this.redis
          .setex(key, TTL.TEMPLATE_MAPPING, JSON.stringify(cachedData))
          .catch(() => {});

        logCacheHit(
          { ...logContext, cacheKey: key },
          { latency, hitCount: cachedData.hitCount },
          {
            cachedAt: cachedData.cachedAt,
            lastAccessed: cachedData.lastAccessed,
            messageType: cachedData.mapping.messageType,
          }
        );

        return cachedData.mapping;
      } else {
        this.stats.misses++;
        logCacheMiss(
          { ...logContext, cacheKey: key },
          { latency },
          "Key not found in cache"
        );
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      logCacheError(
        { ...logContext, cacheKey: key },
        error instanceof Error ? error : new Error(String(error)),
        "Failed to retrieve template mapping from cache"
      );
      return null; // Fail gracefully
    }
  }

  // Set template mapping in cache
  async setTemplateMapping(
    intentName: string,
    usuarioChatwitId: string,
    inboxId: string,
    mapping: CompleteMessageMapping,
    ttl: number = TTL.TEMPLATE_MAPPING
  ): Promise<void> {
    const cacheKeyComponents = { intentName, usuarioChatwitId, inboxId };
    const key = this.getCacheKey(
      CACHE_PREFIXES.TEMPLATE_MAPPING,
      `${intentName}:${usuarioChatwitId}:${inboxId}`
    );

    // Log cache key generation for debugging
    const logContext = createCacheLogContext(
      usuarioChatwitId,
      inboxId,
      intentName,
      "setTemplateMapping"
    );
    logCacheKeyGeneration(
      logContext,
      cacheKeyComponents,
      "chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId",
      { generatedKey: key, ttl }
    );

    try {
      const cachedData: CachedTemplateMapping = {
        mapping,
        cachedAt: new Date(),
        hitCount: 0,
        lastAccessed: new Date(),
      };

      await this.redis.setex(key, ttl, JSON.stringify(cachedData));

      logCacheSet(
        { ...logContext, cacheKey: key },
        { ttl, dataSize: JSON.stringify(cachedData).length },
        {
          messageType: mapping.messageType,
          mappingId: mapping.id,
          cachedAt: cachedData.cachedAt,
        }
      );
    } catch (error) {
      this.stats.errors++;
      logCacheError(
        { ...logContext, cacheKey: key },
        error instanceof Error ? error : new Error(String(error)),
        "Failed to set template mapping in cache",
        { ttl, messageType: mapping.messageType }
      );
    }
  }

  // Get conversion result from cache
  async getConversionResult(
    intentName: string,
    usuarioChatwitId: string,
    inboxId: string,
    bodyLength: number,
    hasImage: boolean
  ): Promise<CachedConversionResult | null> {
    const cacheKeyComponents = {
      intentName,
      usuarioChatwitId,
      inboxId,
      bodyLength,
      hasImage,
    };
    const cacheKey = `${intentName}:${usuarioChatwitId}:${inboxId}:${bodyLength}:${hasImage}`;
    const key = this.getCacheKey(CACHE_PREFIXES.CONVERSION_RESULT, cacheKey);

    // Log cache key generation for debugging
    const logContext = createCacheLogContext(
      usuarioChatwitId,
      inboxId,
      intentName,
      "getConversionResult"
    );
    logCacheKeyGeneration(
      logContext,
      cacheKeyComponents,
      "chatwit:instagram_conversion_result:intentName:usuarioChatwitId:inboxId:bodyLength:hasImage",
      { generatedKey: key }
    );

    try {
      const start = Date.now();
      const cached = await this.redis.get(key);
      const latency = Date.now() - start;
      this.recordResponseTime(latency);

      if (cached) {
        this.stats.hits++;
        const result: CachedConversionResult = JSON.parse(cached);

        logCacheHit(
          { ...logContext, cacheKey: key },
          { latency },
          {
            bodyLength,
            hasImage,
            templateType: result.templateType,
            cachedAt: result.cachedAt,
            processingTime: result.processingTime,
          }
        );

        return result;
      } else {
        this.stats.misses++;
        logCacheMiss(
          { ...logContext, cacheKey: key },
          { latency },
          "Key not found in cache",
          { bodyLength, hasImage }
        );
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      logCacheError(
        { ...logContext, cacheKey: key },
        error instanceof Error ? error : new Error(String(error)),
        "Failed to retrieve conversion result from cache",
        { bodyLength, hasImage }
      );
      return null;
    }
  }

  // Set conversion result in cache
  async setConversionResult(
    intentName: string,
    usuarioChatwitId: string,
    inboxId: string,
    bodyLength: number,
    hasImage: boolean,
    result: {
      fulfillmentMessages: any[];
      templateType: "generic" | "button" | "incompatible";
      processingTime: number;
      buttonsCount: number;
    },
    ttl: number = TTL.CONVERSION_RESULT
  ): Promise<void> {
    const cacheKeyComponents = {
      intentName,
      usuarioChatwitId,
      inboxId,
      bodyLength,
      hasImage,
    };
    const cacheKey = `${intentName}:${usuarioChatwitId}:${inboxId}:${bodyLength}:${hasImage}`;
    const key = this.getCacheKey(CACHE_PREFIXES.CONVERSION_RESULT, cacheKey);

    // Log cache key generation for debugging
    const logContext = createCacheLogContext(
      usuarioChatwitId,
      inboxId,
      intentName,
      "setConversionResult"
    );
    logCacheKeyGeneration(
      logContext,
      cacheKeyComponents,
      "chatwit:instagram_conversion_result:intentName:usuarioChatwitId:inboxId:bodyLength:hasImage",
      { generatedKey: key, ttl }
    );

    try {
      const cachedResult: CachedConversionResult = {
        fulfillmentMessages: result.fulfillmentMessages,
        templateType: result.templateType,
        processingTime: result.processingTime,
        cachedAt: new Date(),
        originalBodyLength: bodyLength,
        buttonsCount: result.buttonsCount,
        hasImage,
      };

      await this.redis.setex(key, ttl, JSON.stringify(cachedResult));

      logCacheSet(
        { ...logContext, cacheKey: key },
        { ttl, dataSize: JSON.stringify(cachedResult).length },
        {
          bodyLength,
          hasImage,
          templateType: result.templateType,
          processingTime: result.processingTime,
          buttonsCount: result.buttonsCount,
          messagesCount: result.fulfillmentMessages.length,
          cachedAt: cachedResult.cachedAt,
        }
      );
    } catch (error) {
      this.stats.errors++;
      logCacheError(
        { ...logContext, cacheKey: key },
        error instanceof Error ? error : new Error(String(error)),
        "Failed to set conversion result in cache",
        { bodyLength, hasImage, ttl, templateType: result.templateType }
      );
    }
  }

  // Record query performance metrics
  async recordQueryPerformance(
    queryType: string,
    executionTime: number,
    isSlowQuery: boolean = false
  ): Promise<void> {
    const key = this.getCacheKey(CACHE_PREFIXES.QUERY_PERFORMANCE, queryType);

    try {
      const existing = await this.redis.get(key);
      let metrics: QueryPerformanceMetrics;

      if (existing) {
        metrics = JSON.parse(existing);
        // Update running average
        const totalTime =
          metrics.averageTime * metrics.totalQueries + executionTime;
        metrics.totalQueries++;
        metrics.averageTime = totalTime / metrics.totalQueries;
        if (isSlowQuery) metrics.slowQueries++;
        metrics.lastUpdated = new Date();
      } else {
        metrics = {
          queryType,
          averageTime: executionTime,
          totalQueries: 1,
          slowQueries: isSlowQuery ? 1 : 0,
          lastUpdated: new Date(),
        };
      }

      await this.redis.setex(
        key,
        TTL.QUERY_PERFORMANCE,
        JSON.stringify(metrics)
      );

      if (isSlowQuery) {
        console.warn(
          `[InstagramTemplateCache] Slow query detected: ${queryType}`,
          {
            executionTime,
            averageTime: metrics.averageTime,
          }
        );
      }
    } catch (error) {
      console.error(
        `[InstagramTemplateCache] Error recording query performance:`,
        error
      );
    }
  }

  // Get query performance metrics
  async getQueryPerformanceMetrics(
    queryType?: string
  ): Promise<QueryPerformanceMetrics[]> {
    try {
      if (queryType) {
        const key = this.getCacheKey(
          CACHE_PREFIXES.QUERY_PERFORMANCE,
          queryType
        );
        const cached = await this.redis.get(key);
        return cached ? [JSON.parse(cached)] : [];
      } else {
        // Get all query performance metrics
        const pattern = this.getCacheKey(CACHE_PREFIXES.QUERY_PERFORMANCE, "*");
        const keys = await this.redis.keys(pattern);

        if (keys.length === 0) return [];

        const values = await this.redis.mget(...keys);
        return values
          .filter((value: any) => value !== null)
          .map((value: any) => JSON.parse(value!));
      }
    } catch (error) {
      console.error(
        "[InstagramTemplateCache] Error getting query performance metrics:",
        error
      );
      return [];
    }
  }

  // Invalidate template mapping cache
  async invalidateTemplateMapping(
    intentName: string,
    usuarioChatwitId: string,
    inboxId: string
  ): Promise<void> {
    const cacheKeyComponents = { intentName, usuarioChatwitId, inboxId };
    const mappingKey = this.getCacheKey(
      CACHE_PREFIXES.TEMPLATE_MAPPING,
      `${intentName}:${usuarioChatwitId}:${inboxId}`
    );

    // Log cache key generation for debugging
    const logContext = createCacheLogContext(
      usuarioChatwitId,
      inboxId,
      intentName,
      "invalidateTemplateMapping"
    );
    logCacheKeyGeneration(
      logContext,
      cacheKeyComponents,
      "chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId",
      { generatedMappingKey: mappingKey }
    );

    try {
      // Also invalidate related conversion results
      const conversionPattern = this.getCacheKey(
        CACHE_PREFIXES.CONVERSION_RESULT,
        `${intentName}:${usuarioChatwitId}:${inboxId}:*`
      );

      console.log(`[Cache] [DEBUG] Searching for related conversion results:`, {
        ...logContext,
        conversionPattern,
      });

      const conversionKeys = await this.redis.keys(conversionPattern);

      const keysToDelete = [mappingKey, ...conversionKeys];

      console.log(`[Cache] [DEBUG] Preparing to invalidate cache keys:`, {
        ...logContext,
        mappingKey,
        conversionKeys,
        totalKeysToDelete: keysToDelete.length,
        keysToDelete,
      });

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        this.stats.evictions += keysToDelete.length;

        logCacheInvalidation(
          logContext,
          keysToDelete,
          "Template mapping invalidation",
          {
            mappingKeyDeleted: keysToDelete.includes(mappingKey),
            conversionKeysDeleted: conversionKeys.length,
            totalEvictions: this.stats.evictions,
          }
        );
      } else {
        console.log(`[Cache] [INFO] No cache keys found to delete:`, {
          ...logContext,
          mappingKey,
          conversionPattern,
          reason: "No matching keys found in cache",
        });
      }
    } catch (error) {
      this.stats.errors++;
      logCacheError(
        logContext,
        error instanceof Error ? error : new Error(String(error)),
        "Failed to invalidate template mapping cache",
        { mappingKey, totalErrors: this.stats.errors }
      );
    }
  }

  // Batch operations for efficiency
  async batchGetTemplateMappings(
    requests: Array<{ intentName: string; inboxId: string }>
  ): Promise<Map<string, CompleteMessageMapping | null>> {
    const keys = requests.map((req) =>
      this.getCacheKey(
        CACHE_PREFIXES.TEMPLATE_MAPPING,
        `${req.intentName}:${req.inboxId}`
      )
    );
    const results = new Map<string, CompleteMessageMapping | null>();

    try {
      const start = Date.now();
      const values = await this.redis.mget(...keys);
      const latency = Date.now() - start;
      this.recordResponseTime(latency);

      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        const cacheKey = `${request.intentName}:${request.inboxId}`;
        const value = values[i];

        if (value) {
          this.stats.hits++;
          const cachedData: CachedTemplateMapping = JSON.parse(value);
          results.set(cacheKey, cachedData.mapping);
        } else {
          this.stats.misses++;
          results.set(cacheKey, null);
        }
      }

      console.log(
        `[InstagramTemplateCache] Batch get completed for ${requests.length} mappings`,
        {
          hits: values.filter((v: any) => v !== null).length,
          misses: values.filter((v: any) => v === null).length,
          latency,
        }
      );

      return results;
    } catch (error) {
      this.stats.errors++;
      console.error(
        "[InstagramTemplateCache] Error in batch get template mappings:",
        error
      );

      // Return empty results on error
      for (const request of requests) {
        const cacheKey = `${request.intentName}:${request.inboxId}`;
        results.set(cacheKey, null);
      }
      return results;
    }
  }

  // Warm cache with frequently accessed templates
  async warmCache(
    templates: Array<{
      intentName: string;
      inboxId: string;
      mapping: CompleteMessageMapping;
    }>
  ): Promise<void> {
    if (templates.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();

      templates.forEach((template) => {
        const key = this.getCacheKey(
          CACHE_PREFIXES.TEMPLATE_MAPPING,
          `${template.intentName}:${template.inboxId}`
        );
        const cachedData: CachedTemplateMapping = {
          mapping: template.mapping,
          cachedAt: new Date(),
          hitCount: 0,
          lastAccessed: new Date(),
        };
        pipeline.setex(key, TTL.TEMPLATE_MAPPING, JSON.stringify(cachedData));
      });

      await pipeline.exec();

      console.log(
        `[InstagramTemplateCache] Cache warmed with ${templates.length} templates`
      );
    } catch (error) {
      this.stats.errors++;
      console.error("[InstagramTemplateCache] Error warming cache:", error);
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
      lastUpdated: new Date(),
    };
  }

  // Reset cache statistics
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      evictions: 0,
      lastUpdated: new Date(),
      hitRate: 0,
      averageResponseTime: 0,
    };
    this.responseTimes = [];
  }

  // Check cache health
  async checkHealth(): Promise<CacheHealth> {
    const start = Date.now();

    try {
      await this.redis.ping();
      const latency = Date.now() - start;

      // Get memory usage if available
      let memoryUsage: string | undefined;
      let keyCount = 0;

      try {
        const info = await this.redis.info("memory");
        const match = info.match(/used_memory_human:(.+)/);
        memoryUsage = match ? match[1].trim() : undefined;

        // Count Instagram-related keys
        const pattern = "chatwit:instagram_*";
        const keys = await this.redis.keys(pattern);
        keyCount = keys.length;
      } catch {
        // Ignore info errors
      }

      const health: CacheHealth = {
        isConnected: true,
        latency,
        memoryUsage,
        keyCount,
        lastCheck: new Date(),
      };

      // Cache health status
      const healthKey = this.getCacheKey(CACHE_PREFIXES.HEALTH, "status");
      await this.redis.setex(healthKey, TTL.HEALTH, JSON.stringify(health));

      return health;
    } catch (error) {
      console.error("[InstagramTemplateCache] Health check failed:", error);
      return {
        isConnected: false,
        latency: Date.now() - start,
        keyCount: 0,
        lastCheck: new Date(),
      };
    }
  }

  // Clear all Instagram cache entries
  async clearAll(): Promise<void> {
    try {
      const patterns = [
        "chatwit:instagram_template_mapping:*",
        "chatwit:instagram_template_content:*",
        "chatwit:instagram_conversion_result:*",
        "chatwit:instagram_query_perf:*",
        "chatwit:instagram_cache_health:*",
      ];

      let totalDeleted = 0;

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          totalDeleted += keys.length;
        }
      }

      this.stats.evictions += totalDeleted;
      console.log(
        `[InstagramTemplateCache] Cleared ${totalDeleted} cache entries`
      );
    } catch (error) {
      this.stats.errors++;
      console.error("[InstagramTemplateCache] Error clearing cache:", error);
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      console.log("[InstagramTemplateCache] Shutting down cache manager...");
      // Redis connection is shared, so we don't disconnect it here
    } catch (error) {
      console.error("[InstagramTemplateCache] Error during shutdown:", error);
    }
  }
}

// Global cache instance
export const instagramTemplateCache = new InstagramTemplateCache();

// Utility functions for common operations
export async function getCachedTemplateMapping(
  intentName: string,
  usuarioChatwitId: string,
  inboxId: string
): Promise<CompleteMessageMapping | null> {
  return instagramTemplateCache.getTemplateMapping(
    intentName,
    usuarioChatwitId,
    inboxId
  );
}

export async function setCachedTemplateMapping(
  intentName: string,
  usuarioChatwitId: string,
  inboxId: string,
  mapping: CompleteMessageMapping,
  ttl?: number
): Promise<void> {
  return instagramTemplateCache.setTemplateMapping(
    intentName,
    usuarioChatwitId,
    inboxId,
    mapping,
    ttl
  );
}

export async function getCachedConversionResult(
  intentName: string,
  usuarioChatwitId: string,
  inboxId: string,
  bodyLength: number,
  hasImage: boolean
): Promise<CachedConversionResult | null> {
  return instagramTemplateCache.getConversionResult(
    intentName,
    usuarioChatwitId,
    inboxId,
    bodyLength,
    hasImage
  );
}

export async function setCachedConversionResult(
  intentName: string,
  usuarioChatwitId: string,
  inboxId: string,
  bodyLength: number,
  hasImage: boolean,
  result: {
    fulfillmentMessages: any[];
    templateType: "generic" | "button" | "incompatible";
    processingTime: number;
    buttonsCount: number;
  },
  ttl?: number
): Promise<void> {
  return instagramTemplateCache.setConversionResult(
    intentName,
    usuarioChatwitId,
    inboxId,
    bodyLength,
    hasImage,
    result,
    ttl
  );
}

export async function invalidateTemplateMappingCache(
  intentName: string,
  usuarioChatwitId: string,
  inboxId: string
): Promise<void> {
  return instagramTemplateCache.invalidateTemplateMapping(
    intentName,
    usuarioChatwitId,
    inboxId
  );
}

export async function recordQueryPerformance(
  queryType: string,
  executionTime: number,
  isSlowQuery?: boolean
): Promise<void> {
  return instagramTemplateCache.recordQueryPerformance(
    queryType,
    executionTime,
    isSlowQuery
  );
}
