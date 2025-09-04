/**
 * SocialWise Flow Idempotency Service
 * Based on requirements 4.2, 4.5
 */

import { getRedisInstance } from '@/lib/connections';
import { SocialWiseFlowPayloadType, type SocialWiseChatwitData } from '../schemas/payload';

export interface SocialWiseIdempotencyKey {
  wamid?: string;
  messageId?: string;
  sessionId: string;
  accountId: string;
  inboxId: string;
}

export class SocialWiseIdempotencyService {
  private readonly redis: any;
  private readonly ttl: number; // seconds

  constructor(ttl: number = 86400) { // 24 hours default
    this.redis = getRedisInstance();
    this.ttl = ttl;
  }

  /**
   * Generate idempotency key for SocialWise payloads
   * Format: sw:idem:{accountId}:{inboxId}:{wamid|messageId}
   */
  private generateKey(key: SocialWiseIdempotencyKey): string {
    const identifier = key.wamid || key.messageId || key.sessionId;
    return `sw:idem:${key.accountId}:${key.inboxId}:${identifier}`;
  }

  /**
   * Extract idempotency key from SocialWise payload
   */
  extractIdempotencyKey(payload: SocialWiseFlowPayloadType): SocialWiseIdempotencyKey {
    const socialwiseContext = payload.context['socialwise-chatwit'] as SocialWiseChatwitData | undefined;
    
    // Primary identifier: context.message.source_id (wamid)
    const wamid = payload.context.message?.source_id;
    
    // Fallback identifier: context.message.id
    const messageId = payload.context.message?.id ? String(payload.context.message.id) : undefined;
    
    // Account and inbox IDs (convert to string for consistency) with fallbacks
    const accountId = String(
      socialwiseContext?.account_data?.id || 
      payload.context.inbox?.account_id || 
      0
    );
    const inboxId = String(
      socialwiseContext?.inbox_data?.id || 
      payload.context.inbox?.id || 
      0
    );
    const sessionId = payload.session_id;

    return {
      wamid,
      messageId,
      sessionId,
      accountId,
      inboxId,
    };
  }

  /**
   * Check if message is duplicate using SETNX
   * Returns true if duplicate (key already exists)
   */
  async isDuplicate(key: SocialWiseIdempotencyKey): Promise<boolean> {
    try {
      // 🔧 CORREÇÃO: Verificar se idempotência está desabilitada para testes
      const isDisabled = await this.redis.get('test:disable_idempotency');
      if (isDisabled) {
        console.log('🧪 Idempotência desabilitada para testes - permitindo duplicatas');
        return false; // Não é duplicata quando desabilitada
      }
      
      const redisKey = this.generateKey(key);
      
      // SETNX with TTL - returns 1 if key was set (not duplicate), 0 if key already exists (duplicate)
      const result = await this.redis.set(redisKey, '1', 'EX', this.ttl, 'NX');
      
      // If result is null, key already exists (duplicate)
      return result === null;
    } catch (error) {
      // Log error but don't block processing - fail open for availability
      console.error('SocialWise idempotency check failed:', error);
      return false;
    }
  }

  /**
   * Check if payload is duplicate by extracting key automatically
   */
  async isPayloadDuplicate(payload: SocialWiseFlowPayloadType): Promise<boolean> {
    const key = this.extractIdempotencyKey(payload);
    return this.isDuplicate(key);
  }

  /**
   * Mark message as processed (for testing/manual operations)
   */
  async markAsProcessed(key: SocialWiseIdempotencyKey): Promise<void> {
    try {
      const redisKey = this.generateKey(key);
      await this.redis.setex(redisKey, this.ttl, '1');
    } catch (error) {
      console.error('Failed to mark SocialWise message as processed:', error);
      throw error;
    }
  }

  /**
   * Remove idempotency key (for testing/cleanup)
   */
  async removeKey(key: SocialWiseIdempotencyKey): Promise<void> {
    try {
      const redisKey = this.generateKey(key);
      await this.redis.del(redisKey);
    } catch (error) {
      console.error('Failed to remove SocialWise idempotency key:', error);
      throw error;
    }
  }

  /**
   * Check if key exists without setting it
   */
  async keyExists(key: SocialWiseIdempotencyKey): Promise<boolean> {
    try {
      const redisKey = this.generateKey(key);
      const exists = await this.redis.exists(redisKey);
      return exists === 1;
    } catch (error) {
      console.error('Failed to check SocialWise key existence:', error);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async getKeyTTL(key: SocialWiseIdempotencyKey): Promise<number> {
    try {
      const redisKey = this.generateKey(key);
      return await this.redis.ttl(redisKey);
    } catch (error) {
      console.error('Failed to get SocialWise key TTL:', error);
      return -1;
    }
  }
}