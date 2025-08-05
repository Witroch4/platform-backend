/**
 * Unit tests for idempotency service
 * Tests message deduplication using Redis SETNX
 */

import { IdempotencyService } from '@/lib/ai-integration/services/idempotency';

// Mock Redis for unit tests
jest.mock('ioredis');

describe('IdempotencyService', () => {
  let idempotencyService: IdempotencyService;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      setnx: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
      get: jest.fn(),
    };

    idempotencyService = new IdempotencyService(mockRedis, 300); // 5 minutes TTL
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkIdempotency', () => {
    const testParams = {
      accountId: 123,
      conversationId: 456,
      messageId: '789',
    };

    it('should allow first occurrence of message', async () => {
      mockRedis.setnx.mockResolvedValue(1); // Key was set (first time)
      mockRedis.expire.mockResolvedValue(1);

      const result = await idempotencyService.checkIdempotency(testParams);

      expect(result.isDuplicate).toBe(false);
      expect(result.key).toBe('idem:cw:123:456:789');
      expect(mockRedis.setnx).toHaveBeenCalledWith('idem:cw:123:456:789', '1');
      expect(mockRedis.expire).toHaveBeenCalledWith('idem:cw:123:456:789', 300);
    });

    it('should detect duplicate message', async () => {
      mockRedis.setnx.mockResolvedValue(0); // Key already exists

      const result = await idempotencyService.checkIdempotency(testParams);

      expect(result.isDuplicate).toBe(true);
      expect(result.key).toBe('idem:cw:123:456:789');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setnx.mockRejectedValue(new Error('Redis connection failed'));

      const result = await idempotencyService.checkIdempotency(testParams);

      // Should allow request when Redis fails (fail-open)
      expect(result.isDuplicate).toBe(false);
      expect(result.error).toBe('Redis connection failed');
    });

    it('should generate correct idempotency key format', async () => {
      mockRedis.setnx.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      const params = {
        accountId: 999,
        conversationId: 888,
        messageId: 'msg-abc-123',
      };

      await idempotencyService.checkIdempotency(params);

      expect(mockRedis.setnx).toHaveBeenCalledWith('idem:cw:999:888:msg-abc-123', '1');
    });

    it('should set TTL only for new keys', async () => {
      // First call - new key
      mockRedis.setnx.mockResolvedValueOnce(1);
      mockRedis.expire.mockResolvedValue(1);

      await idempotencyService.checkIdempotency(testParams);

      expect(mockRedis.expire).toHaveBeenCalledTimes(1);

      // Second call - existing key
      mockRedis.setnx.mockResolvedValueOnce(0);

      await idempotencyService.checkIdempotency(testParams);

      // expire should not be called again
      expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeIdempotencyKey', () => {
    it('should remove idempotency key', async () => {
      mockRedis.del.mockResolvedValue(1);

      const params = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
      };

      const result = await idempotencyService.removeIdempotencyKey(params);

      expect(result.removed).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('idem:cw:123:456:789');
    });

    it('should handle key not found', async () => {
      mockRedis.del.mockResolvedValue(0); // Key didn't exist

      const params = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
      };

      const result = await idempotencyService.removeIdempotencyKey(params);

      expect(result.removed).toBe(false);
    });
  });

  describe('getIdempotencyStatus', () => {
    it('should return status of idempotency key', async () => {
      mockRedis.get.mockResolvedValue('1');

      const params = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
      };

      const result = await idempotencyService.getIdempotencyStatus(params);

      expect(result.exists).toBe(true);
      expect(result.value).toBe('1');
      expect(mockRedis.get).toHaveBeenCalledWith('idem:cw:123:456:789');
    });

    it('should return false for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const params = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
      };

      const result = await idempotencyService.getIdempotencyStatus(params);

      expect(result.exists).toBe(false);
      expect(result.value).toBeNull();
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent key format', () => {
      const params = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
      };

      const key = idempotencyService.generateIdempotencyKey(params);

      expect(key).toBe('idem:cw:123:456:789');
    });

    it('should handle string message IDs', () => {
      const params = {
        accountId: 123,
        conversationId: 456,
        messageId: 'wamid.ABC123DEF456',
      };

      const key = idempotencyService.generateIdempotencyKey(params);

      expect(key).toBe('idem:cw:123:456:wamid.ABC123DEF456');
    });
  });
});