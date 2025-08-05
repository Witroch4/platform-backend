/**
 * Outbound Idempotency Service
 * 
 * Prevents "double post" by maintaining a Redis journal of sent messages
 * with payload hashing and TTL-based cleanup.
 */

import crypto from 'crypto';
import log from '@/lib/log';
import { ChatwitMessagePayload } from '../types/chatwit-api';

export interface IdempotencyKey {
  conversationId: number;
  payloadHash: string;
  fullKey: string;
}

export interface IdempotencyRecord {
  conversationId: number;
  payloadHash: string;
  sentAt: number;
  traceId: string;
  status: 'sent' | 'failed' | 'retrying';
  attemptCount: number;
  lastError?: string;
}

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingRecord?: IdempotencyRecord;
  key: IdempotencyKey;
}

export class OutboundIdempotencyService {
  private readonly keyPrefix = 'out';
  private readonly ttlSeconds = 60; // 60 seconds as per requirements
  private readonly maxPayloadSize = 10000; // Max payload size to hash

  /**
   * Generate idempotency key for outbound message
   */
  generateKey(conversationId: number, payload: ChatwitMessagePayload): IdempotencyKey {
    const payloadHash = this.hashPayload(payload);
    const fullKey = `${this.keyPrefix}:${conversationId}:${payloadHash}`;

    return {
      conversationId,
      payloadHash,
      fullKey
    };
  }

  /**
   * Check if message was already sent (idempotency check)
   */
  async checkIdempotency(
    key: IdempotencyKey,
    traceId: string
  ): Promise<IdempotencyCheckResult> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const existingData = await redis.get(key.fullKey);
      
      if (existingData) {
        const record: IdempotencyRecord = JSON.parse(existingData);
        
        log.info('Outbound message duplicate detected', {
          conversationId: key.conversationId,
          payloadHash: key.payloadHash,
          traceId,
          existingTraceId: record.traceId,
          existingStatus: record.status,
          sentAt: new Date(record.sentAt).toISOString()
        });

        return {
          isDuplicate: true,
          existingRecord: record,
          key
        };
      }

      return {
        isDuplicate: false,
        key
      };

    } catch (error) {
      log.error('Failed to check outbound idempotency', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        error: (error as Error).message
      });

      // Fail open - allow sending to avoid blocking legitimate messages
      return {
        isDuplicate: false,
        key
      };
    }
  }

  /**
   * Mark message as being sent (before API call)
   */
  async markAsSending(
    key: IdempotencyKey,
    traceId: string,
    attemptCount: number = 1
  ): Promise<void> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const record: IdempotencyRecord = {
        conversationId: key.conversationId,
        payloadHash: key.payloadHash,
        sentAt: Date.now(),
        traceId,
        status: 'retrying',
        attemptCount
      };

      await redis.setex(key.fullKey, this.ttlSeconds, JSON.stringify(record));

      log.debug('Marked message as sending', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        attemptCount
      });

    } catch (error) {
      log.error('Failed to mark message as sending', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        error: (error as Error).message
      });
      // Don't throw - this is for deduplication only
    }
  }

  /**
   * Mark message as successfully sent
   */
  async markAsSent(
    key: IdempotencyKey,
    traceId: string,
    attemptCount: number = 1
  ): Promise<void> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const record: IdempotencyRecord = {
        conversationId: key.conversationId,
        payloadHash: key.payloadHash,
        sentAt: Date.now(),
        traceId,
        status: 'sent',
        attemptCount
      };

      await redis.setex(key.fullKey, this.ttlSeconds, JSON.stringify(record));

      log.debug('Marked message as sent', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        attemptCount
      });

    } catch (error) {
      log.error('Failed to mark message as sent', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        error: (error as Error).message
      });
      // Don't throw - this is for deduplication only
    }
  }

  /**
   * Mark message as failed
   */
  async markAsFailed(
    key: IdempotencyKey,
    traceId: string,
    error: string,
    attemptCount: number = 1
  ): Promise<void> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const record: IdempotencyRecord = {
        conversationId: key.conversationId,
        payloadHash: key.payloadHash,
        sentAt: Date.now(),
        traceId,
        status: 'failed',
        attemptCount,
        lastError: error
      };

      await redis.setex(key.fullKey, this.ttlSeconds, JSON.stringify(record));

      log.debug('Marked message as failed', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        attemptCount,
        error
      });

    } catch (redisError) {
      log.error('Failed to mark message as failed', {
        key: key.fullKey,
        conversationId: key.conversationId,
        traceId,
        error: (redisError as Error).message
      });
      // Don't throw - this is for deduplication only
    }
  }

  /**
   * Get existing record for debugging
   */
  async getRecord(key: IdempotencyKey): Promise<IdempotencyRecord | null> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const data = await redis.get(key.fullKey);
      if (!data) return null;

      return JSON.parse(data) as IdempotencyRecord;

    } catch (error) {
      log.error('Failed to get idempotency record', {
        key: key.fullKey,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Clean up expired records (manual cleanup if needed)
   */
  async cleanupExpiredRecords(conversationId?: number): Promise<number> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const pattern = conversationId 
        ? `${this.keyPrefix}:${conversationId}:*`
        : `${this.keyPrefix}:*`;

      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      // Redis TTL handles cleanup automatically, but we can force cleanup
      const pipeline = redis.pipeline();
      keys.forEach((key: string) => pipeline.del(key));
      
      const results = await pipeline.exec();
      const deletedCount = results?.filter(([err, result]: [any, any]) => !err && result === 1).length || 0;

      log.info('Cleaned up expired idempotency records', {
        pattern,
        keysFound: keys.length,
        deletedCount
      });

      return deletedCount;

    } catch (error) {
      log.error('Failed to cleanup expired records', {
        conversationId,
        error: (error as Error).message
      });
      return 0;
    }
  }

  /**
   * Hash payload for idempotency key
   */
  private hashPayload(payload: ChatwitMessagePayload): string {
    // Create normalized payload excluding trace_id and timestamps
    const normalizedPayload = {
      content: payload.content,
      message_type: payload.message_type,
      content_attributes: payload.content_attributes,
      additional_attributes: {
        ...payload.additional_attributes,
        trace_id: undefined, // Exclude trace_id from hash
        // Keep other fields that affect message content
        provider: payload.additional_attributes.provider,
        channel: payload.additional_attributes.channel,
        schema_version: payload.additional_attributes.schema_version,
        handoff_reason: payload.additional_attributes.handoff_reason,
        assign_to_team: payload.additional_attributes.assign_to_team,
        conversation_tags: payload.additional_attributes.conversation_tags,
        conversation_status: payload.additional_attributes.conversation_status
      }
    };

    const payloadString = JSON.stringify(normalizedPayload);
    
    // Check payload size
    if (payloadString.length > this.maxPayloadSize) {
      log.warn('Large payload detected for hashing', {
        size: payloadString.length,
        maxSize: this.maxPayloadSize
      });
    }

    // Create SHA-256 hash and take first 16 characters for brevity
    return crypto
      .createHash('sha256')
      .update(payloadString)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get statistics about idempotency usage
   */
  async getStats(conversationId?: number): Promise<{
    totalKeys: number;
    sentCount: number;
    failedCount: number;
    retryingCount: number;
  }> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      const pattern = conversationId 
        ? `${this.keyPrefix}:${conversationId}:*`
        : `${this.keyPrefix}:*`;

      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) {
        return { totalKeys: 0, sentCount: 0, failedCount: 0, retryingCount: 0 };
      }

      const pipeline = redis.pipeline();
      keys.forEach((key: string) => pipeline.get(key));
      
      const results = await pipeline.exec();
      
      let sentCount = 0;
      let failedCount = 0;
      let retryingCount = 0;

      results?.forEach(([err, data]: [any, any]) => {
        if (!err && data) {
          try {
            const record: IdempotencyRecord = JSON.parse(data as string);
            switch (record.status) {
              case 'sent': sentCount++; break;
              case 'failed': failedCount++; break;
              case 'retrying': retryingCount++; break;
            }
          } catch (parseError) {
            // Ignore parse errors
          }
        }
      });

      return {
        totalKeys: keys.length,
        sentCount,
        failedCount,
        retryingCount
      };

    } catch (error) {
      log.error('Failed to get idempotency stats', {
        conversationId,
        error: (error as Error).message
      });
      
      return { totalKeys: 0, sentCount: 0, failedCount: 0, retryingCount: 0 };
    }
  }

  /**
   * Check if payload is too large for efficient hashing
   */
  isPayloadTooLarge(payload: ChatwitMessagePayload): boolean {
    const payloadString = JSON.stringify(payload);
    return payloadString.length > this.maxPayloadSize;
  }

  /**
   * Get TTL for a specific key
   */
  async getTTL(key: IdempotencyKey): Promise<number> {
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      return await redis.ttl(key.fullKey);
    } catch (error) {
      log.error('Failed to get TTL for idempotency key', {
        key: key.fullKey,
        error: (error as Error).message
      });
      return -1;
    }
  }
}

/**
 * Create default outbound idempotency service
 */
export function createOutboundIdempotencyService(): OutboundIdempotencyService {
  return new OutboundIdempotencyService();
}