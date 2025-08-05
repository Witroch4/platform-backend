/**
 * Webhook Processing Cache Isolation Tests
 * 
 * Tests webhook processing with multiple users to ensure cache isolation
 * and proper user context handling during Instagram translation jobs.
 */

import { Job } from 'bullmq';
import { processInstagramTranslationTask } from '@/worker/WebhookWorkerTasks/instagram-translation.task';
import { InstagramTranslationJobData } from '@/lib/queue/instagram-translation.queue';
import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from '../../lib/connections';

// Mock dependencies
jest.mock('ioredis');
jest.mock('@prisma/client');
jest.mock('@/lib/monitoring/instagram-translation-monitor');
jest.mock('@/lib/logging/instagram-translation-logger');
jest.mock('@/lib/monitoring/instagram-error-tracker');

const MockedIORedis = IORedis as jest.MockedClass<typeof IORedis>;
const MockedPrismaClient = PrismaClient as jest.MockedClass<typeof PrismaClient>;

describe('Webhook Cache Isolation Tests', () => {
  let mockRedis: jest.Mocked<IORedis>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  // Test users with shared and different inboxIds
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
    },
    separateInbox: {
      user3: {
        usuarioChatwitId: 'webhook-user-999',
        inboxId: 'webhook-separate-inbox-101',
        intentName: 'webhook.test.intent',
        contactPhone: '+5511777777777'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      mget: jest.fn(),
      ping: jest.fn(),
      info: jest.fn(),
    } as any;

    MockedIORedis.mockImplementation(() => mockRedis);

    // Setup mock Prisma
    mockPrisma = {
      chatwitInbox: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      mapeamentoIntencao: {
        findUnique: jest.fn(),
      },
      $disconnect: jest.fn(),
    } as any;

    MockedPrismaClient.mockImplementation(() => mockPrisma);
  });

  describe('Webhook Job Processing with Shared InboxId', () => {
    it('should process webhook jobs for different users with same inboxId independently', async () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Mock database responses for user1
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'internal-inbox-1',
          inboxId: user1.inboxId,
          usuarioChatwitId: user1.usuarioChatwitId,
          nome: 'Webhook Inbox User 1',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: user1.usuarioChatwitId,
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'webhook-phone-1',
              whatsappApiKey: 'webhook-token-1',
              whatsappBusinessAccountId: 'webhook-business-1',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce({
          id: 'webhook-mapping-1',
          intentName: user1.intentName,
          inboxId: 'internal-inbox-1',
          template: {
            id: 'webhook-template-1',
            name: 'Webhook Template User 1',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: {
              body: { text: 'Webhook response for User 1!' },
              actionReplyButton: {
                buttons: [
                  { id: 'btn1', title: 'Option 1', ordem: 1 }
                ]
              }
            },
            whatsappOfficialInfo: null
          }
        } as any);

      // Mock cache miss for user1
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      // Create job data for user1
      const jobData1: InstagramTranslationJobData = {
        intentName: user1.intentName,
        inboxId: user1.inboxId,
        contactPhone: user1.contactPhone,
        correlationId: 'webhook-corr-1',
        timestamp: Date.now(),
        retryCount: 0
      };

      const job1 = {
        id: 'webhook-job-1',
        data: jobData1,
        attemptsMade: 0,
        opts: { attempts: 3 },
        processedOn: Date.now(),
        timestamp: Date.now() - 100
      } as Job<InstagramTranslationJobData>;

      // Process job for user1
      const result1 = await processInstagramTranslationTask(job1);

      expect(result1.success).toBe(true);
      expect(result1.fulfillmentMessages).toBeDefined();
      expect(result1.metadata?.messageType).toBe('unified_template');

      // Verify cache operations used correct user context
      expect(mockRedis.get).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user1.intentName}:${user1.usuarioChatwitId}:${user1.inboxId}`
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user1.intentName}:${user1.usuarioChatwitId}:${user1.inboxId}`,
        expect.any(Number),
        expect.any(String)
      );

      // Now process job for user2 with same inboxId but different user
      jest.clearAllMocks();

      // Mock database responses for user2
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'internal-inbox-2',
          inboxId: user2.inboxId,
          usuarioChatwitId: user2.usuarioChatwitId,
          nome: 'Webhook Inbox User 2',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: user2.usuarioChatwitId,
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'webhook-phone-2',
              whatsappApiKey: 'webhook-token-2',
              whatsappBusinessAccountId: 'webhook-business-2',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce({
          id: 'webhook-mapping-2',
          intentName: user2.intentName,
          inboxId: 'internal-inbox-2',
          template: {
            id: 'webhook-template-2',
            name: 'Webhook Template User 2',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: {
              body: { text: 'Webhook response for User 2!' },
              actionReplyButton: {
                buttons: [
                  { id: 'btn2', title: 'Option 2', ordem: 1 }
                ]
              }
            },
            whatsappOfficialInfo: null
          }
        } as any);

      // Mock cache miss for user2 (different cache key)
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      // Create job data for user2
      const jobData2: InstagramTranslationJobData = {
        intentName: user2.intentName,
        inboxId: user2.inboxId,
        contactPhone: user2.contactPhone,
        correlationId: 'webhook-corr-2',
        timestamp: Date.now(),
        retryCount: 0
      };

      const job2 = {
        id: 'webhook-job-2',
        data: jobData2,
        attemptsMade: 0,
        opts: { attempts: 3 },
        processedOn: Date.now(),
        timestamp: Date.now() - 100
      } as Job<InstagramTranslationJobData>;

      // Process job for user2
      const result2 = await processInstagramTranslationTask(job2);

      expect(result2.success).toBe(true);
      expect(result2.fulfillmentMessages).toBeDefined();
      expect(result2.metadata?.messageType).toBe('unified_template');

      // Verify cache operations used correct user context for user2
      expect(mockRedis.get).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user2.intentName}:${user2.usuarioChatwitId}:${user2.inboxId}`
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user2.intentName}:${user2.usuarioChatwitId}:${user2.inboxId}`,
        expect.any(Number),
        expect.any(String)
      );

      // Verify different cache keys were used despite same inboxId
      const user1CacheKey = `chatwit:instagram_template_mapping:${user1.intentName}:${user1.usuarioChatwitId}:${user1.inboxId}`;
      const user2CacheKey = `chatwit:instagram_template_mapping:${user2.intentName}:${user2.usuarioChatwitId}:${user2.inboxId}`;
      
      expect(user1CacheKey).not.toBe(user2CacheKey);
      expect(user1CacheKey).toContain(user1.usuarioChatwitId);
      expect(user2CacheKey).toContain(user2.usuarioChatwitId);
    });
  });

  describe('Concurrent Webhook Processing', () => {
    it('should handle concurrent webhook jobs without cache interference', async () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Mock database responses for both users
      mockPrisma.chatwitInbox.findFirst
        .mockImplementation((query: any) => {
          const inboxId = query.where.inboxId;
          if (inboxId === user1.inboxId) {
            // Return different internal data based on which user is being resolved
            return Promise.resolve({
              id: 'internal-inbox-1',
              inboxId: user1.inboxId,
              usuarioChatwitId: user1.usuarioChatwitId,
              nome: 'Concurrent Inbox User 1',
              whatsappApiKey: null,
              phoneNumberId: null,
              whatsappBusinessAccountId: null,
              usuarioChatwit: {
                id: user1.usuarioChatwitId,
                configuracaoGlobalWhatsApp: {
                  phoneNumberId: 'concurrent-phone-1',
                  whatsappApiKey: 'concurrent-token-1',
                  whatsappBusinessAccountId: 'concurrent-business-1',
                  graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
                }
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      mockPrisma.mapeamentoIntencao.findUnique
        .mockImplementation((query: any) => {
          const intentName = query.where.intentName_inboxId.intentName;
          const inboxId = query.where.intentName_inboxId.inboxId;
          
          if (intentName === user1.intentName && inboxId === 'internal-inbox-1') {
            return Promise.resolve({
              id: 'concurrent-mapping-1',
              intentName: user1.intentName,
              inboxId: 'internal-inbox-1',
              template: {
                id: 'concurrent-template-1',
                name: 'Concurrent Template User 1',
                type: 'INTERACTIVE_MESSAGE',
                scope: 'user',
                description: null,
                language: 'pt-BR',
                simpleReplyText: null,
                interactiveContent: {
                  body: { text: 'Concurrent response for User 1!' }
                },
                whatsappOfficialInfo: null
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      // Mock cache operations to track calls
      const cacheGetCalls: string[] = [];
      const cacheSetCalls: Array<{ key: string; value: string }> = [];

      mockRedis.get.mockImplementation((key: string) => {
        cacheGetCalls.push(key);
        return Promise.resolve(null); // Always cache miss for this test
      });

      mockRedis.setex.mockImplementation((key: string, ttl: number, value: string) => {
        cacheSetCalls.push({ key, value });
        return Promise.resolve('OK');
      });

      // Create multiple jobs for the same user
      const jobs = Array.from({ length: 3 }, (_, i) => ({
        id: `concurrent-job-${i}`,
        data: {
          intentName: user1.intentName,
          inboxId: user1.inboxId,
          contactPhone: `+551199999999${i}`,
          correlationId: `concurrent-corr-${i}`,
          timestamp: Date.now(),
          retryCount: 0
        } as InstagramTranslationJobData,
        attemptsMade: 0,
        opts: { attempts: 3 },
        processedOn: Date.now(),
        timestamp: Date.now() - 100
      } as Job<InstagramTranslationJobData>));

      // Process jobs concurrently
      const results = await Promise.all(
        jobs.map(job => processInstagramTranslationTask(job))
      );

      // Verify all jobs succeeded
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.fulfillmentMessages).toBeDefined();
      });

      // Verify cache operations used consistent user context
      const expectedCacheKey = `chatwit:instagram_template_mapping:${user1.intentName}:${user1.usuarioChatwitId}:${user1.inboxId}`;
      
      // All cache get operations should use the same key (same user)
      cacheGetCalls.forEach(key => {
        expect(key).toBe(expectedCacheKey);
      });

      // All cache set operations should use the same key (same user)
      cacheSetCalls.forEach(({ key }) => {
        expect(key).toBe(expectedCacheKey);
      });

      // Verify we had the expected number of cache operations
      expect(cacheGetCalls.length).toBe(3); // One for each job
      expect(cacheSetCalls.length).toBe(3); // One for each job (cache miss scenario)
    });
  });

  describe('Webhook Error Handling with User Context', () => {
    it('should handle webhook errors without affecting other users cache', async () => {
      const { user1, user2 } = testScenarios.sharedInbox;

      // Mock successful database response for user1
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'error-inbox-1',
          inboxId: user1.inboxId,
          usuarioChatwitId: user1.usuarioChatwitId,
          nome: 'Error Test Inbox User 1',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: user1.usuarioChatwitId,
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'error-phone-1',
              whatsappApiKey: 'error-token-1',
              whatsappBusinessAccountId: 'error-business-1',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any);

      // Mock database error for user1's mapping
      mockPrisma.mapeamentoIntencao.findUnique
        .mockRejectedValueOnce(new Error('Database connection failed for user1'));

      // Mock cache operations
      mockRedis.get.mockResolvedValue(null);

      // Create job data for user1 (will fail)
      const jobData1: InstagramTranslationJobData = {
        intentName: user1.intentName,
        inboxId: user1.inboxId,
        contactPhone: user1.contactPhone,
        correlationId: 'error-corr-1',
        timestamp: Date.now(),
        retryCount: 0
      };

      const job1 = {
        id: 'error-job-1',
        data: jobData1,
        attemptsMade: 0,
        opts: { attempts: 3 },
        processedOn: Date.now(),
        timestamp: Date.now() - 100
      } as Job<InstagramTranslationJobData>;

      // Process job for user1 (should fail)
      const result1 = await processInstagramTranslationTask(job1);

      expect(result1.success).toBe(false);
      expect(result1.error).toBeDefined();

      // Verify cache was attempted for user1
      expect(mockRedis.get).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user1.intentName}:${user1.usuarioChatwitId}:${user1.inboxId}`
      );

      // Now test that user2 can still process successfully
      jest.clearAllMocks();

      // Mock successful responses for user2
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'error-inbox-2',
          inboxId: user2.inboxId,
          usuarioChatwitId: user2.usuarioChatwitId,
          nome: 'Error Test Inbox User 2',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: user2.usuarioChatwitId,
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'error-phone-2',
              whatsappApiKey: 'error-token-2',
              whatsappBusinessAccountId: 'error-business-2',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce({
          id: 'error-mapping-2',
          intentName: user2.intentName,
          inboxId: 'error-inbox-2',
          template: {
            id: 'error-template-2',
            name: 'Error Test Template User 2',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: {
              body: { text: 'Success response for User 2!' }
            },
            whatsappOfficialInfo: null
          }
        } as any);

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      // Create job data for user2
      const jobData2: InstagramTranslationJobData = {
        intentName: user2.intentName,
        inboxId: user2.inboxId,
        contactPhone: user2.contactPhone,
        correlationId: 'error-corr-2',
        timestamp: Date.now(),
        retryCount: 0
      };

      const job2 = {
        id: 'error-job-2',
        data: jobData2,
        attemptsMade: 0,
        opts: { attempts: 3 },
        processedOn: Date.now(),
        timestamp: Date.now() - 100
      } as Job<InstagramTranslationJobData>;

      // Process job for user2 (should succeed)
      const result2 = await processInstagramTranslationTask(job2);

      expect(result2.success).toBe(true);
      expect(result2.fulfillmentMessages).toBeDefined();

      // Verify user2 used different cache key
      expect(mockRedis.get).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user2.intentName}:${user2.usuarioChatwitId}:${user2.inboxId}`
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${user2.intentName}:${user2.usuarioChatwitId}:${user2.inboxId}`,
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('Conversion Result Cache in Webhook Processing', () => {
    it('should cache conversion results with proper user isolation during webhook processing', async () => {
      const { user1 } = testScenarios.sharedInbox;

      // Mock database responses
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'conversion-inbox-1',
          inboxId: user1.inboxId,
          usuarioChatwitId: user1.usuarioChatwitId,
          nome: 'Conversion Test Inbox',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: user1.usuarioChatwitId,
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'conversion-phone-1',
              whatsappApiKey: 'conversion-token-1',
              whatsappBusinessAccountId: 'conversion-business-1',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce({
          id: 'conversion-mapping-1',
          intentName: user1.intentName,
          inboxId: 'conversion-inbox-1',
          template: {
            id: 'conversion-template-1',
            name: 'Conversion Test Template',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: {
              body: { text: 'Test message for conversion caching!' },
              actionReplyButton: {
                buttons: [
                  { id: 'conv-btn1', title: 'Convert Option', ordem: 1 }
                ]
              }
            },
            whatsappOfficialInfo: null
          }
        } as any);

      // Mock cache operations
      const cacheSetCalls: Array<{ key: string; ttl: number; value: string }> = [];
      
      mockRedis.get.mockResolvedValue(null); // Cache miss
      mockRedis.setex.mockImplementation((key: string, ttl: number, value: string) => {
        cacheSetCalls.push({ key, ttl, value });
        return Promise.resolve('OK');
      });

      // Create job data
      const jobData: InstagramTranslationJobData = {
        intentName: user1.intentName,
        inboxId: user1.inboxId,
        contactPhone: user1.contactPhone,
        correlationId: 'conversion-corr-1',
        timestamp: Date.now(),
        retryCount: 0
      };

      const job = {
        id: 'conversion-job-1',
        data: jobData,
        attemptsMade: 0,
        opts: { attempts: 3 },
        processedOn: Date.now(),
        timestamp: Date.now() - 100
      } as Job<InstagramTranslationJobData>;

      // Process job
      const result = await processInstagramTranslationTask(job);

      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toBeDefined();

      // Verify both template mapping and conversion result were cached
      expect(cacheSetCalls.length).toBeGreaterThanOrEqual(2);

      // Find template mapping cache call
      const templateMappingCall = cacheSetCalls.find(call => 
        call.key.includes('instagram_template_mapping')
      );
      expect(templateMappingCall).toBeDefined();
      expect(templateMappingCall?.key).toBe(
        `chatwit:instagram_template_mapping:${user1.intentName}:${user1.usuarioChatwitId}:${user1.inboxId}`
      );

      // Find conversion result cache call
      const conversionResultCall = cacheSetCalls.find(call => 
        call.key.includes('instagram_conversion_result')
      );
      expect(conversionResultCall).toBeDefined();
      expect(conversionResultCall?.key).toContain(user1.usuarioChatwitId);
      expect(conversionResultCall?.key).toContain(user1.inboxId);
      expect(conversionResultCall?.key).toContain(user1.intentName);

      // Verify conversion result contains expected data
      if (conversionResultCall) {
        const cachedData = JSON.parse(conversionResultCall.value);
        expect(cachedData.fulfillmentMessages).toBeDefined();
        expect(cachedData.templateType).toBeDefined();
        expect(cachedData.processingTime).toBeGreaterThan(0);
        expect(cachedData.cachedAt).toBeDefined();
      }
    });
  });
});