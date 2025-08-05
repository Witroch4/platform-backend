/**
 * Queue Management Cache Manager
 * 
 * Central cache management system with intelligent invalidation
 */

import { getRedisInstance } from '../../../lib/connections'
import { getQueueManagementConfig } from '../config'
import { CACHE_KEYS } from '../constants'

export interface CacheOptions {
  ttl?: number // seconds
  compress?: boolean
  serialize?: boolean
}

export interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  hitRate: number
}

export class CacheManager {
  private redis: ReturnType<typeof getRedisInstance>
  private connectionPool: ReturnType<typeof getRedisInstance>[] = []
  private poolSize: number = 5
  private currentPoolIndex: number = 0
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
  }
  private config = getQueueManagementConfig()
  private invalidationSubscriber: ReturnType<typeof getRedisInstance> | null = null

  constructor(redis?: ReturnType<typeof getRedisInstance>) {
    if (redis) {
      this.redis = redis
      this.initializeConnectionPool()
    } else {
      this.redis = getRedisInstance()
      this.initializeConnectionPool()
    }

    // Set up intelligent cache invalidation
    this.setupCacheInvalidation()

    // Set up error handling
    this.redis.on('error', (error: Error) => {
      console.error('Redis cache error:', error)
    })

    this.redis.on('connect', () => {
      console.log('Redis cache connected')
    })
  }

  /**
   * Initialize connection pool for better performance
   */
  private initializeConnectionPool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const connection = getRedisInstance()
      this.connectionPool.push(connection)
    }
    console.log(`Initialized Redis connection pool with ${this.poolSize} connections`)
  }



  /**
   * Get connection from pool (round-robin)
   */
  private getPooledConnection(): ReturnType<typeof getRedisInstance> {
    const connection = this.connectionPool[this.currentPoolIndex]
    this.currentPoolIndex = (this.currentPoolIndex + 1) % this.poolSize
    return connection!
  }

  /**
   * Setup intelligent cache invalidation based on events
   */
  private setupCacheInvalidation(): void {
    this.invalidationSubscriber = getRedisInstance()
    
    // Subscribe to queue events for cache invalidation
    this.invalidationSubscriber.subscribe(
      'queue:events',
      'job:events',
      'metrics:events',
      'system:events'
    )

    this.invalidationSubscriber.on('message', async (channel: string, message: string) => {
      try {
        const event = JSON.parse(message)
        await this.handleCacheInvalidationEvent(event)
      } catch (error) {
        console.error('Cache invalidation error:', error)
      }
    })
  }

  /**
   * Handle cache invalidation events
   */
  private async handleCacheInvalidationEvent(event: any): Promise<void> {
    const { type, queueName, jobId } = event

    switch (type) {
      case 'queue.updated':
      case 'queue.paused':
      case 'queue.resumed':
        await this.invalidateQueueCache(queueName)
        break
      
      case 'job.completed':
      case 'job.failed':
      case 'job.retried':
        await this.invalidateJobCache(jobId)
        await this.invalidateQueueMetrics(queueName)
        break
      
      case 'metrics.updated':
        await this.invalidateMetricsCache(queueName)
        break
      
      case 'system.updated':
        await this.invalidateSystemCache()
        break
    }
  }

  /**
   * Invalidate queue-specific cache
   */
  private async invalidateQueueCache(queueName: string): Promise<void> {
    const patterns = [
      `queue:health:${queueName}`,
      `queue:config:${queueName}`,
      `queue:metrics:${queueName}:*`,
      `metrics:*:${queueName}:*`
    ]

    for (const pattern of patterns) {
      await this.deletePattern(pattern)
    }
  }

  /**
   * Invalidate job-specific cache
   */
  private async invalidateJobCache(jobId: string): Promise<void> {
    const patterns = [
      `job:*:${jobId}`,
      `metrics:job:${jobId}:*`
    ]

    for (const pattern of patterns) {
      await this.deletePattern(pattern)
    }
  }

  /**
   * Invalidate metrics cache for a queue
   */
  private async invalidateQueueMetrics(queueName: string): Promise<void> {
    const patterns = [
      `metrics:*:${queueName}:*`,
      `metrics:aggregated:${queueName}:*`,
      `metrics:realtime`,
      `metrics:dashboard`
    ]

    for (const pattern of patterns) {
      await this.deletePattern(pattern)
    }
  }

  /**
   * Invalidate metrics cache for a queue
   */
  private async invalidateMetricsCache(queueName: string): Promise<void> {
    const patterns = [
      `metrics:*:${queueName}:*`,
      `metrics:aggregated:${queueName}:*`,
      `metrics:realtime`,
      `metrics:dashboard`
    ]

    for (const pattern of patterns) {
      await this.deletePattern(pattern)
    }
  }

  /**
   * Invalidate system-wide cache
   */
  private async invalidateSystemCache(): Promise<void> {
    const patterns = [
      'system:*',
      'metrics:system:*',
      'metrics:dashboard'
    ]

    for (const pattern of patterns) {
      await this.deletePattern(pattern)
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key)
      
      if (value === null) {
        this.stats.misses++
        this.updateHitRate()
        return null
      }

      this.stats.hits++
      this.updateHitRate()

      try {
        return JSON.parse(value) as T
      } catch {
        return value as T
      }
    } catch (error) {
      console.error('Cache get error:', error)
      this.stats.misses++
      this.updateHitRate()
      return null
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value)
      const ttl = options.ttl || this.getDefaultTTL(key)

      if (ttl > 0) {
        await this.redis.setex(key, ttl, serializedValue)
      } else {
        await this.redis.set(key, serializedValue)
      }

      this.stats.sets++
      return true
    } catch (error) {
      console.error('Cache set error:', error)
      return false
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key)
      this.stats.deletes++
      return result > 0
    } catch (error) {
      console.error('Cache delete error:', error)
      return false
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern)
      if (keys.length === 0) return 0

      const result = await this.redis.del(...keys)
      this.stats.deletes += keys.length
      return result
    } catch (error) {
      console.error('Cache delete pattern error:', error)
      return 0
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key)
      return result === 1
    } catch (error) {
      console.error('Cache exists error:', error)
      return false
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, ttl)
      return result === 1
    } catch (error) {
      console.error('Cache expire error:', error)
      return false
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key)
    } catch (error) {
      console.error('Cache TTL error:', error)
      return -1
    }
  }

  /**
   * Increment counter
   */
  async increment(key: string, by: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, by)
    } catch (error) {
      console.error('Cache increment error:', error)
      return 0
    }
  }

  /**
   * Add to set
   */
  async addToSet(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.sadd(key, ...members)
    } catch (error) {
      console.error('Cache add to set error:', error)
      return 0
    }
  }

  /**
   * Get set members
   */
  async getSetMembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key)
    } catch (error) {
      console.error('Cache get set members error:', error)
      return []
    }
  }

  /**
   * Remove from set
   */
  async removeFromSet(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.srem(key, ...members)
    } catch (error) {
      console.error('Cache remove from set error:', error)
      return 0
    }
  }

  /**
   * Add to sorted set
   */
  async addToSortedSet(key: string, score: number, member: string): Promise<number> {
    try {
      return await this.redis.zadd(key, score, member)
    } catch (error) {
      console.error('Cache add to sorted set error:', error)
      return 0
    }
  }

  /**
   * Get sorted set range
   */
  async getSortedSetRange(key: string, start: number = 0, stop: number = -1, withScores: boolean = false): Promise<string[]> {
    try {
      if (withScores) {
        return await this.redis.zrange(key, start, stop, 'WITHSCORES')
      }
      return await this.redis.zrange(key, start, stop)
    } catch (error) {
      console.error('Cache get sorted set range error:', error)
      return []
    }
  }

  /**
   * Push to list
   */
  async pushToList(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.redis.lpush(key, ...values)
    } catch (error) {
      console.error('Cache push to list error:', error)
      return 0
    }
  }

  /**
   * Get list range
   */
  async getListRange(key: string, start: number = 0, stop: number = -1): Promise<string[]> {
    try {
      return await this.redis.lrange(key, start, stop)
    } catch (error) {
      console.error('Cache get list range error:', error)
      return []
    }
  }

  /**
   * Set hash field
   */
  async setHashField(key: string, field: string, value: any): Promise<boolean> {
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value)
      const result = await this.redis.hset(key, field, serializedValue)
      return result === 1
    } catch (error) {
      console.error('Cache set hash field error:', error)
      return false
    }
  }

  /**
   * Get hash field
   */
  async getHashField<T = any>(key: string, field: string): Promise<T | null> {
    try {
      const value = await this.redis.hget(key, field)
      if (value === null) return null

      try {
        return JSON.parse(value) as T
      } catch {
        return value as T
      }
    } catch (error) {
      console.error('Cache get hash field error:', error)
      return null
    }
  }

  /**
   * Get all hash fields
   */
  async getHashAll<T = any>(key: string): Promise<Record<string, T>> {
    try {
      const hash = await this.redis.hgetall(key)
      const result: Record<string, T> = {}

      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value as string) as T
        } catch {
          result[field] = value as T
        }
      }

      return result
    } catch (error) {
      console.error('Cache get hash all error:', error)
      return {}
    }
  }

  /**
   * Delete hash field
   */
  async deleteHashField(key: string, ...fields: string[]): Promise<number> {
    try {
      return await this.redis.hdel(key, ...fields)
    } catch (error) {
      console.error('Cache delete hash field error:', error)
      return 0
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
    }
  }

  /**
   * Get Redis info
   */
  async getRedisInfo(): Promise<Record<string, string>> {
    try {
      const info = await this.redis.info()
      const lines = info.split('\r\n')
      const result: Record<string, string> = {}

      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':')
          result[key] = value
        }
      }

      return result
    } catch (error) {
      console.error('Get Redis info error:', error)
      return {}
    }
  }

  /**
   * Flush all cache data
   */
  async flush(): Promise<boolean> {
    try {
      await this.redis.flushdb()
      this.resetStats()
      return true
    } catch (error) {
      console.error('Cache flush error:', error)
      return false
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit()
    } catch (error) {
      console.error('Cache close error:', error)
    }
  }

  /**
   * Get default TTL for key based on key pattern
   */
  private getDefaultTTL(key: string): number {
    const { cacheTtl } = this.config.performance

    if (key.includes('queue:health')) {
      return cacheTtl.queueHealth
    }
    if (key.includes('queue:config')) {
      return cacheTtl.queueConfig
    }
    if (key.includes('user:session')) {
      return cacheTtl.userSession
    }
    if (key.includes('metrics')) {
      return cacheTtl.metrics
    }

    return 300 // Default 5 minutes
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0
  }
}

// Singleton instance
let cacheManager: CacheManager | null = null

/**
 * Get cache manager instance
 */
export function getCacheManager(): CacheManager {
  if (!cacheManager) {
    cacheManager = new CacheManager()
  }
  return cacheManager
}

/**
 * Set cache manager instance (useful for testing)
 */
export function setCacheManager(manager: CacheManager): void {
  cacheManager = manager
}

export default getCacheManager