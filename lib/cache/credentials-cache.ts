import { connection } from '../redis';
import type IORedis from 'ioredis';

// Cache key prefixes for organization
const CACHE_PREFIXES = {
  CREDENTIALS: 'credentials',
  CREDENTIALS_UPDATED: 'credentials_updated',
  FALLBACK_CHAIN: 'fallback_chain',
  HEALTH: 'cache_health',
} as const;

// TTL constants (in seconds)
const TTL = {
  CREDENTIALS: 60 * 60, // 1 hour
  CREDENTIALS_UPDATED: 60 * 30, // 30 minutes
  FALLBACK_CHAIN: 60 * 60 * 24, // 24 hours
  HEALTH: 60 * 5, // 5 minutes
} as const;

// WhatsApp credentials interface
export interface WhatsAppCredentials {
  whatsappApiKey: string;
  phoneNumberId: string;
  businessId: string;
  inboxId: string;
  source: 'inbox' | 'fallback' | 'global';
  updatedAt: Date;
}

// Cache statistics interface
export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  lastUpdated: Date;
}

// Cache health status
export interface CacheHealth {
  isConnected: boolean;
  latency: number;
  memoryUsage?: string;
  lastCheck: Date;
}

export class CredentialsCache {
  private redis: IORedis;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    lastUpdated: new Date(),
  };

  constructor(redisConnection?: IORedis) {
    this.redis = redisConnection || connection;
    this.initializeHealthCheck();
  }

  // Initialize periodic health checks
  private initializeHealthCheck(): void {
    // Check health every 5 minutes
    setInterval(() => {
      this.checkHealth().catch(error => {
        console.error('[CredentialsCache] Health check failed:', error);
      });
    }, 5 * 60 * 1000);
  }

  // Generate cache key
  private getCacheKey(prefix: string, identifier: string): string {
    return `chatwit:${prefix}:${identifier}`;
  }

  // Get credentials from cache
  async getCredentials(inboxId: string): Promise<WhatsAppCredentials | null> {
    const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId);
    
    try {
      const start = Date.now();
      const cached = await this.redis.get(key);
      const latency = Date.now() - start;
      
      if (cached) {
        this.stats.hits++;
        cacheHealthMonitor.recordCacheOperation('hit', latency);
        console.log(`[CredentialsCache] Cache hit for inbox ${inboxId}`, { latency });
        return JSON.parse(cached);
      } else {
        this.stats.misses++;
        cacheHealthMonitor.recordCacheOperation('miss', latency);
        console.log(`[CredentialsCache] Cache miss for inbox ${inboxId}`, { latency });
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      cacheHealthMonitor.recordCacheOperation('error');
      console.error(`[CredentialsCache] Error getting credentials for inbox ${inboxId}:`, error);
      return null; // Fail gracefully
    }
  }

  // Set credentials in cache
  async setCredentials(
    inboxId: string, 
    credentials: WhatsAppCredentials, 
    ttl: number = TTL.CREDENTIALS
  ): Promise<void> {
    const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId);
    
    try {
      const serialized = JSON.stringify({
        ...credentials,
        updatedAt: new Date().toISOString(),
      });
      
      await this.redis.setex(key, ttl, serialized);
      
      console.log(`[CredentialsCache] Credentials cached for inbox ${inboxId}`, {
        ttl,
        source: credentials.source,
      });
    } catch (error) {
      this.stats.errors++;
      console.error(`[CredentialsCache] Error setting credentials for inbox ${inboxId}:`, error);
      // Don't throw - cache failures shouldn't break the application
    }
  }

  // Invalidate credentials cache
  async invalidateCredentials(inboxId: string): Promise<void> {
    const keys = [
      this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId),
      this.getCacheKey(CACHE_PREFIXES.CREDENTIALS_UPDATED, inboxId),
    ];
    
    try {
      await this.redis.del(...keys);
      console.log(`[CredentialsCache] Invalidated cache for inbox ${inboxId}`);
      
      // Queue related cache invalidation
      cacheInvalidationManager.queueInvalidation(inboxId);
    } catch (error) {
      this.stats.errors++;
      cacheHealthMonitor.recordCacheOperation('error');
      console.error(`[CredentialsCache] Error invalidating credentials for inbox ${inboxId}:`, error);
    }
  }

  // Check if credentials were recently updated (to avoid unnecessary DB writes)
  async isCredentialsUpdated(inboxId: string): Promise<boolean> {
    const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS_UPDATED, inboxId);
    
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.stats.errors++;
      console.error(`[CredentialsCache] Error checking if credentials updated for inbox ${inboxId}:`, error);
      return false; // Assume not updated on error
    }
  }

  // Mark credentials as recently updated
  async markCredentialsUpdated(inboxId: string, ttl: number = TTL.CREDENTIALS_UPDATED): Promise<void> {
    const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS_UPDATED, inboxId);
    
    try {
      await this.redis.setex(key, ttl, new Date().toISOString());
      console.log(`[CredentialsCache] Marked credentials as updated for inbox ${inboxId}`, { ttl });
    } catch (error) {
      this.stats.errors++;
      console.error(`[CredentialsCache] Error marking credentials updated for inbox ${inboxId}:`, error);
    }
  }

  // Cache fallback chain to avoid repeated DB queries
  async getFallbackChain(inboxId: string): Promise<string[] | null> {
    const key = this.getCacheKey(CACHE_PREFIXES.FALLBACK_CHAIN, inboxId);
    
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      this.stats.errors++;
      console.error(`[CredentialsCache] Error getting fallback chain for inbox ${inboxId}:`, error);
      return null;
    }
  }

  // Set fallback chain in cache
  async setFallbackChain(inboxId: string, chain: string[], ttl: number = TTL.FALLBACK_CHAIN): Promise<void> {
    const key = this.getCacheKey(CACHE_PREFIXES.FALLBACK_CHAIN, inboxId);
    
    try {
      await this.redis.setex(key, ttl, JSON.stringify(chain));
      console.log(`[CredentialsCache] Fallback chain cached for inbox ${inboxId}`, { chain, ttl });
    } catch (error) {
      this.stats.errors++;
      console.error(`[CredentialsCache] Error setting fallback chain for inbox ${inboxId}:`, error);
    }
  }

  // Invalidate fallback chain cache
  async invalidateFallbackChain(inboxId: string): Promise<void> {
    const key = this.getCacheKey(CACHE_PREFIXES.FALLBACK_CHAIN, inboxId);
    
    try {
      await this.redis.del(key);
      console.log(`[CredentialsCache] Invalidated fallback chain for inbox ${inboxId}`);
    } catch (error) {
      this.stats.errors++;
      console.error(`[CredentialsCache] Error invalidating fallback chain for inbox ${inboxId}:`, error);
    }
  }

  // Batch operations for efficiency
  async batchGetCredentials(inboxIds: string[]): Promise<Map<string, WhatsAppCredentials | null>> {
    const keys = inboxIds.map(id => this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, id));
    const results = new Map<string, WhatsAppCredentials | null>();
    
    try {
      const values = await this.redis.mget(...keys);
      
      for (let i = 0; i < inboxIds.length; i++) {
        const inboxId = inboxIds[i];
        const value = values[i];
        
        if (value) {
          this.stats.hits++;
          results.set(inboxId, JSON.parse(value));
        } else {
          this.stats.misses++;
          results.set(inboxId, null);
        }
      }
      
      console.log(`[CredentialsCache] Batch get completed for ${inboxIds.length} inboxes`, {
        hits: values.filter(v => v !== null).length,
        misses: values.filter(v => v === null).length,
      });
      
      return results;
    } catch (error) {
      this.stats.errors++;
      console.error('[CredentialsCache] Error in batch get credentials:', error);
      
      // Return empty results on error
      for (const inboxId of inboxIds) {
        results.set(inboxId, null);
      }
      return results;
    }
  }

  // Batch set credentials
  async batchSetCredentials(
    credentialsMap: Map<string, WhatsAppCredentials>,
    ttl: number = TTL.CREDENTIALS
  ): Promise<void> {
    if (credentialsMap.size === 0) return;
    
    try {
      const pipeline = this.redis.pipeline();
      
      credentialsMap.forEach((credentials, inboxId) => {
        const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId);
        const serialized = JSON.stringify({
          ...credentials,
          updatedAt: new Date().toISOString(),
        });
        pipeline.setex(key, ttl, serialized);
      });
      
      await pipeline.exec();
      
      console.log(`[CredentialsCache] Batch set completed for ${credentialsMap.size} credentials`, { ttl });
    } catch (error) {
      this.stats.errors++;
      console.error('[CredentialsCache] Error in batch set credentials:', error);
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Reset cache statistics
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      lastUpdated: new Date(),
    };
  }

  // Check cache health
  async checkHealth(): Promise<CacheHealth> {
    const start = Date.now();
    
    try {
      await this.redis.ping();
      const latency = Date.now() - start;
      
      // Get memory usage if available
      let memoryUsage: string | undefined;
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory_human:(.+)/);
        memoryUsage = match ? match[1].trim() : undefined;
      } catch {
        // Ignore memory info errors
      }
      
      const health: CacheHealth = {
        isConnected: true,
        latency,
        memoryUsage,
        lastCheck: new Date(),
      };
      
      // Cache health status
      const healthKey = this.getCacheKey(CACHE_PREFIXES.HEALTH, 'status');
      await this.redis.setex(healthKey, TTL.HEALTH, JSON.stringify(health));
      
      return health;
    } catch (error) {
      console.error('[CredentialsCache] Health check failed:', error);
      return {
        isConnected: false,
        latency: Date.now() - start,
        lastCheck: new Date(),
      };
    }
  }

  // Clear all cache entries (use with caution)
  async clearAll(): Promise<void> {
    try {
      const pattern = 'chatwit:*';
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[CredentialsCache] Cleared ${keys.length} cache entries`);
      }
    } catch (error) {
      this.stats.errors++;
      console.error('[CredentialsCache] Error clearing cache:', error);
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      console.log('[CredentialsCache] Shutting down cache manager...');
      // Redis connection is shared, so we don't disconnect it here
    } catch (error) {
      console.error('[CredentialsCache] Error during shutdown:', error);
    }
  }
}

// Global cache instance
export const credentialsCache = new CredentialsCache();

// Utility functions for common operations
export async function getCachedCredentials(inboxId: string): Promise<WhatsAppCredentials | null> {
  return credentialsCache.getCredentials(inboxId);
}

export async function setCachedCredentials(
  inboxId: string,
  credentials: WhatsAppCredentials,
  ttl?: number
): Promise<void> {
  return credentialsCache.setCredentials(inboxId, credentials, ttl);
}

export async function invalidateCachedCredentials(inboxId: string): Promise<void> {
  return credentialsCache.invalidateCredentials(inboxId);
}

export async function isCredentialsRecentlyUpdated(inboxId: string): Promise<boolean> {
  return credentialsCache.isCredentialsUpdated(inboxId);
}

export async function markCredentialsAsUpdated(inboxId: string, ttl?: number): Promise<void> {
  return credentialsCache.markCredentialsUpdated(inboxId, ttl);
}

// Advanced cache invalidation strategies
export class CacheInvalidationManager {
  private static instance: CacheInvalidationManager;
  private invalidationQueue: Set<string> = new Set();
  private batchInvalidationTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_INVALIDATION_DELAY = 1000; // 1 second

  static getInstance(): CacheInvalidationManager {
    if (!this.instance) {
      this.instance = new CacheInvalidationManager();
    }
    return this.instance;
  }

  // Queue invalidation for batch processing
  queueInvalidation(inboxId: string): void {
    this.invalidationQueue.add(inboxId);
    
    // Set timer for batch processing if not already set
    if (!this.batchInvalidationTimer) {
      this.batchInvalidationTimer = setTimeout(() => {
        this.processBatchInvalidation();
      }, this.BATCH_INVALIDATION_DELAY);
    }
  }

  // Process batch invalidation
  private async processBatchInvalidation(): Promise<void> {
    if (this.invalidationQueue.size === 0) return;

    const inboxIds = Array.from(this.invalidationQueue);
    this.invalidationQueue.clear();
    this.batchInvalidationTimer = null;

    try {
      console.log(`[CacheInvalidationManager] Processing batch invalidation for ${inboxIds.length} inboxes`);
      
      // Invalidate credentials and fallback chains
      await Promise.all(inboxIds.map(async (inboxId) => {
        await credentialsCache.invalidateCredentials(inboxId);
        await credentialsCache.invalidateFallbackChain(inboxId);
      }));

      console.log(`[CacheInvalidationManager] Batch invalidation completed for ${inboxIds.length} inboxes`);
    } catch (error) {
      console.error('[CacheInvalidationManager] Error in batch invalidation:', error);
    }
  }

  // Invalidate related caches when credentials are updated
  async invalidateRelatedCaches(inboxId: string): Promise<void> {
    try {
      // Invalidate the inbox itself
      await credentialsCache.invalidateCredentials(inboxId);
      await credentialsCache.invalidateFallbackChain(inboxId);

      // Find and invalidate inboxes that use this inbox as fallback
      const dependentInboxes = await this.findDependentInboxes(inboxId);
      for (const dependentInboxId of dependentInboxes) {
        await credentialsCache.invalidateCredentials(dependentInboxId);
        await credentialsCache.invalidateFallbackChain(dependentInboxId);
      }

      console.log(`[CacheInvalidationManager] Invalidated related caches for inbox: ${inboxId}`, {
        dependentInboxes: dependentInboxes.length,
      });
    } catch (error) {
      console.error(`[CacheInvalidationManager] Error invalidating related caches for inbox: ${inboxId}`, error);
    }
  }

  // Find inboxes that depend on this inbox for fallback
  private async findDependentInboxes(inboxId: string): Promise<string[]> {
    try {
      const { prisma } = await import('../prisma');
      
      const dependentInboxes = await prisma.chatwitInbox.findMany({
        where: { fallbackParaInboxId: inboxId },
        select: { inboxId: true },
      });

      return dependentInboxes.map(inbox => inbox.inboxId);
    } catch (error) {
      console.error(`[CacheInvalidationManager] Error finding dependent inboxes for: ${inboxId}`, error);
      return [];
    }
  }
}

// Cache warming strategies
export class CacheWarmingManager {
  private static instance: CacheWarmingManager;
  private warmingInProgress = false;

  static getInstance(): CacheWarmingManager {
    if (!this.instance) {
      this.instance = new CacheWarmingManager();
    }
    return this.instance;
  }

  // Warm cache for frequently accessed credentials
  async warmFrequentlyAccessedCredentials(): Promise<void> {
    if (this.warmingInProgress) {
      console.log('[CacheWarmingManager] Cache warming already in progress, skipping');
      return;
    }

    this.warmingInProgress = true;

    try {
      console.log('[CacheWarmingManager] Starting cache warming for frequently accessed credentials');
      
      const { prisma } = await import('../prisma');
      
      // Get active inboxes (those with recent activity)
      const activeInboxes = await prisma.chatwitInbox.findMany({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        select: {
          inboxId: true,
          whatsappApiKey: true,
          phoneNumberId: true,
          whatsappBusinessAccountId: true,
          updatedAt: true,
        },
        take: 100, // Limit to top 100 active inboxes
      });

      console.log(`[CacheWarmingManager] Found ${activeInboxes.length} active inboxes to warm`);

      // Warm cache for each active inbox
      for (const inbox of activeInboxes) {
        try {
          if (inbox.whatsappApiKey && inbox.phoneNumberId && inbox.whatsappBusinessAccountId) {
            const credentials: WhatsAppCredentials = {
              whatsappApiKey: inbox.whatsappApiKey,
              phoneNumberId: inbox.phoneNumberId,
              businessId: inbox.whatsappBusinessAccountId,
              inboxId: inbox.inboxId,
              source: 'inbox',
              updatedAt: inbox.updatedAt,
            };

            await credentialsCache.setCredentials(inbox.inboxId, credentials);
          }
        } catch (error) {
          console.error(`[CacheWarmingManager] Error warming cache for inbox: ${inbox.inboxId}`, error);
        }
      }

      console.log(`[CacheWarmingManager] Cache warming completed for ${activeInboxes.length} inboxes`);
    } catch (error) {
      console.error('[CacheWarmingManager] Error during cache warming:', error);
    } finally {
      this.warmingInProgress = false;
    }
  }

  // Warm cache for specific inboxes
  async warmSpecificInboxes(inboxIds: string[]): Promise<void> {
    try {
      console.log(`[CacheWarmingManager] Warming cache for specific inboxes: ${inboxIds.length}`);
      
      const { CredentialsFallbackResolver } = await import('../../worker/WebhookWorkerTasks/persistencia.worker.task');
      
      // Warm cache for each specified inbox
      for (const inboxId of inboxIds) {
        try {
          const credentials = await CredentialsFallbackResolver.resolveCredentials(inboxId);
          if (credentials) {
            await credentialsCache.setCredentials(inboxId, credentials);
          }
        } catch (error) {
          console.error(`[CacheWarmingManager] Error warming cache for inbox: ${inboxId}`, error);
        }
      }

      console.log(`[CacheWarmingManager] Specific cache warming completed for ${inboxIds.length} inboxes`);
    } catch (error) {
      console.error('[CacheWarmingManager] Error during specific cache warming:', error);
    }
  }

  // Schedule periodic cache warming
  startPeriodicWarming(): void {
    // Warm cache every 30 minutes
    setInterval(() => {
      this.warmFrequentlyAccessedCredentials().catch(error => {
        console.error('[CacheWarmingManager] Error in periodic cache warming:', error);
      });
    }, 30 * 60 * 1000);

    console.log('[CacheWarmingManager] Periodic cache warming scheduled');
  }
}

// Cache health monitoring and automatic recovery
export class CacheHealthMonitor {
  private static instance: CacheHealthMonitor;
  private healthStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    lastHealthCheck: new Date(),
    averageLatency: 0,
    latencyMeasurements: [] as number[],
  };

  static getInstance(): CacheHealthMonitor {
    if (!this.instance) {
      this.instance = new CacheHealthMonitor();
    }
    return this.instance;
  }

  // Record cache operation
  recordCacheOperation(type: 'hit' | 'miss' | 'error', latency?: number): void {
    this.healthStats.totalRequests++;
    
    switch (type) {
      case 'hit':
        this.healthStats.cacheHits++;
        break;
      case 'miss':
        this.healthStats.cacheMisses++;
        break;
      case 'error':
        this.healthStats.errors++;
        break;
    }

    if (latency !== undefined) {
      this.healthStats.latencyMeasurements.push(latency);
      
      // Keep only last 100 measurements
      if (this.healthStats.latencyMeasurements.length > 100) {
        this.healthStats.latencyMeasurements.shift();
      }

      // Calculate average latency
      this.healthStats.averageLatency = 
        this.healthStats.latencyMeasurements.reduce((sum, lat) => sum + lat, 0) / 
        this.healthStats.latencyMeasurements.length;
    }
  }

  // Get cache performance statistics
  getPerformanceStats(): {
    hitRate: number;
    errorRate: number;
    averageLatency: number;
    totalRequests: number;
    lastHealthCheck: Date;
  } {
    const hitRate = this.healthStats.totalRequests > 0 
      ? (this.healthStats.cacheHits / this.healthStats.totalRequests) * 100 
      : 0;
    
    const errorRate = this.healthStats.totalRequests > 0 
      ? (this.healthStats.errors / this.healthStats.totalRequests) * 100 
      : 0;

    return {
      hitRate: Math.round(hitRate * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      averageLatency: Math.round(this.healthStats.averageLatency * 100) / 100,
      totalRequests: this.healthStats.totalRequests,
      lastHealthCheck: this.healthStats.lastHealthCheck,
    };
  }

  // Check cache health and trigger recovery if needed
  async checkHealthAndRecover(): Promise<void> {
    try {
      const health = await credentialsCache.checkHealth();
      this.healthStats.lastHealthCheck = new Date();

      if (!health.isConnected) {
        console.warn('[CacheHealthMonitor] Cache is not connected, attempting recovery');
        await this.attemptRecovery();
      } else if (health.latency > 1000) { // High latency threshold
        console.warn(`[CacheHealthMonitor] High cache latency detected: ${health.latency}ms`);
      }

      // Log performance stats periodically
      const stats = this.getPerformanceStats();
      if (stats.totalRequests > 0) {
        console.log('[CacheHealthMonitor] Performance stats:', stats);
      }

      // Alert on low hit rate
      if (stats.hitRate < 50 && stats.totalRequests > 100) {
        console.warn(`[CacheHealthMonitor] Low cache hit rate: ${stats.hitRate}%`);
      }

      // Alert on high error rate
      if (stats.errorRate > 5 && stats.totalRequests > 100) {
        console.warn(`[CacheHealthMonitor] High cache error rate: ${stats.errorRate}%`);
      }

    } catch (error) {
      console.error('[CacheHealthMonitor] Error during health check:', error);
    }
  }

  // Attempt cache recovery
  private async attemptRecovery(): Promise<void> {
    try {
      console.log('[CacheHealthMonitor] Attempting cache recovery...');
      
      // Try to reconnect (this would depend on your Redis setup)
      const health = await credentialsCache.checkHealth();
      
      if (health.isConnected) {
        console.log('[CacheHealthMonitor] Cache recovery successful');
        
        // Warm cache after recovery
        const warmingManager = CacheWarmingManager.getInstance();
        await warmingManager.warmFrequentlyAccessedCredentials();
      } else {
        console.error('[CacheHealthMonitor] Cache recovery failed');
      }
    } catch (error) {
      console.error('[CacheHealthMonitor] Error during cache recovery:', error);
    }
  }

  // Start health monitoring
  startHealthMonitoring(): void {
    // Check health every 5 minutes
    setInterval(() => {
      this.checkHealthAndRecover().catch(error => {
        console.error('[CacheHealthMonitor] Error in health monitoring:', error);
      });
    }, 5 * 60 * 1000);

    // Reset stats every hour
    setInterval(() => {
      this.resetStats();
    }, 60 * 60 * 1000);

    console.log('[CacheHealthMonitor] Health monitoring started');
  }

  // Reset statistics
  private resetStats(): void {
    const oldStats = { ...this.healthStats };
    
    this.healthStats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      lastHealthCheck: new Date(),
      averageLatency: 0,
      latencyMeasurements: [],
    };

    console.log('[CacheHealthMonitor] Stats reset', {
      previousHour: {
        hitRate: oldStats.totalRequests > 0 ? (oldStats.cacheHits / oldStats.totalRequests) * 100 : 0,
        totalRequests: oldStats.totalRequests,
        errors: oldStats.errors,
      },
    });
  }
}

// Enhanced cache warming utility
export async function warmCache(inboxIds: string[]): Promise<void> {
  const warmingManager = CacheWarmingManager.getInstance();
  await warmingManager.warmSpecificInboxes(inboxIds);
}

// Enhanced cache maintenance with monitoring and recovery
export function startCacheMaintenance(): void {
  const invalidationManager = CacheInvalidationManager.getInstance();
  const warmingManager = CacheWarmingManager.getInstance();
  const healthMonitor = CacheHealthMonitor.getInstance();

  // Start all monitoring and maintenance services
  warmingManager.startPeriodicWarming();
  healthMonitor.startHealthMonitoring();

  // Original health check (now enhanced)
  setInterval(async () => {
    try {
      await healthMonitor.checkHealthAndRecover();
    } catch (error) {
      console.error('[CredentialsCache] Maintenance error:', error);
    }
  }, 60 * 60 * 1000);
  
  console.log('[CredentialsCache] Enhanced cache maintenance started');
}

// Export manager instances for external use
export const cacheInvalidationManager = CacheInvalidationManager.getInstance();
export const cacheWarmingManager = CacheWarmingManager.getInstance();
export const cacheHealthMonitor = CacheHealthMonitor.getInstance();