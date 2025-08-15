/**
 * Integrated tests for SocialWise Flow with concurrency control and degradation
 * Tests the complete flow from classification through response generation
 */

import { processSocialWiseFlow, ProcessorContext } from '../processor';
import { getConcurrencyManager } from '../concurrency-manager';
import { selectDegradationStrategy } from '../degradation-strategies';
import { createLogger } from '@/lib/utils/logger';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('@/services/openai');
jest.mock('@/lib/socialwise/assistant');
jest.mock('@/lib/socialwise/templates');

const integrationLogger = createLogger('IntegratedDegradationTest');

describe('SocialWise Flow Integrated Degradation Tests', () => {
  const mockContext: ProcessorContext = {
    userText: 'Preciso de ajuda com uma multa de trânsito do DETRAN',
    channelType: 'whatsapp',
    inboxId: 'test-inbox-123',
    chatwitAccountId: 'test-account-456',
    userId: 'test-user-789',
    wamid: 'test-wamid-abc',
    traceId: 'integration-test-trace'
  };

  beforeEach(() => {
    // Reset mocks and singletons
    jest.clearAllMocks();
    (getConcurrencyManager as any).instance = null;
  });

  describe('End-to-end degradation scenarios', () => {
    it('should handle complete system failure gracefully', async () => {
      // Mock all services to fail
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockRejectedValue(new Error('Database connection failed'));

      const mockClassifyIntent = require('../classification').classifyIntent;
      mockClassifyIntent.mockRejectedValue(new Error('Classification service unavailable'));

      const result = await processSocialWiseFlow(mockContext, true);

      expect(result.response).toBeDefined();
      expect(result.response.text || result.response.whatsapp || result.response.instagram).toBeDefined();
      expect(result.metrics.band).toBe('LOW');
      expect(result.metrics.strategy).toContain('fallback');

      integrationLogger.info('Complete system failure test passed', {
        strategy: result.metrics.strategy,
        responseType: Object.keys(result.response)[0]
      });
    });

    it('should degrade gracefully when LLM services are overloaded', async () => {
      // Configure concurrency manager with very low limits
      const concurrencyManager = getConcurrencyManager({
        maxConcurrentLlmCallsPerInbox: 1,
        maxConcurrentLlmCallsGlobal: 2,
        queueTimeoutMs: 100,
        degradationEnabled: true
      });

      // Mock assistant to return valid config
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockResolvedValue({
        model: 'gpt-4o-mini',
        instructions: 'Legal assistant for traffic violations'
      });

      // Mock classification to return SOFT band (requires LLM)
      const mockClassifyIntent = require('../classification').classifyIntent;
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.72,
        candidates: [
          { slug: 'recurso_multa_transito', name: 'Recurso de Multa', score: 0.72 },
          { slug: 'defesa_administrativa', name: 'Defesa Administrativa', score: 0.68 }
        ],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 45, route_total_ms: 50 }
      });

      // Create multiple concurrent requests to trigger degradation
      const requests = Array.from({ length: 5 }, (_, i) => 
        processSocialWiseFlow({
          ...mockContext,
          traceId: `concurrent-test-${i}`
        }, true)
      );

      const results = await Promise.all(requests);

      // At least some should succeed, some should degrade
      const successful = results.filter(r => r.metrics.strategy === 'warmup_buttons');
      const degraded = results.filter(r => r.metrics.strategy.includes('degraded') || r.metrics.strategy.includes('fallback'));

      expect(successful.length + degraded.length).toBe(5);
      expect(degraded.length).toBeGreaterThan(0); // Some should be degraded due to concurrency

      integrationLogger.info('Concurrency degradation test passed', {
        successful: successful.length,
        degraded: degraded.length,
        total: results.length
      });
    });

    it('should maintain response quality during partial service failures', async () => {
      // Mock embedding service to timeout
      const mockEmbedText = jest.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Embedding timeout')), 100)
        )
      );

      // Mock classification to use keyword fallback
      const mockClassifyIntent = require('../classification').classifyIntent;
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.45, // Lower score from keyword matching
        candidates: [
          { slug: 'recurso_multa_transito', name: 'Recurso de Multa', score: 0.45 }
        ],
        strategy: 'warmup_buttons_degraded',
        metrics: { embedding_ms: 100, route_total_ms: 120 }
      });

      // Mock assistant
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockResolvedValue({
        model: 'gpt-4o-mini',
        instructions: 'Legal assistant'
      });

      const result = await processSocialWiseFlow(mockContext, true);

      expect(result.response).toBeDefined();
      expect(result.metrics.strategy).toBe('warmup_buttons_degraded');
      
      // Should still provide relevant options despite degradation
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.some(btn => 
          btn.reply.title.toLowerCase().includes('multa') ||
          btn.reply.title.toLowerCase().includes('trânsito')
        )).toBe(true);
      }

      integrationLogger.info('Partial service failure test passed', {
        strategy: result.metrics.strategy,
        buttonsProvided: result.response.whatsapp?.interactive.action.buttons.length || 0
      });
    });
  });

  describe('Channel-specific degradation integration', () => {
    it('should provide appropriate WhatsApp degradation responses', async () => {
      const whatsappContext = { ...mockContext, channelType: 'whatsapp' };

      // Force degradation by mocking all services to fail
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockRejectedValue(new Error('Service unavailable'));

      const result = await processSocialWiseFlow(whatsappContext, true);

      expect(result.response.whatsapp).toBeDefined();
      expect(result.response.whatsapp!.type).toBe('interactive');
      expect(result.response.whatsapp!.interactive.type).toBe('button');
      expect(result.response.whatsapp!.interactive.action.buttons.length).toBeGreaterThan(0);

      // Buttons should be properly formatted for WhatsApp
      result.response.whatsapp!.interactive.action.buttons.forEach(button => {
        expect(button.reply.title.length).toBeLessThanOrEqual(20);
        expect(button.reply.id.length).toBeLessThanOrEqual(256);
      });
    });

    it('should provide appropriate Instagram degradation responses', async () => {
      const instagramContext = { ...mockContext, channelType: 'instagram' };

      // Force degradation
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockRejectedValue(new Error('Service unavailable'));

      const result = await processSocialWiseFlow(instagramContext, true);

      expect(result.response.instagram).toBeDefined();
      expect(result.response.instagram!.message.attachment.type).toBe('template');
      expect(result.response.instagram!.message.attachment.payload.template_type).toBe('button');

      // Buttons should be properly formatted for Instagram
      const buttons = result.response.instagram!.message.attachment.payload.buttons;
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach(button => {
        expect(button.title.length).toBeLessThanOrEqual(20);
        expect(button.payload.length).toBeLessThanOrEqual(1000);
      });
    });
  });

  describe('Performance under degradation', () => {
    it('should maintain fast response times during degradation', async () => {
      const startTime = Date.now();

      // Mock services to simulate various failure modes
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 50)
        )
      );

      const result = await processSocialWiseFlow(mockContext, true);
      const duration = Date.now() - startTime;

      expect(result.response).toBeDefined();
      expect(duration).toBeLessThan(500); // Should be fast even with degradation
      expect(result.metrics.routeTotalMs).toBeLessThan(400);

      integrationLogger.info('Degradation performance test passed', {
        durationMs: duration,
        routeTotalMs: result.metrics.routeTotalMs,
        strategy: result.metrics.strategy
      });
    });

    it('should handle burst traffic with degradation', async () => {
      const startTime = Date.now();

      // Configure strict concurrency limits
      getConcurrencyManager({
        maxConcurrentLlmCallsPerInbox: 1,
        maxConcurrentLlmCallsGlobal: 3,
        queueTimeoutMs: 200,
        degradationEnabled: true
      });

      // Mock services
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockResolvedValue({
        model: 'gpt-4o-mini',
        instructions: 'Legal assistant'
      });

      const mockClassifyIntent = require('../classification').classifyIntent;
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.70,
        candidates: [{ slug: 'test_intent', name: 'Test Intent', score: 0.70 }],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 30, route_total_ms: 40 }
      });

      // Create 20 concurrent requests
      const requests = Array.from({ length: 20 }, (_, i) => 
        processSocialWiseFlow({
          ...mockContext,
          inboxId: `burst-inbox-${i % 5}`, // 5 different inboxes
          traceId: `burst-test-${i}`
        }, true)
      );

      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(20);
      expect(results.every(r => r.response !== undefined)).toBe(true);
      expect(duration).toBeLessThan(3000); // Should handle burst within 3 seconds

      const successful = results.filter(r => !r.metrics.strategy.includes('degraded'));
      const degraded = results.filter(r => r.metrics.strategy.includes('degraded'));

      integrationLogger.info('Burst traffic test passed', {
        total: results.length,
        successful: successful.length,
        degraded: degraded.length,
        durationMs: duration,
        throughput: results.length / (duration / 1000)
      });
    });
  });

  describe('Recovery and resilience', () => {
    it('should recover when services become available again', async () => {
      let serviceFailure = true;

      // Mock service that initially fails then recovers
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockImplementation(() => {
        if (serviceFailure) {
          return Promise.reject(new Error('Service temporarily unavailable'));
        }
        return Promise.resolve({
          model: 'gpt-4o-mini',
          instructions: 'Legal assistant'
        });
      });

      const mockClassifyIntent = require('../classification').classifyIntent;
      mockClassifyIntent.mockResolvedValue({
        band: 'HARD',
        score: 0.85,
        candidates: [{ slug: 'test_intent', name: 'Test Intent', score: 0.85 }],
        strategy: 'direct_map',
        metrics: { embedding_ms: 25, route_total_ms: 30 }
      });

      // First request should degrade
      const degradedResult = await processSocialWiseFlow(mockContext, true);
      expect(degradedResult.metrics.strategy).toContain('fallback');

      // Service recovers
      serviceFailure = false;

      // Second request should succeed normally
      const recoveredResult = await processSocialWiseFlow(mockContext, true);
      expect(recoveredResult.metrics.strategy).toBe('direct_map');

      integrationLogger.info('Service recovery test passed', {
        degradedStrategy: degradedResult.metrics.strategy,
        recoveredStrategy: recoveredResult.metrics.strategy
      });
    });

    it('should maintain state consistency during degradation', async () => {
      const concurrencyManager = getConcurrencyManager();
      
      // Get initial stats
      const initialStats = concurrencyManager.getConcurrencyStats();
      
      // Mock services to cause various failures
      const mockGetAssistantForInbox = require('@/lib/socialwise/assistant').getAssistantForInbox;
      mockGetAssistantForInbox.mockImplementation(() => 
        Math.random() > 0.5 
          ? Promise.resolve({ model: 'gpt-4o-mini', instructions: 'Legal assistant' })
          : Promise.reject(new Error('Random failure'))
      );

      // Run multiple requests with random failures
      const requests = Array.from({ length: 10 }, (_, i) => 
        processSocialWiseFlow({
          ...mockContext,
          traceId: `consistency-test-${i}`
        }, true).catch(error => ({ error: error.message }))
      );

      await Promise.all(requests);

      // Check that concurrency state is consistent
      const finalStats = concurrencyManager.getConcurrencyStats();
      
      expect(finalStats.globalActive).toBe(0); // All operations should be completed
      expect(finalStats.inboxStats.every(stat => stat.active === 0)).toBe(true);

      integrationLogger.info('State consistency test passed', {
        initialActive: initialStats.globalActive,
        finalActive: finalStats.globalActive,
        requestsProcessed: requests.length
      });
    });
  });
});