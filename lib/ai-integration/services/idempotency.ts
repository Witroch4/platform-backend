/**
 * Idempotency Service
 * Based on requirements 2.1, 2.2
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { IdempotencyKey } from '../types/webhook';

export class IdempotencyService {
  private readonly redis: Redis;
  private readonly ttl: number; // seconds

  constructor(redis: Redis, ttl: number = 300) { // 5 minutes
    this.redis = redis;
    this.ttl = ttl;
  }

  /**
   * Generate idempotency key: idem:cw:${account_id}:${conversation_id}:${message_id}
   */
  private generateKey(idempotencyKey: IdempotencyKey): string {
    return `idem:cw:${idempotencyKey.accountId}:${idempotencyKey.conversationId}:${idempotencyKey.messageId}`;
  }

  /**
   * Check if message is duplicate using SETNX
   * Returns true if duplicate (key already exists)
   */
  async isDuplicate(idempotencyKey: IdempotencyKey): Promise<boolean> {
    try {
      const key = this.generateKey(idempotencyKey);
      
      // SETNX with TTL - returns 1 if key was set (not duplicate), 0 if key already exists (duplicate)
      const result = await this.redis.set(key, '1', 'EX', this.ttl, 'NX');
      
      // If result is null, key already exists (duplicate)
      return result === null;
    } catch (error) {
      // Log error but don't block processing - fail open for availability
      console.error('Idempotency check failed:', error);
      return false;
    }
  }

  /**
   * Mark message as processed (for testing/manual operations)
   */
  async markAsProcessed(idempotencyKey: IdempotencyKey): Promise<void> {
    try {
      const key = this.generateKey(idempotencyKey);
      await this.redis.setex(key, this.ttl, '1');
    } catch (error) {
      console.error('Failed to mark message as processed:', error);
      throw error;
    }
  }

  /**
   * Remove idempotency key (for testing/cleanup)
   */
  async removeKey(idempotencyKey: IdempotencyKey): Promise<void> {
    try {
      const key = this.generateKey(idempotencyKey);
      await this.redis.del(key);
    } catch (error) {
      console.error('Failed to remove idempotency key:', error);
      throw error;
    }
  }

  /**
   * Check if key exists without setting it
   */
  async keyExists(idempotencyKey: IdempotencyKey): Promise<boolean> {
    try {
      const key = this.generateKey(idempotencyKey);
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Failed to check key existence:', error);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async getKeyTTL(idempotencyKey: IdempotencyKey): Promise<number> {
    try {
      const key = this.generateKey(idempotencyKey);
      return await this.redis.ttl(key);
    } catch (error) {
      console.error('Failed to get key TTL:', error);
      return -1;
    }
  }
}