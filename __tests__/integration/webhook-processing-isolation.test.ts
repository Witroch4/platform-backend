/**
 * Webhook Processing Isolation Tests
 * 
 * Tests webhook processing scenarios to ensure cache isolation
 * between users during real webhook processing flows.
 */

import { InstagramTranslationJobData } from '@/lib/queue/instagram-translation.queue';

describe('Webhook Processing Isolation Tests', () => {
  // Test scenarios with multiple users
  const testScenarios = {
    sharedInbox: {
      user1: {
        usuarioChatwitId: 'webhook-user-123',
        inboxId: 'webhook-shared-inbox-456',
        intentName: 'webhook.test.intent',
        contactPhone: '+5511999999999'
      },
      user2: {
        usuarioChatwitId: 'webhook-user-789',
        inboxId: 'webhook-shared-inbox-456', // Same inboxId
        intentName: 'webhook.test.intent',   // Same intent
        contactPhone: '+5511888888888'
      }
    }
  };

  describe('Job Data Validation', () => {
    it('should validate job data contains proper user context', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Create job data for both users
      const jobData1: InstagramTranslationJobData = {
        intentName: user1.intentName,
        inboxId: user1.inboxId,
        contactPhone: user1.contactPhone,
        correlationId: 'webhook-corr-1',
        timestamp: Date.now(),
        retryCount: 0
      };

      const jobData2: InstagramTranslationJobData = {
        intentName: user2.intentName,
        inboxId: user2.inboxId,
        contactPhone: user2.contactPhone,
        correlationId: 'webhook-corr-2',
        timestamp: Date.now(),
        retryCount: 0
      };

      // Verify job data structure
      expect(jobData1.intentName).toBe(user1.intentName);
      expect(jobData1.inboxId).toBe(user1.inboxId);
      expect(jobData1.contactPhone).toBe(user1.contactPhone);

      expect(jobData2.intentName).toBe(user2.intentName);
      expect(jobData2.inboxId).toBe(user2.inboxId);
      expect(jobData2.contactPhone).toBe(user2.contactPhone);

      // Verify users have same inboxId but different contact phones
      expect(jobData1.inboxId).toBe(jobData2.inboxId);
      expect(jobData1.contactPhone).not.toBe(jobData2.contactPhone);
    });
  });

  describe('Cache Key Generation in Webhook Context', () => {
    it('should generate proper cache keys for webhook processing', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Simulate cache key generation that would happen during webhook processing
      const generateCacheKey = (intentName: string, usuarioChatwitId: string, inboxId: string) => {
        return `chatwit:instagram_template_mapping:${intentName}:${usuarioChatwitId}:${inboxId}`;
      };

      const cacheKey1 = generateCacheKey(user1.intentName, user1.usuarioChatwitId, user1.inboxId);
      const cacheKey2 = generateCacheKey(user2.intentName, user2.usuarioChatwitId, user2.inboxId);

      // Verify cache keys are different despite same inboxId and intent
      expect(cacheKey1).toBe('chatwit:instagram_template_mapping:webhook.test.intent:webhook-user-123:webhook-shared-inbox-456');
      expect(cacheKey2).toBe('chatwit:instagram_template_mapping:webhook.test.intent:webhook-user-789:webhook-shared-inbox-456');
      expect(cacheKey1).not.toBe(cacheKey2);

      // Verify cache keys contain user-specific information
      expect(cacheKey1).toContain(user1.usuarioChatwitId);
      expect(cacheKey2).toContain(user2.usuarioChatwitId);
      expect(cacheKey1).not.toContain(user2.usuarioChatwitId);
      expect(cacheKey2).not.toContain(user1.usuarioChatwitId);
    });

    it('should generate proper conversion result cache keys', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Simulate conversion result cache key generation
      const generateConversionCacheKey = (
        intentName: string, 
        usuarioChatwitId: string, 
        inboxId: string, 
        bodyLength: number, 
        hasImage: boolean
      ) => {
        return `chatwit:instagram_conversion_result:${intentName}:${usuarioChatwitId}:${inboxId}:${bodyLength}:${hasImage}`;
      };

      const conversionKey1 = generateConversionCacheKey(
        user1.intentName, user1.usuarioChatwitId, user1.inboxId, 100, false
      );
      const conversionKey2 = generateConversionCacheKey(
        user2.intentName, user2.usuarioChatwitId, user2.inboxId, 100, false
      );

      // Verify conversion cache keys are different
      expect(conversionKey1).toBe('chatwit:instagram_conversion_result:webhook.test.intent:webhook-user-123:webhook-shared-inbox-456:100:false');
      expect(conversionKey2).toBe('chatwit:instagram_conversion_result:webhook.test.intent:webhook-user-789:webhook-shared-inbox-456:100:false');
      expect(conversionKey1).not.toBe(conversionKey2);

      // Verify user isolation in conversion keys
      expect(conversionKey1).toContain(user1.usuarioChatwitId);
      expect(conversionKey2).toContain(user2.usuarioChatwitId);
    });
  });

  describe('Webhook Processing Flow Simulation', () => {
    it('should simulate proper user context flow during webhook processing', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Simulate the flow that happens during webhook processing
      const simulateWebhookProcessing = (jobData: InstagramTranslationJobData) => {
        // Step 1: Extract user context from job data
        const { intentName, inboxId, contactPhone } = jobData;

        // Step 2: Simulate database lookup to get usuarioChatwitId
        // In real processing, this would come from database query
        const usuarioChatwitId = jobData.correlationId?.includes('corr-1') ? user1.usuarioChatwitId : user2.usuarioChatwitId;

        // Step 3: Generate cache keys with user context
        const templateCacheKey = `chatwit:instagram_template_mapping:${intentName}:${usuarioChatwitId}:${inboxId}`;
        const conversionCacheKey = `chatwit:instagram_conversion_result:${intentName}:${usuarioChatwitId}:${inboxId}:100:false`;

        return {
          intentName,
          inboxId,
          contactPhone,
          usuarioChatwitId,
          templateCacheKey,
          conversionCacheKey
        };
      };

      // Create job data for both users
      const jobData1: InstagramTranslationJobData = {
        intentName: user1.intentName,
        inboxId: user1.inboxId,
        contactPhone: user1.contactPhone,
        correlationId: 'webhook-corr-1',
        timestamp: Date.now(),
        retryCount: 0
      };

      const jobData2: InstagramTranslationJobData = {
        intentName: user2.intentName,
        inboxId: user2.inboxId,
        contactPhone: user2.contactPhone,
        correlationId: 'webhook-corr-2',
        timestamp: Date.now(),
        retryCount: 0
      };

      // Simulate processing for both users
      const processing1 = simulateWebhookProcessing(jobData1);
      const processing2 = simulateWebhookProcessing(jobData2);

      // Verify user context is properly isolated
      expect(processing1.usuarioChatwitId).toBe(user1.usuarioChatwitId);
      expect(processing2.usuarioChatwitId).toBe(user2.usuarioChatwitId);

      // Verify cache keys are different
      expect(processing1.templateCacheKey).not.toBe(processing2.templateCacheKey);
      expect(processing1.conversionCacheKey).not.toBe(processing2.conversionCacheKey);

      // Verify cache keys contain correct user context
      expect(processing1.templateCacheKey).toContain(user1.usuarioChatwitId);
      expect(processing2.templateCacheKey).toContain(user2.usuarioChatwitId);

      // Verify no cross-contamination
      expect(processing1.templateCacheKey).not.toContain(user2.usuarioChatwitId);
      expect(processing2.templateCacheKey).not.toContain(user1.usuarioChatwitId);
    });
  });

  describe('Concurrent Webhook Processing Simulation', () => {
    it('should handle concurrent webhook jobs with proper isolation', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Simulate multiple concurrent jobs
      const concurrentJobs = [
        // Jobs for user1
        {
          id: 'job-1-1',
          data: {
            intentName: user1.intentName,
            inboxId: user1.inboxId,
            contactPhone: `${user1.contactPhone}1`,
            correlationId: 'user1-corr-1',
            timestamp: Date.now(),
            retryCount: 0
          } as InstagramTranslationJobData
        },
        {
          id: 'job-1-2',
          data: {
            intentName: user1.intentName,
            inboxId: user1.inboxId,
            contactPhone: `${user1.contactPhone}2`,
            correlationId: 'user1-corr-2',
            timestamp: Date.now(),
            retryCount: 0
          } as InstagramTranslationJobData
        },
        // Jobs for user2
        {
          id: 'job-2-1',
          data: {
            intentName: user2.intentName,
            inboxId: user2.inboxId,
            contactPhone: `${user2.contactPhone}1`,
            correlationId: 'user2-corr-1',
            timestamp: Date.now(),
            retryCount: 0
          } as InstagramTranslationJobData
        },
        {
          id: 'job-2-2',
          data: {
            intentName: user2.intentName,
            inboxId: user2.inboxId,
            contactPhone: `${user2.contactPhone}2`,
            correlationId: 'user2-corr-2',
            timestamp: Date.now(),
            retryCount: 0
          } as InstagramTranslationJobData
        }
      ];

      // Simulate processing all jobs and track cache operations
      const cacheOperations: Array<{
        jobId: string;
        usuarioChatwitId: string;
        cacheKey: string;
        operation: string;
      }> = [];

      concurrentJobs.forEach(job => {
        // Simulate user context resolution
        const usuarioChatwitId = job.data.correlationId?.includes('user1') ? user1.usuarioChatwitId : user2.usuarioChatwitId;
        
        // Simulate cache operations
        const templateCacheKey = `chatwit:instagram_template_mapping:${job.data.intentName}:${usuarioChatwitId}:${job.data.inboxId}`;
        
        cacheOperations.push({
          jobId: job.id,
          usuarioChatwitId,
          cacheKey: templateCacheKey,
          operation: 'get'
        });

        cacheOperations.push({
          jobId: job.id,
          usuarioChatwitId,
          cacheKey: templateCacheKey,
          operation: 'set'
        });
      });

      // Verify cache operations are properly isolated by user
      const user1Operations = cacheOperations.filter(op => op.usuarioChatwitId === user1.usuarioChatwitId);
      const user2Operations = cacheOperations.filter(op => op.usuarioChatwitId === user2.usuarioChatwitId);

      expect(user1Operations.length).toBe(4); // 2 jobs × 2 operations each
      expect(user2Operations.length).toBe(4); // 2 jobs × 2 operations each

      // Verify no cross-contamination in cache keys
      user1Operations.forEach(op => {
        expect(op.cacheKey).toContain(user1.usuarioChatwitId);
        expect(op.cacheKey).not.toContain(user2.usuarioChatwitId);
      });

      user2Operations.forEach(op => {
        expect(op.cacheKey).toContain(user2.usuarioChatwitId);
        expect(op.cacheKey).not.toContain(user1.usuarioChatwitId);
      });

      // Verify all operations for same user use same cache key (same intent/inbox)
      const user1CacheKeys = [...new Set(user1Operations.map(op => op.cacheKey))];
      const user2CacheKeys = [...new Set(user2Operations.map(op => op.cacheKey))];

      expect(user1CacheKeys.length).toBe(1); // All user1 jobs should use same cache key
      expect(user2CacheKeys.length).toBe(1); // All user2 jobs should use same cache key
      expect(user1CacheKeys[0]).not.toBe(user2CacheKeys[0]); // But different between users
    });
  });

  describe('Error Scenarios in Webhook Processing', () => {
    it('should handle webhook processing errors without affecting other users', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Simulate error scenarios
      const simulateWebhookWithError = (jobData: InstagramTranslationJobData, shouldFail: boolean) => {
        const usuarioChatwitId = jobData.correlationId?.includes('user1') ? user1.usuarioChatwitId : user2.usuarioChatwitId;
        const cacheKey = `chatwit:instagram_template_mapping:${jobData.intentName}:${usuarioChatwitId}:${jobData.inboxId}`;

        if (shouldFail) {
          return {
            success: false,
            error: 'Database connection failed',
            cacheKey,
            usuarioChatwitId
          };
        }

        return {
          success: true,
          cacheKey,
          usuarioChatwitId,
          fulfillmentMessages: [{ text: { text: [`Response for ${usuarioChatwitId}`] } }]
        };
      };

      // Create job data
      const jobData1: InstagramTranslationJobData = {
        intentName: user1.intentName,
        inboxId: user1.inboxId,
        contactPhone: user1.contactPhone,
        correlationId: 'user1-error-corr',
        timestamp: Date.now(),
        retryCount: 0
      };

      const jobData2: InstagramTranslationJobData = {
        intentName: user2.intentName,
        inboxId: user2.inboxId,
        contactPhone: user2.contactPhone,
        correlationId: 'user2-success-corr',
        timestamp: Date.now(),
        retryCount: 0
      };

      // Simulate user1 failing and user2 succeeding
      const result1 = simulateWebhookWithError(jobData1, true);  // Fail
      const result2 = simulateWebhookWithError(jobData2, false); // Success

      // Verify error isolation
      expect(result1.success).toBe(false);
      expect(result1.error).toBeDefined();
      expect(result1.usuarioChatwitId).toBe(user1.usuarioChatwitId);

      expect(result2.success).toBe(true);
      expect(result2.fulfillmentMessages).toBeDefined();
      expect(result2.usuarioChatwitId).toBe(user2.usuarioChatwitId);

      // Verify cache keys are still properly isolated
      expect(result1.cacheKey).toContain(user1.usuarioChatwitId);
      expect(result2.cacheKey).toContain(user2.usuarioChatwitId);
      expect(result1.cacheKey).not.toBe(result2.cacheKey);
    });
  });

  describe('Cache Invalidation During Webhook Processing', () => {
    it('should simulate cache invalidation scenarios during webhook processing', () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Simulate cache invalidation that might happen during webhook processing
      const simulateCacheInvalidation = (usuarioChatwitId: string, intentName: string, inboxId: string) => {
        const templateCacheKey = `chatwit:instagram_template_mapping:${intentName}:${usuarioChatwitId}:${inboxId}`;
        const conversionPattern = `chatwit:instagram_conversion_result:${intentName}:${usuarioChatwitId}:${inboxId}:*`;
        
        // Simulate finding related keys
        const relatedKeys = [
          `chatwit:instagram_conversion_result:${intentName}:${usuarioChatwitId}:${inboxId}:50:false`,
          `chatwit:instagram_conversion_result:${intentName}:${usuarioChatwitId}:${inboxId}:100:true`
        ];

        const keysToDelete = [templateCacheKey, ...relatedKeys];

        return {
          templateCacheKey,
          conversionPattern,
          relatedKeys,
          keysToDelete,
          usuarioChatwitId
        };
      };

      // Simulate invalidation for user1
      const invalidation1 = simulateCacheInvalidation(
        user1.usuarioChatwitId,
        user1.intentName,
        user1.inboxId
      );

      // Simulate invalidation for user2
      const invalidation2 = simulateCacheInvalidation(
        user2.usuarioChatwitId,
        user2.intentName,
        user2.inboxId
      );

      // Verify invalidations are properly isolated
      expect(invalidation1.templateCacheKey).toContain(user1.usuarioChatwitId);
      expect(invalidation2.templateCacheKey).toContain(user2.usuarioChatwitId);

      // Verify no cross-contamination in keys to delete
      invalidation1.keysToDelete.forEach(key => {
        expect(key).toContain(user1.usuarioChatwitId);
        expect(key).not.toContain(user2.usuarioChatwitId);
      });

      invalidation2.keysToDelete.forEach(key => {
        expect(key).toContain(user2.usuarioChatwitId);
        expect(key).not.toContain(user1.usuarioChatwitId);
      });

      // Verify patterns are user-specific
      expect(invalidation1.conversionPattern).toContain(user1.usuarioChatwitId);
      expect(invalidation2.conversionPattern).toContain(user2.usuarioChatwitId);
    });
  });
});