/**
 * End-to-End Cache Isolation Scenarios
 * 
 * Tests real-world scenarios with multiple users to ensure complete
 * cache isolation across the entire system stack.
 */

import { PrismaClient } from '@prisma/client';
import { InstagramTemplateCache } from '@/lib/cache/instagram-template-cache';
import { findOptimizedCompleteMessageMapping } from '@/lib/instagram/optimized-database-queries';
import { processInstagramTranslationTask } from '@/worker/WebhookWorkerTasks/instagram-translation.task';
import { InstagramTranslationJobData } from '@/lib/queue/instagram-translation.queue';
import { Job } from 'bullmq';
import IORedis from 'ioredis';

// Mock dependencies
jest.mock('ioredis');
jest.mock('@prisma/client');
jest.mock('@/lib/monitoring/instagram-translation-monitor');
jest.mock('@/lib/logging/instagram-translation-logger');
jest.mock('@/lib/monitoring/instagram-error-tracker');

const MockedIORedis = IORedis as jest.MockedClass<typeof IORedis>;
const MockedPrismaClient = PrismaClient as jest.MockedClass<typeof PrismaClient>;

describe('End-to-End Cache Isolation Scenarios', () => {
  let mockRedis: jest.Mocked<IORedis>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let cache: InstagramTemplateCache;

  // Real-world scenario: Multiple companies using the same WhatsApp Business API
  const realWorldScenario = {
    company1: {
      usuarioChatwitId: 'company-abc-123',
      inboxId: 'whatsapp-business-shared-456',
      intentName: 'customer.support.greeting',
      contactPhone: '+5511999999999',
      templateName: 'Company ABC Support Greeting',
      responseText: 'Hello! Welcome to Company ABC support. How can we help you today?'
    },
    company2: {
      usuarioChatwitId: 'company-xyz-789',
      inboxId: 'whatsapp-business-shared-456', // Same WhatsApp Business Account
      intentName: 'customer.support.greeting',   // Same intent name
      contactPhone: '+5511888888888',
      templateName: 'Company XYZ Support Greeting',
      responseText: 'Hi there! This is Company XYZ customer service. What can we do for you?'
    },
    company3: {
      usuarioChatwitId: 'company-def-999',
      inboxId: 'whatsapp-business-separate-789',
      intentName: 'customer.support.greeting',
      contactPhone: '+5511777777777',
      templateName: 'Company DEF Support Greeting',
      responseText: 'Welcome to Company DEF! Our team is here to assist you.'
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
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      template: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $disconnect: jest.fn(),
    } as any;

    MockedPrismaClient.mockImplementation(() => mockPrisma);

    // Create cache instance
    cache = new InstagramTemplateCache(mockRedis);
  });

  describe('Scenario 1: Shared WhatsApp Business Account with Different Companies', () => {
    it('should maintain complete isolation between companies sharing the same WhatsApp Business Account', async () => {
      const { company1, company2 } = realWorldScenario;

      // Setup database mocks for both companies
      mockPrisma.chatwitInbox.findFirst
        .mockImplementation((query: any) => {
          const inboxId = query.where.inboxId;
          if (inboxId === company1.inboxId) {
            // First call resolves to company1
            return Promise.resolve({
              id: 'internal-company1-inbox',
              inboxId: company1.inboxId,
              usuarioChatwitId: company1.usuarioChatwitId,
              nome: 'Company ABC WhatsApp',
              whatsappApiKey: 'shared-api-key',
              phoneNumberId: 'shared-phone-number',
              whatsappBusinessAccountId: 'shared-business-account',
              usuarioChatwit: {
                id: company1.usuarioChatwitId,
                configuracaoGlobalWhatsApp: null
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      mockPrisma.mapeamentoIntencao.findUnique
        .mockImplementation((query: any) => {
          const intentName = query.where.intentName_inboxId.intentName;
          const inboxId = query.where.intentName_inboxId.inboxId;
          
          if (intentName === company1.intentName && inboxId === 'internal-company1-inbox') {
            return Promise.resolve({
              id: 'mapping-company1',
              intentName: company1.intentName,
              inboxId: 'internal-company1-inbox',
              template: {
                id: 'template-company1',
                name: company1.templateName,
                type: 'INTERACTIVE_MESSAGE',
                scope: 'user',
                description: null,
                language: 'pt-BR',
                simpleReplyText: null,
                interactiveContent: {
                  body: { text: company1.responseText }
                },
                whatsappOfficialInfo: null
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      // Mock cache operations
      const cacheOperations: Array<{ operation: string; key: string; data?: any }> = [];
      
      mockRedis.get.mockImplementation((key: string) => {
        cacheOperations.push({ operation: 'get', key });
        return Promise.resolve(null); // Cache miss
      });

      mockRedis.setex.mockImplementation((key: string, ttl: number, value: string) => {
        cacheOperations.push({ operation: 'set', key, data: { ttl, value } });
        return Promise.resolve('OK');
      });

      // Step 1: Company 1 processes a customer message
      const company1Result = await findOptimizedCompleteMessageMapping(
        company1.intentName,
        company1.inboxId
      );

      expect(company1Result).toBeDefined();
      expect(company1Result?.usuarioChatwitId).toBe(company1.usuarioChatwitId);
      expect(company1Result?.unifiedTemplate?.name).toBe(company1.templateName);

      // Verify Company 1's cache operations
      const company1CacheKey = `chatwit:instagram_template_mapping:${company1.intentName}:${company1.usuarioChatwitId}:${company1.inboxId}`;
      expect(cacheOperations.some(op => op.operation === 'get' && op.key === company1CacheKey)).toBe(true);
      expect(cacheOperations.some(op => op.operation === 'set' && op.key === company1CacheKey)).toBe(true);

      // Step 2: Company 2 processes a customer message (same inboxId, same intent)
      jest.clearAllMocks();
      cacheOperations.length = 0;

      // Setup mocks for Company 2
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'internal-company2-inbox',
          inboxId: company2.inboxId,
          usuarioChatwitId: company2.usuarioChatwitId,
          nome: 'Company XYZ WhatsApp',
          whatsappApiKey: 'shared-api-key',
          phoneNumberId: 'shared-phone-number',
          whatsappBusinessAccountId: 'shared-business-account',
          usuarioChatwit: {
            id: company2.usuarioChatwitId,
            configuracaoGlobalWhatsApp: null
          }
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce({
          id: 'mapping-company2',
          intentName: company2.intentName,
          inboxId: 'internal-company2-inbox',
          template: {
            id: 'template-company2',
            name: company2.templateName,
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: {
              body: { text: company2.responseText }
            },
            whatsappOfficialInfo: null
          }
        } as any);

      mockRedis.get.mockImplementation((key: string) => {
        cacheOperations.push({ operation: 'get', key });
        return Promise.resolve(null); // Cache miss for Company 2
      });

      mockRedis.setex.mockImplementation((key: string, ttl: number, value: string) => {
        cacheOperations.push({ operation: 'set', key, data: { ttl, value } });
        return Promise.resolve('OK');
      });

      const company2Result = await findOptimizedCompleteMessageMapping(
        company2.intentName,
        company2.inboxId
      );

      expect(company2Result).toBeDefined();
      expect(company2Result?.usuarioChatwitId).toBe(company2.usuarioChatwitId);
      expect(company2Result?.unifiedTemplate?.name).toBe(company2.templateName);

      // Verify Company 2's cache operations use different keys
      const company2CacheKey = `chatwit:instagram_template_mapping:${company2.intentName}:${company2.usuarioChatwitId}:${company2.inboxId}`;
      expect(cacheOperations.some(op => op.operation === 'get' && op.key === company2CacheKey)).toBe(true);
      expect(cacheOperations.some(op => op.operation === 'set' && op.key === company2CacheKey)).toBe(true);

      // Verify cache keys are different despite same inboxId and intent
      expect(company1CacheKey).not.toBe(company2CacheKey);
      expect(company1CacheKey).toContain(company1.usuarioChatwitId);
      expect(company2CacheKey).toContain(company2.usuarioChatwitId);

      // Verify response content is company-specific
      expect(company1Result?.unifiedTemplate?.interactiveContent?.body?.text).toBe(company1.responseText);
      expect(company2Result?.unifiedTemplate?.interactiveContent?.body?.text).toBe(company2.responseText);
    });
  });

  describe('Scenario 2: Template Update Isolation', () => {
    it('should update templates for one company without affecting another company', async () => {
      const { company1, company2 } = realWorldScenario;

      // Step 1: Both companies have cached templates
      const company1CacheKey = `chatwit:instagram_template_mapping:${company1.intentName}:${company1.usuarioChatwitId}:${company1.inboxId}`;
      const company2CacheKey = `chatwit:instagram_template_mapping:${company2.intentName}:${company2.usuarioChatwitId}:${company2.inboxId}`;

      // Mock existing cache entries
      mockRedis.get.mockImplementation((key: string) => {
        if (key === company1CacheKey) {
          return Promise.resolve(JSON.stringify({
            mapping: {
              id: 'mapping-company1',
              usuarioChatwitId: company1.usuarioChatwitId,
              unifiedTemplate: {
                name: company1.templateName,
                interactiveContent: { body: { text: company1.responseText } }
              }
            },
            cachedAt: new Date(),
            hitCount: 5,
            lastAccessed: new Date()
          }));
        }
        if (key === company2CacheKey) {
          return Promise.resolve(JSON.stringify({
            mapping: {
              id: 'mapping-company2',
              usuarioChatwitId: company2.usuarioChatwitId,
              unifiedTemplate: {
                name: company2.templateName,
                interactiveContent: { body: { text: company2.responseText } }
              }
            },
            cachedAt: new Date(),
            hitCount: 3,
            lastAccessed: new Date()
          }));
        }
        return Promise.resolve(null);
      });

      // Verify both companies can retrieve their cached templates
      const company1Cached = await cache.getTemplateMapping(
        company1.intentName,
        company1.usuarioChatwitId,
        company1.inboxId
      );

      const company2Cached = await cache.getTemplateMapping(
        company2.intentName,
        company2.usuarioChatwitId,
        company2.inboxId
      );

      expect(company1Cached?.usuarioChatwitId).toBe(company1.usuarioChatwitId);
      expect(company2Cached?.usuarioChatwitId).toBe(company2.usuarioChatwitId);

      // Step 2: Company 1 updates their template (simulate API call)
      const invalidationCalls: string[] = [];
      
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern.includes(company1.usuarioChatwitId)) {
          return Promise.resolve([
            company1CacheKey,
            `chatwit:instagram_conversion_result:${company1.intentName}:${company1.usuarioChatwitId}:${company1.inboxId}:50:false`
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.del.mockImplementation((...keys: string[]) => {
        invalidationCalls.push(...keys);
        return Promise.resolve(keys.length);
      });

      // Invalidate Company 1's cache
      await cache.invalidateTemplateMapping(
        company1.intentName,
        company1.usuarioChatwitId,
        company1.inboxId
      );

      // Verify only Company 1's cache was invalidated
      expect(invalidationCalls).toContain(company1CacheKey);
      expect(invalidationCalls).not.toContain(company2CacheKey);
      expect(invalidationCalls.some(key => key.includes(company1.usuarioChatwitId))).toBe(true);
      expect(invalidationCalls.some(key => key.includes(company2.usuarioChatwitId))).toBe(false);

      // Step 3: Verify Company 2's cache is still intact
      jest.clearAllMocks();
      
      mockRedis.get.mockImplementation((key: string) => {
        if (key === company2CacheKey) {
          return Promise.resolve(JSON.stringify({
            mapping: {
              id: 'mapping-company2',
              usuarioChatwitId: company2.usuarioChatwitId,
              unifiedTemplate: {
                name: company2.templateName,
                interactiveContent: { body: { text: company2.responseText } }
              }
            },
            cachedAt: new Date(),
            hitCount: 4, // Incremented
            lastAccessed: new Date()
          }));
        }
        return Promise.resolve(null); // Company 1's cache is now empty
      });

      const company1AfterInvalidation = await cache.getTemplateMapping(
        company1.intentName,
        company1.usuarioChatwitId,
        company1.inboxId
      );

      const company2AfterInvalidation = await cache.getTemplateMapping(
        company2.intentName,
        company2.usuarioChatwitId,
        company2.inboxId
      );

      // Company 1's cache should be empty (invalidated)
      expect(company1AfterInvalidation).toBeNull();

      // Company 2's cache should still be intact
      expect(company2AfterInvalidation).toBeDefined();
      expect(company2AfterInvalidation?.usuarioChatwitId).toBe(company2.usuarioChatwitId);
    });
  });

  describe('Scenario 3: High-Volume Concurrent Processing', () => {
    it('should handle high-volume concurrent webhook processing with proper isolation', async () => {
      const { company1, company2, company3 } = realWorldScenario;
      const companies = [company1, company2, company3];

      // Setup database mocks for all companies
      mockPrisma.chatwitInbox.findFirst
        .mockImplementation((query: any) => {
          const inboxId = query.where.inboxId;
          const company = companies.find(c => c.inboxId === inboxId);
          
          if (company) {
            return Promise.resolve({
              id: `internal-${company.usuarioChatwitId}-inbox`,
              inboxId: company.inboxId,
              usuarioChatwitId: company.usuarioChatwitId,
              nome: `${company.usuarioChatwitId} WhatsApp`,
              whatsappApiKey: 'api-key',
              phoneNumberId: 'phone-number',
              whatsappBusinessAccountId: 'business-account',
              usuarioChatwit: {
                id: company.usuarioChatwitId,
                configuracaoGlobalWhatsApp: null
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      mockPrisma.mapeamentoIntencao.findUnique
        .mockImplementation((query: any) => {
          const intentName = query.where.intentName_inboxId.intentName;
          const inboxId = query.where.intentName_inboxId.inboxId;
          
          const company = companies.find(c => 
            c.intentName === intentName && 
            inboxId === `internal-${c.usuarioChatwitId}-inbox`
          );
          
          if (company) {
            return Promise.resolve({
              id: `mapping-${company.usuarioChatwitId}`,
              intentName: company.intentName,
              inboxId: `internal-${company.usuarioChatwitId}-inbox`,
              template: {
                id: `template-${company.usuarioChatwitId}`,
                name: company.templateName,
                type: 'INTERACTIVE_MESSAGE',
                scope: 'user',
                description: null,
                language: 'pt-BR',
                simpleReplyText: null,
                interactiveContent: {
                  body: { text: company.responseText }
                },
                whatsappOfficialInfo: null
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      // Track all cache operations
      const allCacheOperations: Array<{ 
        operation: string; 
        key: string; 
        usuarioChatwitId: string;
        timestamp: number;
      }> = [];

      mockRedis.get.mockImplementation((key: string) => {
        const usuarioChatwitId = companies.find(c => key.includes(c.usuarioChatwitId))?.usuarioChatwitId || 'unknown';
        allCacheOperations.push({ 
          operation: 'get', 
          key, 
          usuarioChatwitId,
          timestamp: Date.now()
        });
        return Promise.resolve(null); // Always cache miss for this test
      });

      mockRedis.setex.mockImplementation((key: string, ttl: number, value: string) => {
        const usuarioChatwitId = companies.find(c => key.includes(c.usuarioChatwitId))?.usuarioChatwitId || 'unknown';
        allCacheOperations.push({ 
          operation: 'set', 
          key, 
          usuarioChatwitId,
          timestamp: Date.now()
        });
        return Promise.resolve('OK');
      });

      // Create multiple webhook jobs for each company
      const jobsPerCompany = 5;
      const allJobs: Array<{ 
        job: Job<InstagramTranslationJobData>; 
        company: typeof company1;
      }> = [];

      companies.forEach(company => {
        for (let i = 0; i < jobsPerCompany; i++) {
          const jobData: InstagramTranslationJobData = {
            intentName: company.intentName,
            inboxId: company.inboxId,
            contactPhone: `${company.contactPhone}${i}`,
            correlationId: `${company.usuarioChatwitId}-corr-${i}`,
            timestamp: Date.now(),
            retryCount: 0
          };

          const job = {
            id: `${company.usuarioChatwitId}-job-${i}`,
            data: jobData,
            attemptsMade: 0,
            opts: { attempts: 3 },
            processedOn: Date.now(),
            timestamp: Date.now() - 100
          } as Job<InstagramTranslationJobData>;

          allJobs.push({ job, company });
        }
      });

      // Process all jobs concurrently
      const results = await Promise.all(
        allJobs.map(({ job }) => processInstagramTranslationTask(job))
      );

      // Verify all jobs succeeded
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.fulfillmentMessages).toBeDefined();
      });

      // Analyze cache operations for isolation
      const operationsByUser = companies.reduce((acc, company) => {
        acc[company.usuarioChatwitId] = allCacheOperations.filter(
          op => op.usuarioChatwitId === company.usuarioChatwitId
        );
        return acc;
      }, {} as Record<string, typeof allCacheOperations>);

      // Verify each company had the expected number of cache operations
      companies.forEach(company => {
        const userOps = operationsByUser[company.usuarioChatwitId];
        expect(userOps.length).toBeGreaterThanOrEqual(jobsPerCompany * 2); // At least get + set per job
        
        // Verify all operations for this user contain the correct usuarioChatwitId in the key
        userOps.forEach(op => {
          expect(op.key).toContain(company.usuarioChatwitId);
          expect(op.key).toContain(company.inboxId);
          expect(op.key).toContain(company.intentName);
        });
      });

      // Verify no cross-contamination between users
      companies.forEach(company1 => {
        companies.forEach(company2 => {
          if (company1.usuarioChatwitId !== company2.usuarioChatwitId) {
            const user1Ops = operationsByUser[company1.usuarioChatwitId];
            user1Ops.forEach(op => {
              expect(op.key).not.toContain(company2.usuarioChatwitId);
            });
          }
        });
      });

      // Verify cache keys follow the correct format
      allCacheOperations.forEach(op => {
        if (op.key.includes('instagram_template_mapping')) {
          const keyParts = op.key.split(':');
          expect(keyParts).toHaveLength(5); // chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId
          expect(keyParts[0]).toBe('chatwit');
          expect(keyParts[1]).toBe('instagram_template_mapping');
          expect(keyParts[3]).toBe(op.usuarioChatwitId); // usuarioChatwitId should be in correct position
        }
      });
    });
  });

  describe('Scenario 4: Cache Recovery and Consistency', () => {
    it('should maintain cache consistency during Redis failures and recovery', async () => {
      const { company1, company2 } = realWorldScenario;

      // Setup database mocks
      mockPrisma.chatwitInbox.findFirst
        .mockImplementation((query: any) => {
          const inboxId = query.where.inboxId;
          if (inboxId === company1.inboxId) {
            return Promise.resolve({
              id: 'recovery-company1-inbox',
              inboxId: company1.inboxId,
              usuarioChatwitId: company1.usuarioChatwitId,
              nome: 'Recovery Test Company 1',
              whatsappApiKey: 'recovery-api-key',
              phoneNumberId: 'recovery-phone',
              whatsappBusinessAccountId: 'recovery-business',
              usuarioChatwit: {
                id: company1.usuarioChatwitId,
                configuracaoGlobalWhatsApp: null
              }
            } as any);
          }
          return Promise.resolve(null);
        });

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValue({
          id: 'recovery-mapping-company1',
          intentName: company1.intentName,
          inboxId: 'recovery-company1-inbox',
          template: {
            id: 'recovery-template-company1',
            name: company1.templateName,
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: {
              body: { text: company1.responseText }
            },
            whatsappOfficialInfo: null
          }
        } as any);

      // Step 1: Normal operation - cache works
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const normalResult = await findOptimizedCompleteMessageMapping(
        company1.intentName,
        company1.inboxId
      );

      expect(normalResult).toBeDefined();
      expect(normalResult?.usuarioChatwitId).toBe(company1.usuarioChatwitId);

      // Step 2: Redis fails - should gracefully degrade
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      mockRedis.setex.mockRejectedValue(new Error('Redis connection failed'));

      const failureResult = await findOptimizedCompleteMessageMapping(
        company1.intentName,
        company1.inboxId
      );

      // Should still work, just without caching
      expect(failureResult).toBeDefined();
      expect(failureResult?.usuarioChatwitId).toBe(company1.usuarioChatwitId);

      // Step 3: Redis recovers - should resume normal caching
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const recoveryResult = await findOptimizedCompleteMessageMapping(
        company1.intentName,
        company1.inboxId
      );

      expect(recoveryResult).toBeDefined();
      expect(recoveryResult?.usuarioChatwitId).toBe(company1.usuarioChatwitId);

      // Verify cache operations were attempted during recovery
      expect(mockRedis.get).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${company1.intentName}:${company1.usuarioChatwitId}:${company1.inboxId}`
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `chatwit:instagram_template_mapping:${company1.intentName}:${company1.usuarioChatwitId}:${company1.inboxId}`,
        expect.any(Number),
        expect.any(String)
      );
    });
  });
});