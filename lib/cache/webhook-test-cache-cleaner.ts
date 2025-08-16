/**
 * Webhook Test Cache Cleaner
 * 
 * Utility functions to clear various types of cache used in the webhook test environment.
 * This helps ensure fresh responses when testing webhook functionality.
 */

import { credentialsCache } from './credentials-cache';
import { socialWiseFlowCache } from '../socialwise-flow/cache-manager';
import { getRedisInstance } from '../connections';

/**
 * Interface for cache clearing results
 */
export interface CacheClearResult {
  success: boolean;
  clearedCaches: string[];
  errors: string[];
  totalKeysCleared: number;
}

/**
 * Cache clearing options
 */
export interface CacheClearOptions {
  clearCredentials?: boolean;
  clearSocialWise?: boolean;
  clearWebhookSpecific?: boolean;
  clearAll?: boolean;
  inboxId?: string;
  accountId?: string;
}

/**
 * Main cache cleaner class for webhook test environment
 */
export class WebhookTestCacheCleaner {
  private redis: ReturnType<typeof getRedisInstance>;

  constructor() {
    this.redis = getRedisInstance();
  }

  /**
   * Clear all caches used in webhook testing
   */
  async clearAllCaches(): Promise<CacheClearResult> {
    const result: CacheClearResult = {
      success: true,
      clearedCaches: [],
      errors: [],
      totalKeysCleared: 0
    };

    try {
      // Clear credentials cache
      await this.clearCredentialsCache();
      result.clearedCaches.push('credentials');

      // Clear SocialWise Flow cache
      await this.clearSocialWiseCache();
      result.clearedCaches.push('socialwise-flow');

      // Clear webhook-specific cache patterns
      const webhookKeysCleared = await this.clearWebhookSpecificCache();
      result.totalKeysCleared += webhookKeysCleared;
      result.clearedCaches.push('webhook-specific');

      // Clear test-related cache patterns
      const testKeysCleared = await this.clearTestCache();
      result.totalKeysCleared += testKeysCleared;
      result.clearedCaches.push('test-patterns');

      console.log(`[WebhookTestCacheCleaner] Successfully cleared ${result.clearedCaches.length} cache types, ${result.totalKeysCleared} total keys`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to clear all caches: ${error}`);
      console.error('[WebhookTestCacheCleaner] Error clearing all caches:', error);
    }

    return result;
  }

  /**
   * Clear specific cache types based on options
   */
  async clearSelectiveCaches(options: CacheClearOptions): Promise<CacheClearResult> {
    const result: CacheClearResult = {
      success: true,
      clearedCaches: [],
      errors: [],
      totalKeysCleared: 0
    };

    try {
      if (options.clearAll) {
        return await this.clearAllCaches();
      }

      if (options.clearCredentials) {
        await this.clearCredentialsCache(options.inboxId);
        result.clearedCaches.push('credentials');
      }

      if (options.clearSocialWise) {
        await this.clearSocialWiseCache(options.accountId, options.inboxId);
        result.clearedCaches.push('socialwise-flow');
      }

      if (options.clearWebhookSpecific) {
        const keysCleared = await this.clearWebhookSpecificCache(options.inboxId);
        result.totalKeysCleared += keysCleared;
        result.clearedCaches.push('webhook-specific');
      }

      console.log(`[WebhookTestCacheCleaner] Selectively cleared ${result.clearedCaches.length} cache types`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to clear selective caches: ${error}`);
      console.error('[WebhookTestCacheCleaner] Error clearing selective caches:', error);
    }

    return result;
  }

  /**
   * Clear credentials cache
   */
  private async clearCredentialsCache(inboxId?: string): Promise<void> {
    try {
      if (inboxId) {
        // Clear specific inbox credentials
        await credentialsCache.invalidateCredentials(inboxId);
        console.log(`[WebhookTestCacheCleaner] Cleared credentials cache for inbox: ${inboxId}`);
      } else {
        // Clear all credentials cache
        await credentialsCache.clearAll();
        console.log('[WebhookTestCacheCleaner] Cleared all credentials cache');
      }
    } catch (error) {
      console.error('[WebhookTestCacheCleaner] Error clearing credentials cache:', error);
      throw error;
    }
  }

  /**
   * Clear SocialWise Flow cache
   */
  private async clearSocialWiseCache(accountId?: string, inboxId?: string): Promise<void> {
    try {
      if (accountId && inboxId) {
        // Clear specific user cache
        const config = {
          accountId,
          inboxId,
          agentId: 'test-agent',
          model: 'gpt-4',
          promptVersion: '1.0',
          channelType: 'whatsapp' as const,
          embedipreview: false
        };
        await socialWiseFlowCache.invalidateUserCache(config);
        console.log(`[WebhookTestCacheCleaner] Cleared SocialWise cache for account: ${accountId}, inbox: ${inboxId}`);
      } else {
        // Clear all SocialWise cache patterns
        const patterns = [
          'sw:*',
          'socialwise:*',
          'chatwit:classification:*',
          'chatwit:warmup:*',
          'chatwit:embedding:*',
          'chatwit:microcopy:*'
        ];

        for (const pattern of patterns) {
          const keys = await this.redis.keys(pattern);
          if (keys.length > 0) {
            await this.redis.del(...keys);
            console.log(`[WebhookTestCacheCleaner] Cleared ${keys.length} keys for pattern: ${pattern}`);
          }
        }
      }
    } catch (error) {
      console.error('[WebhookTestCacheCleaner] Error clearing SocialWise cache:', error);
      throw error;
    }
  }

  /**
   * Clear webhook-specific cache patterns
   */
  private async clearWebhookSpecificCache(inboxId?: string): Promise<number> {
    try {
      const patterns = [
        'chatwit:webhook:*',
        'chatwit:dialogflow:*',
        'chatwit:whatsapp:*',
        'chatwit:template:*',
        'chatwit:intent:*',
        'chatwit:instagram_template_mapping:*'
      ];

      if (inboxId) {
        patterns.push(`chatwit:*:*:${inboxId}`);
        patterns.push(`chatwit:*:${inboxId}:*`);
      }

      let totalKeysCleared = 0;

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          totalKeysCleared += keys.length;
          console.log(`[WebhookTestCacheCleaner] Cleared ${keys.length} webhook keys for pattern: ${pattern}`);
        }
      }

      return totalKeysCleared;
    } catch (error) {
      console.error('[WebhookTestCacheCleaner] Error clearing webhook-specific cache:', error);
      throw error;
    }
  }

  /**
   * Clear test-related cache patterns
   */
  private async clearTestCache(): Promise<number> {
    try {
      const patterns = [
        'test:*',
        'chatwit:test:*',
        '*:test:*',
        'webhook-test:*'
      ];

      let totalKeysCleared = 0;

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          totalKeysCleared += keys.length;
          console.log(`[WebhookTestCacheCleaner] Cleared ${keys.length} test keys for pattern: ${pattern}`);
        }
      }

      return totalKeysCleared;
    } catch (error) {
      console.error('[WebhookTestCacheCleaner] Error clearing test cache:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics before clearing
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    credentialsKeys: number;
    socialWiseKeys: number;
    webhookKeys: number;
    testKeys: number;
  }> {
    try {
      const allKeys = await this.redis.keys('*');
      const credentialsKeys = await this.redis.keys('chatwit:credentials*');
      const socialWiseKeys = await this.redis.keys('sw:*');
      const webhookKeys = await this.redis.keys('chatwit:webhook*');
      const testKeys = await this.redis.keys('*test*');

      return {
        totalKeys: allKeys.length,
        credentialsKeys: credentialsKeys.length,
        socialWiseKeys: socialWiseKeys.length,
        webhookKeys: webhookKeys.length,
        testKeys: testKeys.length
      };
    } catch (error) {
      console.error('[WebhookTestCacheCleaner] Error getting cache stats:', error);
      return {
        totalKeys: 0,
        credentialsKeys: 0,
        socialWiseKeys: 0,
        webhookKeys: 0,
        testKeys: 0
      };
    }
  }
}

// Global instance
export const webhookTestCacheCleaner = new WebhookTestCacheCleaner();

// Convenience functions
export async function clearAllWebhookTestCaches(): Promise<CacheClearResult> {
  return webhookTestCacheCleaner.clearAllCaches();
}

export async function clearWebhookTestCachesForInbox(inboxId: string): Promise<CacheClearResult> {
  return webhookTestCacheCleaner.clearSelectiveCaches({
    clearCredentials: true,
    clearSocialWise: true,
    clearWebhookSpecific: true,
    inboxId
  });
}

export async function clearWebhookTestCachesForAccount(accountId: string, inboxId?: string): Promise<CacheClearResult> {
  return webhookTestCacheCleaner.clearSelectiveCaches({
    clearCredentials: true,
    clearSocialWise: true,
    clearWebhookSpecific: true,
    accountId,
    inboxId
  });
}

export async function getWebhookTestCacheStats() {
  return webhookTestCacheCleaner.getCacheStats();
}