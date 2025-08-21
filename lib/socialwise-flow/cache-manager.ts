/**
 * SocialWise Flow Cache Manager
 * 
 * Implements hybrid Redis caching strategy with secure key namespacing,
 * classification results, response caching, and anti-replay protection.
 */

import { getRedisInstance } from '../connections';
import { 
  SocialWiseCacheKeyBuilder, 
  CacheKeyConfig, 
  CacheKeyType,
  CACHE_TTL,
  socialWiseCacheKeyBuilder 
} from './cache-key-builder';

// Cache data interfaces
export interface ClassificationResult {
  top: Array<{
    slug: string;
    score: number;
    desc?: string;
  }>;
  ts: number;
  band: 'HARD' | 'SOFT' | 'ROUTER';
  strategy: string;
}

export interface WarmupButtonsResult {
  intro: string;
  buttons: Array<{
    title: string;
    payload: string;
  }>;
  ts: number;
}

export interface MicrocopyResult {
  text: string;
  buttons?: Array<{
    title: string;
    payload: string;
  }>;
  ts: number;
}

export interface EmbeddingResult {
  vecId?: string;
  vector?: number[];
  ts: number;
}

// Cache statistics
export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  sets: number;
  deletes: number;
  lastReset: Date;
}

// Cache health metrics
export interface CacheHealth {
  isConnected: boolean;
  latency: number;
  memoryUsage?: string;
  keyCount: number;
  lastCheck: Date;
  errorRate: number;
  hitRate: number;
}

/**
 * Main cache manager for SocialWise Flow operations
 */
export class SocialWiseFlowCacheManager {
  private redis: ReturnType<typeof getRedisInstance>;
  private keyBuilder: SocialWiseCacheKeyBuilder;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    sets: 0,
    deletes: 0,
    lastReset: new Date(),
  };

  constructor(redisConnection?: ReturnType<typeof getRedisInstance>) {
    this.redis = redisConnection || getRedisInstance();
    this.keyBuilder = socialWiseCacheKeyBuilder;
    this.initializeHealthCheck();
  }

  // Initialize periodic health checks
  private initializeHealthCheck(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Check health every 5 minutes
    setInterval(() => {
      this.checkHealth().catch(error => {
        console.error('[SocialWiseFlowCache] Health check failed:', error);
      });
    }, 5 * 60 * 1000);
  }

  // Record cache operation for statistics
  private recordOperation(type: 'hit' | 'miss' | 'error' | 'set' | 'delete'): void {
    switch (type) {
      case 'hit': this.stats.hits++; break;
      case 'miss': this.stats.misses++; break;
      case 'error': this.stats.errors++; break;
      case 'set': this.stats.sets++; break;
      case 'delete': this.stats.deletes++; break;
    }
  }

  /**
   * Classification Results Cache
   */
  async getClassificationResult(
    config: CacheKeyConfig,
    userText: string
  ): Promise<ClassificationResult | null> {
    try {
      const key = this.keyBuilder.buildClassificationKey(config, userText);
      const cached = await this.redis.get(key);

      if (cached) {
        this.recordOperation('hit');
        return JSON.parse(cached);
      } else {
        this.recordOperation('miss');
        return null;
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error getting classification result:', error);
      return null;
    }
  }

  async setClassificationResult(
    config: CacheKeyConfig,
    userText: string,
    result: ClassificationResult,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildClassificationKey(config, userText);
      const ttl = customTTL || CACHE_TTL.CLASSIFY;
      
      const cacheData = {
        ...result,
        ts: Date.now(),
      };

      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting classification result:', error);
    }
  }

  /**
   * Warmup Buttons Cache
   */
  async getWarmupButtons(
    config: CacheKeyConfig,
    userText: string,
    candidates: Array<{ slug: string; desc?: string }>
  ): Promise<WarmupButtonsResult | null> {
    try {
      const key = this.keyBuilder.buildWarmupKey(config, userText, candidates);
      const cached = await this.redis.get(key);

      if (cached) {
        this.recordOperation('hit');
        return JSON.parse(cached);
      } else {
        this.recordOperation('miss');
        return null;
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error getting warmup buttons:', error);
      return null;
    }
  }

  async setWarmupButtons(
    config: CacheKeyConfig,
    userText: string,
    candidates: Array<{ slug: string; desc?: string }>,
    result: WarmupButtonsResult,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildWarmupKey(config, userText, candidates);
      const ttl = customTTL || CACHE_TTL.WARMUP;
      
      const cacheData = {
        ...result,
        ts: Date.now(),
      };

      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting warmup buttons:', error);
    }
  }

  /**
   * Short Titles Cache
   */
  async getShortTitle(
    config: CacheKeyConfig,
    intentSlug: string
  ): Promise<string | null> {
    try {
      const key = this.keyBuilder.buildShortTitleKey(config, intentSlug);
      const cached = await this.redis.get(key);

      if (cached) {
        this.recordOperation('hit');
        return cached;
      } else {
        this.recordOperation('miss');
        return null;
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error getting short title:', error);
      return null;
    }
  }

  async setShortTitle(
    config: CacheKeyConfig,
    intentSlug: string,
    title: string,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildShortTitleKey(config, intentSlug);
      const ttl = customTTL || CACHE_TTL.STITLE;

      await this.redis.setex(key, ttl, title);
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting short title:', error);
    }
  }

  /**
   * Batch Short Titles Operations
   */
  async batchGetShortTitles(
    config: CacheKeyConfig,
    intentSlugs: string[]
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    try {
      const keys = intentSlugs.map(slug => 
        this.keyBuilder.buildShortTitleKey(config, slug)
      );

      const values = await this.redis.mget(...keys);

      for (let i = 0; i < intentSlugs.length; i++) {
        const slug = intentSlugs[i];
        const value = values[i];

        if (value) {
          this.recordOperation('hit');
          results.set(slug, value);
        } else {
          this.recordOperation('miss');
          results.set(slug, null);
        }
      }

      return results;
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error in batch get short titles:', error);
      
      // Return empty results on error
      for (const slug of intentSlugs) {
        results.set(slug, null);
      }
      return results;
    }
  }

  async batchSetShortTitles(
    config: CacheKeyConfig,
    titleMap: Map<string, string>,
    customTTL?: number
  ): Promise<void> {
    if (titleMap.size === 0) return;

    try {
      const pipeline = this.redis.pipeline();
      const ttl = customTTL || CACHE_TTL.STITLE;

      titleMap.forEach((title, slug) => {
        const key = this.keyBuilder.buildShortTitleKey(config, slug);
        pipeline.setex(key, ttl, title);
      });

      await pipeline.exec();
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error in batch set short titles:', error);
    }
  }

  /**
   * Microcopy Confirmation Cache (HARD band)
   */
  async getMicrocopy(
    config: CacheKeyConfig,
    userText: string,
    intentSlug: string
  ): Promise<MicrocopyResult | null> {
    try {
      const key = this.keyBuilder.buildConfirmationKey(config, userText, intentSlug);
      const cached = await this.redis.get(key);

      if (cached) {
        this.recordOperation('hit');
        return JSON.parse(cached);
      } else {
        this.recordOperation('miss');
        return null;
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error getting microcopy:', error);
      return null;
    }
  }

  async setMicrocopy(
    config: CacheKeyConfig,
    userText: string,
    intentSlug: string,
    result: MicrocopyResult,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildConfirmationKey(config, userText, intentSlug);
      const ttl = customTTL || CACHE_TTL.CONFIRM;
      
      const cacheData = {
        ...result,
        ts: Date.now(),
      };

      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting microcopy:', error);
    }
  }

  /**
   * Embeddings Cache
   */
  async getEmbedding(
    config: CacheKeyConfig,
    text: string
  ): Promise<EmbeddingResult | null> {
    try {
      const key = this.keyBuilder.buildEmbeddingKey(config, text);
      const cached = await this.redis.get(key);

      if (cached) {
        this.recordOperation('hit');
        return JSON.parse(cached);
      } else {
        this.recordOperation('miss');
        return null;
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error getting embedding:', error);
      return null;
    }
  }

  async setEmbedding(
    config: CacheKeyConfig,
    text: string,
    result: EmbeddingResult,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildEmbeddingKey(config, text);
      const ttl = customTTL || CACHE_TTL.EMBEDDING;
      
      const cacheData = {
        ...result,
        ts: Date.now(),
      };

      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting embedding:', error);
    }
  }

  /**
   * Idempotency Cache (WAMID-based)
   */
  async checkIdempotency(
    config: CacheKeyConfig,
    wamid: string
  ): Promise<boolean> {
    try {
      const key = this.keyBuilder.buildIdempotencyKey(config, wamid);
      const exists = await this.redis.exists(key);
      
      if (exists) {
        this.recordOperation('hit');
        return true;
      } else {
        this.recordOperation('miss');
        return false;
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error checking idempotency:', error);
      return false;
    }
  }

  async setIdempotency(
    config: CacheKeyConfig,
    wamid: string,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildIdempotencyKey(config, wamid);
      const ttl = customTTL || CACHE_TTL.IDEMPOTENCY;

      await this.redis.setex(key, ttl, '1');
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting idempotency:', error);
    }
  }

  /**
   * Anti-Replay Nonce Cache
   */
  async checkNonce(
    config: CacheKeyConfig,
    nonce: string
  ): Promise<boolean> {
    try {
      const key = this.keyBuilder.buildNonceKey(config, nonce);
      const exists = await this.redis.exists(key);
      
      if (exists) {
        this.recordOperation('hit');
        return true; // Nonce already used
      } else {
        this.recordOperation('miss');
        return false; // Nonce is fresh
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error checking nonce:', error);
      return true; // Fail secure - assume nonce is used
    }
  }

  async setNonce(
    config: CacheKeyConfig,
    nonce: string,
    customTTL?: number
  ): Promise<void> {
    try {
      const key = this.keyBuilder.buildNonceKey(config, nonce);
      const ttl = customTTL || CACHE_TTL.NONCE;

      await this.redis.setex(key, ttl, '1');
      this.recordOperation('set');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error setting nonce:', error);
    }
  }

  /**
   * Rate Limiting Cache Integration
   */
  async checkRateLimit(
    config: CacheKeyConfig,
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const key = this.keyBuilder.buildRateLimitKey(config, identifier);
      
      // Use Redis sliding window rate limiting
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);
      
      // Remove old entries and count current requests
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const currentCount = await this.redis.zcard(key);
      
      if (currentCount < limit) {
        // Add current request
        await this.redis.zadd(key, now, `${now}-${Math.random()}`);
        await this.redis.expire(key, windowSeconds);
        
        this.recordOperation('miss'); // Rate limit not hit
        return {
          allowed: true,
          remaining: limit - currentCount - 1,
          resetTime: now + (windowSeconds * 1000),
        };
      } else {
        this.recordOperation('hit'); // Rate limit hit
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + (windowSeconds * 1000),
        };
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error checking rate limit:', error);
      // Fail open for rate limiting errors
      return { allowed: true, remaining: 0, resetTime: Date.now() };
    }
  }

  /**
   * Cache Invalidation
   */
  async invalidateUserCache(
    config: CacheKeyConfig,
    userText?: string
  ): Promise<void> {
    try {
      const namespace = this.keyBuilder['buildNamespace'](config);
      
      if (userText) {
        // Invalidate specific user text related caches
        const classifyKey = this.keyBuilder.buildClassificationKey(config, userText);
        const embeddingKey = this.keyBuilder.buildEmbeddingKey(config, userText);
        
        await this.redis.del(classifyKey, embeddingKey);
        this.recordOperation('delete');
      } else {
        // Invalidate all caches for this namespace
        const pattern = `${namespace}:*`;
        const keys = await this.redis.keys(pattern);
        
        if (keys.length > 0) {
          await this.redis.del(...keys);
          this.recordOperation('delete');
        }
      }
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error invalidating cache:', error);
    }
  }

  async invalidateIntentCache(
    config: CacheKeyConfig,
    intentSlug: string
  ): Promise<void> {
    try {
      const shortTitleKey = this.keyBuilder.buildShortTitleKey(config, intentSlug);
      await this.redis.del(shortTitleKey);
      this.recordOperation('delete');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error invalidating intent cache:', error);
    }
  }

  /**
   * Cache Statistics and Health
   */
  getStats(): CacheStats & { hitRate: number; errorRate: number } {
    const totalOps = this.stats.hits + this.stats.misses;
    const totalRequests = totalOps + this.stats.errors;
    
    return {
      ...this.stats,
      hitRate: totalOps > 0 ? (this.stats.hits / totalOps) * 100 : 0,
      errorRate: totalRequests > 0 ? (this.stats.errors / totalRequests) * 100 : 0,
    };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      sets: 0,
      deletes: 0,
      lastReset: new Date(),
    };
  }

  async checkHealth(): Promise<CacheHealth> {
    const start = Date.now();
    
    try {
      await this.redis.ping();
      const latency = Date.now() - start;
      
      // Get memory usage and key count
      let memoryUsage: string | undefined;
      let keyCount = 0;
      
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory_human:(.+)/);
        memoryUsage = match ? match[1].trim() : undefined;
        
        // Count SocialWise keys
        const pattern = 'sw:*';
        const keys = await this.redis.keys(pattern);
        keyCount = keys.length;
      } catch {
        // Ignore info errors
      }
      
      const stats = this.getStats();
      
      return {
        isConnected: true,
        latency,
        memoryUsage,
        keyCount,
        lastCheck: new Date(),
        errorRate: stats.errorRate,
        hitRate: stats.hitRate,
      };
    } catch (error) {
      console.error('[SocialWiseFlowCache] Health check failed:', error);
      const stats = this.getStats();
      
      return {
        isConnected: false,
        latency: Date.now() - start,
        keyCount: 0,
        lastCheck: new Date(),
        errorRate: stats.errorRate,
        hitRate: stats.hitRate,
      };
    }
  }

  /**
   * Cache Warming
   */
  async warmCache(
    config: CacheKeyConfig,
    warmingData: {
      classifications?: Array<{ userText: string; result: ClassificationResult }>;
      shortTitles?: Map<string, string>;
      embeddings?: Array<{ text: string; result: EmbeddingResult }>;
    }
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Warm classification cache
      if (warmingData.classifications) {
        for (const { userText, result } of warmingData.classifications) {
          const key = this.keyBuilder.buildClassificationKey(config, userText);
          pipeline.setex(key, CACHE_TTL.CLASSIFY, JSON.stringify(result));
        }
      }
      
      // Warm short titles cache
      if (warmingData.shortTitles) {
        for (const [slug, title] of warmingData.shortTitles) {
          const key = this.keyBuilder.buildShortTitleKey(config, slug);
          pipeline.setex(key, CACHE_TTL.STITLE, title);
        }
      }
      
      // Warm embeddings cache
      if (warmingData.embeddings) {
        for (const { text, result } of warmingData.embeddings) {
          const key = this.keyBuilder.buildEmbeddingKey(config, text);
          pipeline.setex(key, CACHE_TTL.EMBEDDING, JSON.stringify(result));
        }
      }
      
      await pipeline.exec();
      console.log('[SocialWiseFlowCache] Cache warming completed');
    } catch (error) {
      this.recordOperation('error');
      console.error('[SocialWiseFlowCache] Error warming cache:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      console.log('[SocialWiseFlowCache] Shutting down cache manager...');
      // Redis connection is shared, so we don't disconnect it here
    } catch (error) {
      console.error('[SocialWiseFlowCache] Error during shutdown:', error);
    }
  }
}

// Global cache instance
export const socialWiseFlowCache = new SocialWiseFlowCacheManager();

// Utility functions for common operations
export async function getCachedClassification(
  config: CacheKeyConfig,
  userText: string
): Promise<ClassificationResult | null> {
  return socialWiseFlowCache.getClassificationResult(config, userText);
}

export async function setCachedClassification(
  config: CacheKeyConfig,
  userText: string,
  result: ClassificationResult
): Promise<void> {
  return socialWiseFlowCache.setClassificationResult(config, userText, result);
}

export async function getCachedWarmupButtons(
  config: CacheKeyConfig,
  userText: string,
  candidates: Array<{ slug: string; desc?: string }>
): Promise<WarmupButtonsResult | null> {
  return socialWiseFlowCache.getWarmupButtons(config, userText, candidates);
}

export async function setCachedWarmupButtons(
  config: CacheKeyConfig,
  userText: string,
  candidates: Array<{ slug: string; desc?: string }>,
  result: WarmupButtonsResult
): Promise<void> {
  return socialWiseFlowCache.setWarmupButtons(config, userText, candidates, result);
}

export async function checkMessageIdempotency(
  config: CacheKeyConfig,
  wamid: string
): Promise<boolean> {
  return socialWiseFlowCache.checkIdempotency(config, wamid);
}

export async function setMessageIdempotency(
  config: CacheKeyConfig,
  wamid: string
): Promise<void> {
  return socialWiseFlowCache.setIdempotency(config, wamid);
}

export async function checkAntiReplayNonce(
  config: CacheKeyConfig,
  nonce: string
): Promise<boolean> {
  return socialWiseFlowCache.checkNonce(config, nonce);
}

export async function setAntiReplayNonce(
  config: CacheKeyConfig,
  nonce: string
): Promise<void> {
  return socialWiseFlowCache.setNonce(config, nonce);
}