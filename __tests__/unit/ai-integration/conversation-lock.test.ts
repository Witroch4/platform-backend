/**
 * Unit tests for Conversation Lock
 */

import { ConversationLock } from '../../../lib/ai-integration/services/conversation-lock';
import { getRedisInstance } from '../../../lib/connections';

// Mock Redis
jest.mock('../../../lib/connections');

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
  keys: jest.fn(),
  pipeline: jest.fn(),
};

const mockPipeline = {
  get: jest.fn().mockReturnThis(),
  ttl: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

(getRedisInstance as jest.Mock).mockReturnValue(mockRedis);

// Mock process.pid
const originalPid = process.pid;
Object.defineProperty(process, 'pid', { value: 12345 });

describe('ConversationLock', () => {
  let conversationLock: ConversationLock;

  beforeEach(() => {
    jest.clearAllMocks();
    conversationLock = new ConversationLock();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    
    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00
    
    // Mock Math.random for consistent lock values
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(process, 'pid', { value: originalPid });
  });

  describe('acquireLock', () => {
    const testParams = {
      conversationId: 123,
    };

    it('should acquire lock successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await conversationLock.acquireLock(testParams);

      expect(result).toEqual({
        acquired: true,
        lockKey: 'lock:cw:123',
        lockValue: '12345-1640995200000-4gffc9',
        expiresAt: 1640995500000, // now + 300s
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:cw:123',
        '12345-1640995200000-4gffc9',
        'EX',
        300,
        'NX'
      );
    });

    it('should fail to acquire lock when already locked', async () => {
      mockRedis.set.mockResolvedValue(null); // Lock already exists

      const result = await conversationLock.acquireLock({
        ...testParams,
        retryAttempts: 0, // No retries for faster test
      });

      expect(result).toEqual({
        acquired: false,
        lockKey: 'lock:cw:123',
        lockValue: '12345-1640995200000-4gffc9',
        expiresAt: 0,
      });
    });

    it('should use custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await conversationLock.acquireLock({
        ...testParams,
        ttlSeconds: 600,
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:cw:123',
        expect.any(String),
        'EX',
        600,
        'NX'
      );
    });

    it('should retry with exponential backoff', async () => {
      mockRedis.set
        .mockResolvedValueOnce(null) // First attempt fails
        .mockResolvedValueOnce(null) // Second attempt fails
        .mockResolvedValueOnce('OK'); // Third attempt succeeds

      const startTime = Date.now();
      const result = await conversationLock.acquireLock({
        ...testParams,
        retryAttempts: 2,
        retryDelayMs: 10, // Small delay for testing
      });

      expect(result.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
      
      // Should have waited between attempts
      const endTime = Date.now();
      expect(endTime - startTime).toBeGreaterThan(10); // At least one delay
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const result = await conversationLock.acquireLock({
        ...testParams,
        retryAttempts: 0,
      });

      expect(result.acquired).toBe(false);
    });
  });

  describe('releaseLock', () => {
    const conversationId = 123;
    const lockValue = '12345-1640995200000-4gffc9';

    it('should release lock successfully when owner', async () => {
      mockRedis.eval.mockResolvedValue(1); // Lock was deleted

      const result = await conversationLock.releaseLock(conversationId, lockValue);

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("GET", KEYS[1]) == ARGV[1]'),
        1,
        'lock:cw:123',
        lockValue
      );
    });

    it('should fail to release lock when not owner', async () => {
      mockRedis.eval.mockResolvedValue(0); // Lock was not deleted (not owner)

      const result = await conversationLock.releaseLock(conversationId, lockValue);

      expect(result).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const result = await conversationLock.releaseLock(conversationId, lockValue);

      expect(result).toBe(false);
    });
  });

  describe('extendLock', () => {
    const conversationId = 123;
    const lockValue = '12345-1640995200000-4gffc9';

    it('should extend lock successfully when owner', async () => {
      mockRedis.eval.mockResolvedValue(1); // Lock was extended

      const result = await conversationLock.extendLock(conversationId, lockValue, 600);

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("GET", KEYS[1]) == ARGV[1]'),
        1,
        'lock:cw:123',
        lockValue,
        600
      );
    });

    it('should fail to extend lock when not owner', async () => {
      mockRedis.eval.mockResolvedValue(0); // Lock was not extended (not owner)

      const result = await conversationLock.extendLock(conversationId, lockValue, 600);

      expect(result).toBe(false);
    });
  });

  describe('isLocked', () => {
    const conversationId = 123;

    it('should return lock info when locked', async () => {
      const lockValue = '12345-1640995200000-4gffc9';
      mockRedis.get.mockResolvedValue(lockValue);
      mockRedis.ttl.mockResolvedValue(250);

      const result = await conversationLock.isLocked(conversationId);

      expect(result).toEqual({
        isLocked: true,
        lockKey: 'lock:cw:123',
        ttl: 250,
        lockedBy: lockValue,
      });
    });

    it('should return not locked when no lock exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.ttl.mockResolvedValue(-2);

      const result = await conversationLock.isLocked(conversationId);

      expect(result).toEqual({
        isLocked: false,
        lockKey: 'lock:cw:123',
        ttl: 0,
        lockedBy: undefined,
      });
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await conversationLock.isLocked(conversationId);

      expect(result).toEqual({
        isLocked: false,
        lockKey: 'lock:cw:123',
        ttl: 0,
      });
    });
  });

  describe('forceReleaseLock', () => {
    const conversationId = 123;

    it('should force release lock successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await conversationLock.forceReleaseLock(conversationId);

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('lock:cw:123');
    });

    it('should return false when lock does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await conversationLock.forceReleaseLock(conversationId);

      expect(result).toBe(false);
    });
  });

  describe('getActiveLocks', () => {
    it('should return active locks', async () => {
      mockRedis.keys.mockResolvedValue(['lock:cw:123', 'lock:cw:456']);
      mockPipeline.exec.mockResolvedValue([
        [null, 'value1'], // get lock:cw:123
        [null, 250],      // ttl lock:cw:123
        [null, 'value2'], // get lock:cw:456
        [null, 180],      // ttl lock:cw:456
      ]);

      const result = await conversationLock.getActiveLocks();

      expect(result).toEqual([
        {
          conversationId: 123,
          lockKey: 'lock:cw:123',
          lockedBy: 'value1',
          ttl: 250,
        },
        {
          conversationId: 456,
          lockKey: 'lock:cw:456',
          lockedBy: 'value2',
          ttl: 180,
        },
      ]);
    });

    it('should return empty array when no locks exist', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const result = await conversationLock.getActiveLocks();

      expect(result).toEqual([]);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const result = await conversationLock.getActiveLocks();

      expect(result).toEqual([]);
    });
  });

  describe('withLock', () => {
    const conversationId = 123;

    it('should execute function with lock successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1); // Release successful

      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await conversationLock.withLock(conversationId, mockFn);

      expect(result).toEqual({
        success: true,
        result: 'success',
      });

      expect(mockFn).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled(); // Lock acquired
      expect(mockRedis.eval).toHaveBeenCalled(); // Lock released
    });

    it('should fail when lock cannot be acquired', async () => {
      mockRedis.set.mockResolvedValue(null); // Lock acquisition fails

      const mockFn = jest.fn();

      const result = await conversationLock.withLock(conversationId, mockFn, {
        retryAttempts: 0,
      });

      expect(result).toEqual({
        success: false,
        error: expect.any(Error),
      });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should handle function errors and still release lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1); // Release successful

      const mockError = new Error('Function failed');
      const mockFn = jest.fn().mockRejectedValue(mockError);

      const result = await conversationLock.withLock(conversationId, mockFn);

      expect(result).toEqual({
        success: false,
        error: mockError,
      });

      expect(mockFn).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled(); // Lock acquired
      expect(mockRedis.eval).toHaveBeenCalled(); // Lock still released
    });
  });

  describe('cleanupExpiredLocks', () => {
    it('should clean up expired locks', async () => {
      // Mock getActiveLocks to return locks with different TTLs
      jest.spyOn(conversationLock, 'getActiveLocks').mockResolvedValue([
        { conversationId: 123, lockKey: 'lock:cw:123', lockedBy: 'value1', ttl: -1 }, // Expired
        { conversationId: 456, lockKey: 'lock:cw:456', lockedBy: 'value2', ttl: 250 }, // Active
        { conversationId: 789, lockKey: 'lock:cw:789', lockedBy: 'value3', ttl: 0 }, // Expired
      ]);

      mockRedis.del
        .mockResolvedValueOnce(1) // First cleanup successful
        .mockResolvedValueOnce(1); // Second cleanup successful

      const result = await conversationLock.cleanupExpiredLocks();

      expect(result).toBe(2); // Two locks cleaned up
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith('lock:cw:123');
      expect(mockRedis.del).toHaveBeenCalledWith('lock:cw:789');
    });

    it('should handle errors during cleanup', async () => {
      jest.spyOn(conversationLock, 'getActiveLocks').mockRejectedValue(new Error('Redis error'));

      const result = await conversationLock.cleanupExpiredLocks();

      expect(result).toBe(0);
    });
  });

  describe('key generation', () => {
    it('should generate correct lock keys for different conversation IDs', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await conversationLock.acquireLock({ conversationId: 999 });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:cw:999',
        expect.any(String),
        'EX',
        300,
        'NX'
      );
    });
  });

  describe('lock value generation', () => {
    it('should generate unique lock values', async () => {
      mockRedis.set.mockResolvedValue('OK');

      // Reset mocks to get different random values
      (Math.random as jest.Mock).mockReturnValueOnce(0.111).mockReturnValueOnce(0.222);
      (Date.now as jest.Mock).mockReturnValueOnce(1000).mockReturnValueOnce(2000);

      const result1 = await conversationLock.acquireLock({ conversationId: 123 });
      const result2 = await conversationLock.acquireLock({ conversationId: 123 });

      expect(result1.lockValue).not.toBe(result2.lockValue);
    });
  });
});