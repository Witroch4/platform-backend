// Using global jest from jest.config.js
import { Worker, Queue } from 'bullmq';
import { PrismaClient, Provider, Unit, EventStatus } from '@prisma/client';
import { getRedisInstance, getPrismaInstance } from '@/lib/connections';
import { openaiWithCost } from '@/lib/cost/openai-wrapper';
import { whatsappWithCost } from '@/lib/cost/whatsapp-wrapper';
import { createCostWorker, processCostEvent } from '@/lib/cost/cost-worker';
import { checkAllBudgets } from '@/lib/cost/budget-monitor';
import OpenAI from 'openai';

// Mock external services for integration tests
jest.mock('@/lib/cost/budget-guard');
jest.mock('@/lib/cost/budget-controls');

// Use real Redis and Prisma for integration tests
jest.unmock('@/lib/connections');

describe('Cost System End-to-End Integration', () => {
  let prisma: PrismaClient;
  let redis: any;
  let costWorker: Worker;
  let costQueue: Queue;

  beforeAll(async () => {
    // Initialize real connections
    prisma = getPrismaInstance();
    redis = getRedisInstance();
    
    // Create cost queue
    costQueue = new Queue('cost-events', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    });

    // Clean up any existing data
    await costQueue.obliterate({ force: true });
    await prisma.costEvent.deleteMany({});
    await prisma.costBudget.deleteMany({});
    await prisma.priceCard.deleteMany({});
  });

  afterAll(async () => {
    // Clean up
    if (costWorker) {
      await costWorker.close();
    }
    await costQueue.close();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up data before each test
    await prisma.costEvent.deleteMany({});
    await prisma.costBudget.deleteMany({});
    await prisma.priceCard.deleteMany({});
    
    // Clear Redis cache
    const keys = await redis.keys('cost:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Complete Cost Capture and Processing Flow', () => {
    it('should capture, process and price OpenAI events end-to-end', async () => {
      // Arrange - Create price card
      await prisma.priceCard.create({
        data: {
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          pricePerUnit: 10.0,
          currency: 'USD',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      });

      await prisma.priceCard.create({
        data: {
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_OUT,
          pricePerUnit: 30.0,
          currency: 'USD',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      });

      // Mock OpenAI client
      const mockClient = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              id: 'chatcmpl-test-123',
              usage: {
                input_tokens: 100,
                output_tokens: 50,
                input_tokens_details: { cached_tokens: 0 },
              },
            }),
          },
        },
      } as any;

      // Mock budget guard to allow operation
      jest.doMock('@/lib/cost/budget-guard', () => ({
        guardOpenAIOperation: jest.fn().mockResolvedValue({
          allowed: true,
          model: 'gpt-4',
          reason: null,
        }),
        logBlockedOperation: jest.fn(),
        logModelDowngrade: jest.fn(),
        BudgetExceededException: class extends Error {},
      }));

      // Act - Trigger cost capture
      const result = await openaiWithCost(mockClient, {
        model: 'gpt-4',
        input: [{ role: 'user', content: 'Hello' }],
        meta: {
          sessionId: 'session-test-123',
          inboxId: 'inbox-test-456',
          userId: 'user-test-789',
          intent: 'greeting',
          traceId: 'trace-test-abc',
        },
      });

      // Wait for events to be queued
      await new Promise(resolve => setTimeout(resolve, 100));

      // Start worker to process events
      costWorker = createCostWorker();
      await costWorker.waitUntilReady();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Assert - Check database for processed events
      const events = await prisma.costEvent.findMany({
        where: { externalId: 'chatcmpl-test-123' },
        orderBy: { unit: 'asc' },
      });

      expect(events).toHaveLength(2); // Input and output tokens

      // Check input tokens event
      const inputEvent = events.find(e => e.unit === Unit.TOKENS_IN);
      expect(inputEvent).toBeDefined();
      expect(inputEvent!.provider).toBe(Provider.OPENAI);
      expect(inputEvent!.product).toBe('gpt-4');
      expect(inputEvent!.units).toBe(100);
      expect(inputEvent!.unitPrice).toBe(10.0);
      expect(inputEvent!.cost).toBe(0.001); // 100/1M * 10 = 0.001
      expect(inputEvent!.status).toBe(EventStatus.PRICED);
      expect(inputEvent!.sessionId).toBe('session-test-123');
      expect(inputEvent!.inboxId).toBe('inbox-test-456');
      expect(inputEvent!.userId).toBe('user-test-789');

      // Check output tokens event
      const outputEvent = events.find(e => e.unit === Unit.TOKENS_OUT);
      expect(outputEvent).toBeDefined();
      expect(outputEvent!.units).toBe(50);
      expect(outputEvent!.unitPrice).toBe(30.0);
      expect(outputEvent!.cost).toBe(0.0015); // 50/1M * 30 = 0.0015
      expect(outputEvent!.status).toBe(EventStatus.PRICED);
    });

    it('should handle WhatsApp template cost capture and processing', async () => {
      // Arrange - Create price card for WhatsApp
      await prisma.priceCard.create({
        data: {
          provider: Provider.META_WHATSAPP,
          product: 'WABA',
          unit: Unit.WHATSAPP_TEMPLATE,
          region: 'BRAZIL',
          pricePerUnit: 0.055,
          currency: 'USD',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      });

      // Mock WhatsApp send function
      const mockSendFunction = jest.fn().mockResolvedValue({
        messageId: 'wamid.test-456',
        status: 'sent',
      });

      // Mock budget guard
      jest.doMock('@/lib/cost/budget-guard', () => ({
        guardWhatsAppOperation: jest.fn().mockResolvedValue({
          allowed: true,
          reason: null,
        }),
        logBlockedOperation: jest.fn(),
        BudgetExceededException: class extends Error {},
      }));

      // Act - Trigger WhatsApp cost capture
      const result = await whatsappWithCost(mockSendFunction, {
        templateName: 'welcome_message',
        to: '+5511999999999',
        meta: {
          sessionId: 'session-wa-123',
          inboxId: 'inbox-wa-456',
          userId: 'user-wa-789',
          intent: 'welcome',
          traceId: 'trace-wa-abc',
        },
      });

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Assert - Check database for processed events
      const events = await prisma.costEvent.findMany({
        where: { externalId: 'wamid.test-456' },
      });

      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.provider).toBe(Provider.META_WHATSAPP);
      expect(event.product).toBe('WABA');
      expect(event.unit).toBe(Unit.WHATSAPP_TEMPLATE);
      expect(event.units).toBe(1);
      expect(event.unitPrice).toBe(0.055);
      expect(event.cost).toBe(0.055);
      expect(event.status).toBe(EventStatus.PRICED);
      expect(event.sessionId).toBe('session-wa-123');
      expect(event.inboxId).toBe('inbox-wa-456');
      expect(event.userId).toBe('user-wa-789');
      
      // Check raw data
      const rawData = event.raw as any;
      expect(rawData.templateName).toBe('welcome_message');
      expect(rawData.templateCategory).toBe('MARKETING_TEMPLATE');
      expect(rawData.region).toBe('BRAZIL');
    });
  });

  describe('Budget Monitoring Integration', () => {
    it('should monitor budgets and trigger alerts', async () => {
      // Arrange - Create budget and cost events
      const budget = await prisma.costBudget.create({
        data: {
          name: 'Test Budget',
          inboxId: 'inbox-budget-test',
          period: 'monthly',
          limitUSD: 10.0,
          alertAt: 0.8,
          isActive: true,
        },
      });

      // Create cost events that exceed 80% of budget
      await prisma.costEvent.create({
        data: {
          ts: new Date(),
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          units: 1000000,
          currency: 'USD',
          unitPrice: 10.0,
          cost: 9.0, // 90% of budget
          status: EventStatus.PRICED,
          inboxId: 'inbox-budget-test',
          externalId: 'test-event-1',
          raw: {},
        },
      });

      // Mock budget controls
      const mockSendBudgetAlert = jest.fn();
      const mockRemoveBudgetControls = jest.fn();
      
      jest.doMock('@/lib/cost/budget-controls', () => ({
        sendBudgetAlert: mockSendBudgetAlert,
        applyBudgetControls: jest.fn(),
        removeBudgetControls: mockRemoveBudgetControls,
      }));

      // Act - Check budgets
      const result = await checkAllBudgets();

      // Assert
      expect(result.checked).toBe(1);
      expect(result.alerts).toBe(1);
      expect(result.blocked).toBe(0);
      expect(mockSendBudgetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ id: budget.id }),
        9.0,
        0.9,
        'WARNING'
      );
      expect(mockRemoveBudgetControls).toHaveBeenCalledWith(
        expect.objectContaining({ id: budget.id })
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle pricing failures gracefully', async () => {
      // Arrange - No price card available
      const mockClient = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              id: 'chatcmpl-no-price-123',
              usage: {
                input_tokens: 100,
                output_tokens: 50,
              },
            }),
          },
        },
      } as any;

      // Mock budget guard
      jest.doMock('@/lib/cost/budget-guard', () => ({
        guardOpenAIOperation: jest.fn().mockResolvedValue({
          allowed: true,
          model: 'unknown-model',
          reason: null,
        }),
        logBlockedOperation: jest.fn(),
        logModelDowngrade: jest.fn(),
        BudgetExceededException: class extends Error {},
      }));

      // Act
      await openaiWithCost(mockClient, {
        model: 'unknown-model',
        input: [{ role: 'user', content: 'Hello' }],
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Assert - Events should be created with PENDING_PRICING status
      const events = await prisma.costEvent.findMany({
        where: { externalId: 'chatcmpl-no-price-123' },
      });

      expect(events.length).toBeGreaterThan(0);
      events.forEach(event => {
        expect(event.status).toBe(EventStatus.PENDING_PRICING);
        expect(event.unitPrice).toBeNull();
        expect(event.cost).toBeNull();
      });
    });

    it('should handle duplicate events with idempotency', async () => {
      // Arrange
      const eventData = {
        ts: new Date().toISOString(),
        provider: 'OPENAI',
        product: 'gpt-4',
        unit: 'TOKENS_IN',
        units: 100,
        externalId: 'duplicate-test-123',
        raw: {},
      };

      // Create price card
      await prisma.priceCard.create({
        data: {
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          pricePerUnit: 10.0,
          currency: 'USD',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      });

      // Act - Process same event twice
      await processCostEvent(eventData);
      await processCostEvent(eventData);

      // Assert - Should only create one event
      const events = await prisma.costEvent.findMany({
        where: { externalId: 'duplicate-test-123' },
      });

      expect(events).toHaveLength(1);
    });
  });

  describe('Performance and Volume Testing', () => {
    it('should handle high volume of events efficiently', async () => {
      // Arrange - Create price card
      await prisma.priceCard.create({
        data: {
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          pricePerUnit: 10.0,
          currency: 'USD',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      });

      const eventCount = 100;
      const events = [];

      // Generate multiple events
      for (let i = 0; i < eventCount; i++) {
        events.push({
          ts: new Date().toISOString(),
          provider: 'OPENAI',
          product: 'gpt-4',
          unit: 'TOKENS_IN',
          units: 100,
          externalId: `bulk-test-${i}`,
          sessionId: `session-${i}`,
          raw: {},
        });
      }

      // Act - Process events in bulk
      const startTime = Date.now();
      
      const promises = events.map(event => processCostEvent(event));
      await Promise.all(promises);
      
      const processingTime = Date.now() - startTime;

      // Assert - Check all events were processed
      const processedEvents = await prisma.costEvent.findMany({
        where: {
          externalId: {
            startsWith: 'bulk-test-',
          },
        },
      });

      expect(processedEvents).toHaveLength(eventCount);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      // All events should be priced
      processedEvents.forEach(event => {
        expect(event.status).toBe(EventStatus.PRICED);
        expect(event.cost).toBe(0.001); // 100/1M * 10
      });
    });

    it('should maintain performance under concurrent load', async () => {
      // Arrange
      await prisma.priceCard.create({
        data: {
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          pricePerUnit: 10.0,
          currency: 'USD',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      });

      const concurrentBatches = 5;
      const eventsPerBatch = 20;

      // Act - Process multiple batches concurrently
      const startTime = Date.now();
      
      const batchPromises = Array.from({ length: concurrentBatches }, (_, batchIndex) => {
        const batchEvents = Array.from({ length: eventsPerBatch }, (_, eventIndex) => ({
          ts: new Date().toISOString(),
          provider: 'OPENAI',
          product: 'gpt-4',
          unit: 'TOKENS_IN',
          units: 100,
          externalId: `concurrent-${batchIndex}-${eventIndex}`,
          raw: {},
        }));

        return Promise.all(batchEvents.map(event => processCostEvent(event)));
      });

      await Promise.all(batchPromises);
      
      const processingTime = Date.now() - startTime;

      // Assert
      const totalEvents = concurrentBatches * eventsPerBatch;
      const processedEvents = await prisma.costEvent.findMany({
        where: {
          externalId: {
            startsWith: 'concurrent-',
          },
        },
      });

      expect(processedEvents).toHaveLength(totalEvents);
      expect(processingTime).toBeLessThan(15000); // Should handle concurrent load efficiently
      
      // Check for any processing errors
      const failedEvents = processedEvents.filter(e => e.status !== EventStatus.PRICED);
      expect(failedEvents).toHaveLength(0);
    });
  });
});