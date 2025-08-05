/**
 * Per-Conversation Processing Lock Service
 * 
 * Ensures maximum 1 job in parallel per conversation_id to maintain response ordering.
 * Uses Redis mutex lock with pattern: lock:cw:${conversation_id}
 */

import { getRedisInstance } from '../../connections';
// Lazy import to avoid Edge Runtime issues
type Redis = any;

export interface ConversationLockParams {
  conversationId: number;
  ttlSeconds?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface ConversationLockResult {
  acquired: boolean;
  lockKey: string;
  lockValue: string;
  expiresAt: number;
}

export interface ConversationLockInfo {
  isLocked: boolean;
  lockKey: string;
  ttl: number;
  lockedBy?: string;
}

export class ConversationLock {
  private redis: Redis;
  private readonly defaultTtl = 300; // 5 minutes
  private readonly defaultRetryAttempts = 3;
  private readonly defaultRetryDelay = 100; // 100ms

  constructor() {
    this.redis = getRedisInstance();
  }

  /**
   * Generate lock key for conversation
   */
  private generateLockKey(conversationId: number): string {
    return `lock:cw:${conversationId}`;
  }

  /**
   * Generate unique lock value for this process/request
   */
  private generateLockValue(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Acquire lock for conversation processing
   * Uses Redis SETNX with TTL for atomic lock acquisition
   */
  async acquireLock(params: ConversationLockParams): Promise<ConversationLockResult> {
    const lockKey = this.generateLockKey(params.conversationId);
    const lockValue = this.generateLockValue();
    const ttl = params.ttlSeconds || this.defaultTtl;
    const retryAttempts = params.retryAttempts || this.defaultRetryAttempts;
    const retryDelay = params.retryDelayMs || this.defaultRetryDelay;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        // Use SET with NX (only if not exists) and EX (expiry) for atomic operation
        const result = await this.redis.set(lockKey, lockValue, 'EX', ttl, 'NX');
        
        if (result === 'OK') {
          const expiresAt = Date.now() + (ttl * 1000);
          
          return {
            acquired: true,
            lockKey,
            lockValue,
            expiresAt
          };
        }

        // Lock not acquired, wait before retry (except on last attempt)
        if (attempt < retryAttempts) {
          await this.sleep(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      } catch (error) {
        console.error(`Error acquiring lock for conversation ${params.conversationId}:`, error);
        
        // On Redis error, fail fast on last attempt
        if (attempt === retryAttempts) {
          return {
            acquired: false,
            lockKey,
            lockValue,
            expiresAt: 0
          };
        }
        
        // Wait before retry on error
        await this.sleep(retryDelay);
      }
    }

    // All attempts failed
    return {
      acquired: false,
      lockKey,
      lockValue,
      expiresAt: 0
    };
  }

  /**
   * Release lock for conversation
   * Uses Lua script to ensure only the lock owner can release it
   */
  async releaseLock(conversationId: number, lockValue: string): Promise<boolean> {
    const lockKey = this.generateLockKey(conversationId);
    
    // Lua script to atomically check and delete lock
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, lockKey, lockValue) as number;
      return result === 1;
    } catch (error) {
      console.error(`Error releasing lock for conversation ${conversationId}:`, error);
      return false;
    }
  }

  /**
   * Extend lock TTL (useful for long-running operations)
   * Only the lock owner can extend the lock
   */
  async extendLock(conversationId: number, lockValue: string, additionalTtlSeconds: number): Promise<boolean> {
    const lockKey = this.generateLockKey(conversationId);
    
    // Lua script to atomically check ownership and extend TTL
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("EXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, lockKey, lockValue, additionalTtlSeconds) as number;
      return result === 1;
    } catch (error) {
      console.error(`Error extending lock for conversation ${conversationId}:`, error);
      return false;
    }
  }

  /**
   * Check if conversation is currently locked
   */
  async isLocked(conversationId: number): Promise<ConversationLockInfo> {
    const lockKey = this.generateLockKey(conversationId);
    
    try {
      const [lockValue, ttl] = await Promise.all([
        this.redis.get(lockKey),
        this.redis.ttl(lockKey)
      ]);

      return {
        isLocked: lockValue !== null,
        lockKey,
        ttl: ttl || 0,
        lockedBy: lockValue || undefined
      };
    } catch (error) {
      console.error(`Error checking lock status for conversation ${conversationId}:`, error);
      return {
        isLocked: false,
        lockKey,
        ttl: 0
      };
    }
  }

  /**
   * Force release lock (admin operation)
   * Should be used carefully as it can break processing guarantees
   */
  async forceReleaseLock(conversationId: number): Promise<boolean> {
    const lockKey = this.generateLockKey(conversationId);
    
    try {
      const result = await this.redis.del(lockKey);
      return result === 1;
    } catch (error) {
      console.error(`Error force releasing lock for conversation ${conversationId}:`, error);
      return false;
    }
  }

  /**
   * Get all active locks (for monitoring/debugging)
   */
  async getActiveLocks(pattern?: string): Promise<Array<{
    conversationId: number;
    lockKey: string;
    lockedBy: string;
    ttl: number;
  }>> {
    const searchPattern = pattern || 'lock:cw:*';
    
    try {
      const keys = await this.redis.keys(searchPattern);
      
      if (keys.length === 0) {
        return [];
      }

      // Get values and TTLs for all keys
      const pipeline = this.redis.pipeline();
      keys.forEach((key: string) => {
        pipeline.get(key);
        pipeline.ttl(key);
      });

      const results = await pipeline.exec();
      
      if (!results) {
        return [];
      }

      const locks: Array<{
        conversationId: number;
        lockKey: string;
        lockedBy: string;
        ttl: number;
      }> = [];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = results[i * 2][1] as string;
        const ttl = results[i * 2 + 1][1] as number;
        
        if (value) {
          // Extract conversation ID from key
          const match = key.match(/^lock:cw:(\d+)$/);
          if (match) {
            locks.push({
              conversationId: parseInt(match[1]),
              lockKey: key,
              lockedBy: value,
              ttl
            });
          }
        }
      }

      return locks;
    } catch (error) {
      console.error('Error getting active locks:', error);
      return [];
    }
  }

  /**
   * Clean up expired locks (maintenance operation)
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const activeLocks = await this.getActiveLocks();
      let cleanedCount = 0;

      for (const lock of activeLocks) {
        if (lock.ttl <= 0) {
          const released = await this.forceReleaseLock(lock.conversationId);
          if (released) {
            cleanedCount++;
          }
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up expired locks:', error);
      return 0;
    }
  }

  /**
   * Execute function with conversation lock
   * Automatically acquires lock, executes function, and releases lock
   */
  async withLock<T>(
    conversationId: number,
    fn: () => Promise<T>,
    options?: {
      ttlSeconds?: number;
      retryAttempts?: number;
      retryDelayMs?: number;
    }
  ): Promise<{ success: boolean; result?: T; error?: Error }> {
    const lockResult = await this.acquireLock({
      conversationId,
      ...options
    });

    if (!lockResult.acquired) {
      return {
        success: false,
        error: new Error(`Failed to acquire lock for conversation ${conversationId}`)
      };
    }

    try {
      const result = await fn();
      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    } finally {
      // Always try to release the lock
      await this.releaseLock(conversationId, lockResult.lockValue);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const conversationLock = new ConversationLock();