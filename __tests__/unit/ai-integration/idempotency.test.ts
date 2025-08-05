/**
 * Unit tests for Idempotency Guards
 */

import { IdempotencyGuard } from '../../../lib/ai-integration/services/idempotency';
import { getRedisInstance } from '../../../lib/connections';

// Mock Redis
jest.mock('../../../lib/connections');

const mockRedis = {
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  pipeline: jest.fn(),
};

const mockPipeline = {
  set: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

(getRedisInstance as jest.Mock).mockReturnValue(mockRedis);

describe('IdempotencyGuard', () => {
  let idempotencyGuard: IdempotencyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    idempotencyGuard = new IdempotencyGuard();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
  });

  describe('checkAndMarkProcessed', () => {
    const testParams = {
      accountId: 1,
      conversationId: 123,
      messageId: '789',
    };

    it('should generate correct idempotency key', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await idempotencyGuard.checkAndMarkProcessed(testParams);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idem:cw:1:123:789',
        '1',
        'EX',
        300, // default TTL
        'NX'
      );
    });

    it('should return isProcessed=false for new message', async () => {
      mockRedis.set.mockResolvedValue('OK'); // SETNX successful

      const result = await idempotencyGuard.checkAndMarkProcessed(testParams);

      expect(result).toEqual({
        isProcessed: false,
        key: 'idem:cw:1:123:789'
      });
    });

    it('should return isProcessed=true for duplicate message', async () => {
      mockRedis.set.mockResolvedValue(null); // SETNX failed (key exists)

      const result = await idempotencyGuard.checkAndMarkProcessed(testParams);

      expect(result).toEqual({
        isProcessed: true,
        key: 'idem:cw:1:123:789'
      });
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await idempotencyGuard.checkAndMarkProcessed({
        ...testParams,
        ttlSeconds: 600
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idem:cw:1:123:789',
        '1',
        'EX',
        600,
        'NX'
      );
    });

    it('should fail open on Redis error', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const result = await idempotencyGuard.checkAndMarkProcessed(testParams);

      expect(result).toEqual({
        isProcessed: false,
        key: 'idem:cw:1:123:789'
      });
    });
  });

  describe('removeKey', () => {
    const testParams = {
      accountId: 1,
      conversationId: 123,
      messageId: '789',
    };

    it('should remove key successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await idempotencyGuard.removeKey(testParams);

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('idem:cw:1:123:789');
    });

    it('should return false if key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await idempotencyGuard.removeKey(testParams);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      const result = await idempotencyGuard.removeKey(testParams);

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    const testParams = {
      accountId: 1,
      conversationId: 123,
      messageId: '789',
    };

    it('should return true if key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await idempotencyGuard.exists(testParams);

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('idem:cw:1:123:789');
    });

    it('should return false if key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await idempotencyGuard.exists(testParams);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await idempotencyGuard.exists(testParams);

      expect(result).toBe(false);
    });
  });

  describe('getTtl', () => {
    const testParams = {
      accountId: 1,
      conversationId: 123,
      messageId: '789',
    };

    it('should return TTL value', async () => {
      mockRedis.ttl.mockResolvedValue(250);

      const result = await idempotencyGuard.getTtl(testParams);

      expect(result).toBe(250);
      expect(mockRedis.ttl).toHaveBeenCalledWith('idem:cw:1:123:789');
    });

    it('should return -1 on Redis error', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('Redis error'));

      const result = await idempotencyGuard.getTtl(testParams);

      expect(result).toBe(-1);
    });
  });

  describe('batchCheck', () => {
    const testParamsList = [
      { accountId: 1, conversationId: 123, messageId: '789' },
      { accountId: 1, conversationId: 124, messageId: '790' },
      { accountId: 2, conversationId: 125, messageId: '791' },
    ];

    it('should return empty array for empty input', async () => {
      const result = await idempotencyGuard.batchCheck([]);
      expect(result).toEqual([]);
    });

    it('should process batch successfully', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 'OK'],    // First message is new
        [null, null],    // Second message is duplicate
        [null, 'OK'],    // Third message is new
      ]);

      const result = await idempotencyGuard.batchCheck(testParamsList);

      expect(result).toEqual([
        { isProcessed: false, key: 'idem:cw:1:123:789' },
        { isProcessed: true, key: 'idem:cw:1:124:790' },
        { isProcessed: false, key: 'idem:cw:2:125:791' },
      ]);

      expect(mockPipeline.set).toHaveBeenCalledTimes(3);
      expect(mockPipeline.set).toHaveBeenNthCalledWith(1, 'idem:cw:1:123:789', '1', 'EX', 300, 'NX');
      expect(mockPipeline.set).toHaveBeenNthCalledWith(2, 'idem:cw:1:124:790', '1', 'EX', 300, 'NX');
      expect(mockPipeline.set).toHaveBeenNthCalledWith(3, 'idem:cw:2:125:791', '1', 'EX', 300, 'NX');
    });

    it('should use custom TTL for batch operations', async () => {
      const customTtlParams = testParamsList.map(params => ({ ...params, ttlSeconds: 600 }));
      
      mockPipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [null, 'OK'],
        [null, 'OK'],
      ]);

      await idempotencyGuard.batchCheck(customTtlParams);

      expect(mockPipeline.set).toHaveBeenNthCalledWith(1, 'idem:cw:1:123:789', '1', 'EX', 600, 'NX');
      expect(mockPipeline.set).toHaveBeenNthCalledWith(2, 'idem:cw:1:124:790', '1', 'EX', 600, 'NX');
      expect(mockPipeline.set).toHaveBeenNthCalledWith(3, 'idem:cw:2:125:791', '1', 'EX', 600, 'NX');
    });

    it('should fail open on pipeline error', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('Pipeline error'));

      const result = await idempotencyGuard.batchCheck(testParamsList);

      expect(result).toEqual([
        { isProcessed: false, key: 'idem:cw:1:123:789' },
        { isProcessed: false, key: 'idem:cw:1:124:790' },
        { isProcessed: false, key: 'idem:cw:2:125:791' },
      ]);
    });

    it('should handle null pipeline results', async () => {
      mockPipeline.exec.mockResolvedValue(null);

      const result = await idempotencyGuard.batchCheck(testParamsList);

      expect(result).toEqual([]);
    });
  });

  describe('key generation', () => {
    it('should generate keys with different account IDs', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await idempotencyGuard.checkAndMarkProcessed({
        accountId: 999,
        conversationId: 123,
        messageId: '789',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idem:cw:999:123:789',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should generate keys with string message IDs', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await idempotencyGuard.checkAndMarkProcessed({
        accountId: 1,
        conversationId: 123,
        messageId: 'msg-abc-123',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idem:cw:1:123:msg-abc-123',
        '1',
        'EX',
        300,
        'NX'
      );
    });
  });
});