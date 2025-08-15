// Using global jest from jest.config.js
import { 
  processCostEvent, 
  resolveUnitPrice, 
  calculateCost,
  isEventAlreadyProcessed,
  CostEventData 
} from '@/lib/cost/cost-worker';
import { Provider, Unit, EventStatus } from '@prisma/client';
import { pricingService } from '@/lib/cost/pricing-service';
import { checkEventIdempotency, registerProcessedEvent } from '@/lib/cost/idempotency-service';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('@/lib/cost/pricing-service');
jest.mock('@/lib/cost/idempotency-service');
jest.mock('@/lib/log');

const mockPrisma = {
  costEvent: {
    create: jest.fn(),
  },
};

const mockRedis = {
  incr: jest.fn(),
};

// Mock the connections
jest.mocked(require('@/lib/connections')).getPrismaInstance = jest.fn(() => mockPrisma);
jest.mocked(require('@/lib/connections')).getRedisInstance = jest.fn(() => mockRedis);

const mockPricingService = pricingService as jest.Mocked<typeof pricingService>;
const mockCheckEventIdempotency = checkEventIdempotency as jest.MockedFunction<typeof checkEventIdempotency>;
const mockRegisterProcessedEvent = registerProcessedEvent as jest.MockedFunction<typeof registerProcessedEvent>;

describe('Cost Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    mockCheckEventIdempotency.mockResolvedValue(false);
    mockRegisterProcessedEvent.mockResolvedValue();
    mockRedis.incr.mockResolvedValue(1);
  });

  describe('calculateCost', () => {
    it('should calculate cost for token units correctly', () => {
      // Token units are priced per million
      expect(calculateCost(1_000_000, 10, Unit.TOKENS_IN)).toBe(10); // 1M tokens at $10/M = $10
      expect(calculateCost(500_000, 10, Unit.TOKENS_IN)).toBe(5); // 500K tokens at $10/M = $5
      expect(calculateCost(100, 10, Unit.TOKENS_OUT)).toBe(0.001); // 100 tokens at $10/M = $0.001
    });

    it('should calculate cost for non-token units correctly', () => {
      // Non-token units are priced per unit
      expect(calculateCost(1, 0.5, Unit.WHATSAPP_TEMPLATE)).toBe(0.5);
      expect(calculateCost(5, 0.1, Unit.IMAGE_HIGH)).toBe(0.5);
      expect(calculateCost(10, 2.0, Unit.MARKETING_TEMPLATE)).toBe(20);
    });
  });

  describe('resolveUnitPrice', () => {
    it('should resolve unit price successfully', async () => {
      // Arrange
      const mockPriceInfo = {
        pricePerUnit: 10.0,
        currency: 'USD',
        priceCardId: 'price-123',
      };

      mockPricingService.resolveUnitPrice.mockResolvedValue(mockPriceInfo);

      // Act
      const result = await resolveUnitPrice(
        Provider.OPENAI,
        'gpt-4',
        Unit.TOKENS_IN,
        new Date(),
        'US'
      );

      // Assert
      expect(result).toEqual(mockPriceInfo);
      expect(mockPricingService.resolveUnitPrice).toHaveBeenCalledWith(
        Provider.OPENAI,
        'gpt-4',
        Unit.TOKENS_IN,
        expect.any(Date),
        'US'
      );
    });

    it('should return null when price not found', async () => {
      // Arrange
      mockPricingService.resolveUnitPrice.mockResolvedValue(null);

      // Act
      const result = await resolveUnitPrice(
        Provider.OPENAI,
        'gpt-4',
        Unit.TOKENS_IN,
        new Date()
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockPricingService.resolveUnitPrice.mockRejectedValue(new Error('Pricing error'));

      // Act
      const result = await resolveUnitPrice(
        Provider.OPENAI,
        'gpt-4',
        Unit.TOKENS_IN,
        new Date()
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('isEventAlreadyProcessed', () => {
    it('should check idempotency correctly', async () => {
      // Arrange
      const eventData: CostEventData = {
        ts: new Date().toISOString(),
        provider: 'OPENAI',
        product: 'gpt-4',
        unit: 'TOKENS_IN',
        units: 100,
        externalId: 'chatcmpl-123',
        raw: {},
      };

      mockCheckEventIdempotency.mockResolvedValue(true);

      // Act
      const result = await isEventAlreadyProcessed(eventData);

      // Assert
      expect(result).toBe(true);
      expect(mockCheckEventIdempotency).toHaveBeenCalledWith(eventData);
    });

    it('should handle idempotency check errors', async () => {
      // Arrange
      const eventData: CostEventData = {
        ts: new Date().toISOString(),
        provider: 'OPENAI',
        product: 'gpt-4',
        unit: 'TOKENS_IN',
        units: 100,
        raw: {},
      };

      mockCheckEventIdempotency.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await isEventAlreadyProcessed(eventData);

      // Assert
      expect(result).toBe(false); // Should default to false on error
    });
  });

  describe('processCostEvent', () => {
    const validEventData: CostEventData = {
      ts: new Date().toISOString(),
      provider: 'OPENAI',
      product: 'gpt-4',
      unit: 'TOKENS_IN',
      units: 100,
      externalId: 'chatcmpl-123',
      sessionId: 'session-123',
      inboxId: 'inbox-456',
      userId: 'user-789',
      intent: 'greeting',
      traceId: 'trace-abc',
      raw: { usage: { input_tokens: 100 } },
    };

    it('should process cost event successfully with pricing', async () => {
      // Arrange
      const mockPriceInfo = {
        pricePerUnit: 10.0,
        currency: 'USD',
        priceCardId: 'price-123',
      };

      mockPricingService.resolveUnitPrice.mockResolvedValue(mockPriceInfo);
      mockPrisma.costEvent.create.mockResolvedValue({ id: 'event-123' });

      // Act
      await processCostEvent(validEventData);

      // Assert
      expect(mockPrisma.costEvent.create).toHaveBeenCalledWith({
        data: {
          ts: expect.any(Date),
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          units: 100,
          currency: 'USD',
          unitPrice: 10.0,
          cost: 0.001, // 100 tokens / 1M * $10 = $0.001
          status: EventStatus.PRICED,
          externalId: 'chatcmpl-123',
          traceId: 'trace-abc',
          sessionId: 'session-123',
          inboxId: 'inbox-456',
          userId: 'user-789',
          intent: 'greeting',
          raw: { usage: { input_tokens: 100 } },
        },
      });

      expect(mockRegisterProcessedEvent).toHaveBeenCalledWith(validEventData, 'event-123');
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringMatching(/cost:jobs:daily:/));
    });

    it('should process event without pricing as PENDING_PRICING', async () => {
      // Arrange
      mockPricingService.resolveUnitPrice.mockResolvedValue(null);
      mockPrisma.costEvent.create.mockResolvedValue({ id: 'event-123' });

      // Act
      await processCostEvent(validEventData);

      // Assert
      expect(mockPrisma.costEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          unitPrice: null,
          cost: null,
          status: EventStatus.PENDING_PRICING,
        }),
      });
    });

    it('should skip duplicate events', async () => {
      // Arrange
      mockCheckEventIdempotency.mockResolvedValue(true);

      // Act
      await processCostEvent(validEventData);

      // Assert
      expect(mockPrisma.costEvent.create).not.toHaveBeenCalled();
      expect(mockRegisterProcessedEvent).not.toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidEventData = {
        ...validEventData,
        provider: '', // Invalid
      };

      // Act & Assert
      await expect(processCostEvent(invalidEventData)).rejects.toThrow('Dados de evento incompletos');
    });

    it('should validate units field', async () => {
      // Arrange
      const invalidEventData = {
        ...validEventData,
        units: -1, // Invalid
      };

      // Act & Assert
      await expect(processCostEvent(invalidEventData)).rejects.toThrow('Unidades inválidas');
    });

    it('should handle non-numeric units', async () => {
      // Arrange
      const invalidEventData = {
        ...validEventData,
        units: 'invalid' as any,
      };

      // Act & Assert
      await expect(processCostEvent(invalidEventData)).rejects.toThrow('Unidades inválidas');
    });

    it('should handle database errors', async () => {
      // Arrange
      mockPricingService.resolveUnitPrice.mockResolvedValue({
        pricePerUnit: 10.0,
        currency: 'USD',
        priceCardId: 'price-123',
      });
      mockPrisma.costEvent.create.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(processCostEvent(validEventData)).rejects.toThrow('Database error');
    });

    it('should handle missing optional fields', async () => {
      // Arrange
      const minimalEventData: CostEventData = {
        ts: new Date().toISOString(),
        provider: 'OPENAI',
        product: 'gpt-4',
        unit: 'TOKENS_IN',
        units: 100,
        raw: {},
      };

      mockPricingService.resolveUnitPrice.mockResolvedValue({
        pricePerUnit: 10.0,
        currency: 'USD',
        priceCardId: 'price-123',
      });
      mockPrisma.costEvent.create.mockResolvedValue({ id: 'event-123' });

      // Act
      await processCostEvent(minimalEventData);

      // Assert
      expect(mockPrisma.costEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          externalId: null,
          traceId: null,
          sessionId: null,
          inboxId: null,
          userId: null,
          intent: null,
        }),
      });
    });
  });
});