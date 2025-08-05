/**
 * Unit tests for Message Ordering Guard
 */

import { MessageOrderingGuard } from '../../../lib/ai-integration/services/message-ordering';
import { getRedisInstance } from '../../../lib/connections';

// Mock Redis
jest.mock('../../../lib/connections');

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  ttl: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  pipeline: jest.fn(),
};

const mockPipeline = {
  get: jest.fn().mockReturnThis(),
  ttl: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

(getRedisInstance as jest.Mock).mockReturnValue(mockRedis);

describe('MessageOrderingGuard', () => {
  let messageOrderingGuard: MessageOrderingGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    messageOrderingGuard = new MessageOrderingGuard();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    
    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('checkMessageOrder', () => {
    const baseParams = {
      conversationId: 123,
      messageId: 'msg-001',
      createdAt: 1640995100, // 2021-12-31 23:58:20
    };

    it('should allow first message in conversation', async () => {
      mockRedis.get.mockResolvedValue(null); // No previous messages
      mockRedis.setex.mockResolvedValue('OK');

      const result = await messageOrderingGuard.checkMessageOrder(baseParams);

      expect(result).toEqual({
        isOutOfOrder: false,
        shouldRouteToAgent: false,
        lastProcessedAt: 0,
        currentMessageAt: 1640995100,
        key: 'msg_order:cw:123',
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'msg_order:cw:123',
        3600, // default TTL
        JSON.stringify({
          timestamp: 1640995100,
          messageId: 'msg-001',
          updatedAt: 1640995200000,
        })
      );
    });

    it('should allow message that arrives in order', async () => {
      const previousData = JSON.stringify({
        timestamp: 1640995000, // Earlier timestamp
        messageId: 'msg-000',
        updatedAt: 1640995000000,
      });

      mockRedis.get.mockResolvedValue(previousData);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await messageOrderingGuard.checkMessageOrder(baseParams);

      expect(result).toEqual({
        isOutOfOrder: false,
        shouldRouteToAgent: false,
        lastProcessedAt: 1640995000,
        currentMessageAt: 1640995100,
        key: 'msg_order:cw:123',
      });

      // Should update timestamp
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should detect out-of-order message and route to agent', async () => {
      const previousData = JSON.stringify({
        timestamp: 1640995200, // Later timestamp
        messageId: 'msg-002',
        updatedAt: 1640995200000,
      });

      mockRedis.get.mockResolvedValue(previousData);

      const result = await messageOrderingGuard.checkMessageOrder(baseParams);

      expect(result).toEqual({
        isOutOfOrder: true,
        shouldRouteToAgent: true,
        lastProcessedAt: 1640995200,
        currentMessageAt: 1640995100,
        key: 'msg_order:cw:123',
      });

      // Should NOT update timestamp for out-of-order messages
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      await messageOrderingGuard.checkMessageOrder({
        ...baseParams,
        ttlSeconds: 7200,
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'msg_order:cw:123',
        7200,
        expect.any(String)
      );
    });

    it('should handle corrupted Redis data gracefully', async () => {
      mockRedis.get.mockResolvedValue('invalid-json');
      mockRedis.setex.mockResolvedValue('OK');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await messageOrderingGuard.checkMessageOrder(baseParams);

      expect(result.isOutOfOrder).toBe(false);
      expect(result.shouldRouteToAgent).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should fail safe on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await messageOrderingGuard.checkMessageOrder(baseParams);

      expect(result).toEqual({
        isOutOfOrder: false,
        shouldRouteToAgent: false,
        lastProcessedAt: 0,
        currentMessageAt: 1640995100,
        key: 'msg_order:cw:123',
      });
    });

    it('should handle messages with same timestamp', async () => {
      const previousData = JSON.stringify({
        timestamp: 1640995100, // Same timestamp
        messageId: 'msg-000',
        updatedAt: 1640995000000,
      });

      mockRedis.get.mockResolvedValue(previousData);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await messageOrderingGuard.checkMessageOrder(baseParams);

      expect(result.isOutOfOrder).toBe(false);
      expect(result.shouldRouteToAgent).toBe(false);
    });
  });

  describe('getLastProcessedTimestamp', () => {
    const conversationId = 123;

    it('should return last processed timestamp', async () => {
      const data = JSON.stringify({
        timestamp: 1640995100,
        messageId: 'msg-001',
        updatedAt: 1640995200000,
      });

      mockRedis.get.mockResolvedValue(data);
      mockRedis.ttl.mockResolvedValue(3500);

      const result = await messageOrderingGuard.getLastProcessedTimestamp(conversationId);

      expect(result).toEqual({
        conversationId: 123,
        lastProcessedAt: 1640995100,
        lastMessageId: 'msg-001',
        ttl: 3500,
      });
    });

    it('should return null when no data exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.ttl.mockResolvedValue(-2);

      const result = await messageOrderingGuard.getLastProcessedTimestamp(conversationId);

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await messageOrderingGuard.getLastProcessedTimestamp(conversationId);

      expect(result).toBeNull();
    });
  });

  describe('forceUpdateTimestamp', () => {
    const conversationId = 123;
    const timestamp = 1640995100;
    const messageId = 'msg-001';

    it('should force update timestamp successfully', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const result = await messageOrderingGuard.forceUpdateTimestamp(
        conversationId,
        timestamp,
        messageId
      );

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'msg_order:cw:123',
        3600,
        JSON.stringify({
          timestamp,
          messageId,
          updatedAt: 1640995200000,
          forceUpdated: true,
        })
      );
    });

    it('should use custom TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await messageOrderingGuard.forceUpdateTimestamp(
        conversationId,
        timestamp,
        messageId,
        7200
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'msg_order:cw:123',
        7200,
        expect.any(String)
      );
    });

    it('should handle Redis errors', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      const result = await messageOrderingGuard.forceUpdateTimestamp(
        conversationId,
        timestamp,
        messageId
      );

      expect(result).toBe(false);
    });
  });

  describe('resetConversationOrder', () => {
    const conversationId = 123;

    it('should reset conversation order successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await messageOrderingGuard.resetConversationOrder(conversationId);

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('msg_order:cw:123');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await messageOrderingGuard.resetConversationOrder(conversationId);

      expect(result).toBe(false);
    });

    it('should handle Redis errors', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      const result = await messageOrderingGuard.resetConversationOrder(conversationId);

      expect(result).toBe(false);
    });
  });

  describe('getAllConversationStates', () => {
    it('should return all conversation states', async () => {
      mockRedis.keys.mockResolvedValue(['msg_order:cw:123', 'msg_order:cw:456']);
      
      const data1 = JSON.stringify({
        timestamp: 1640995100,
        messageId: 'msg-001',
        updatedAt: 1640995200000,
      });
      
      const data2 = JSON.stringify({
        timestamp: 1640995200,
        messageId: 'msg-002',
        updatedAt: 1640995300000,
      });

      mockPipeline.exec.mockResolvedValue([
        [null, data1], // get msg_order:cw:123
        [null, 3500],  // ttl msg_order:cw:123
        [null, data2], // get msg_order:cw:456
        [null, 3400],  // ttl msg_order:cw:456
      ]);

      const result = await messageOrderingGuard.getAllConversationStates();

      expect(result).toEqual([
        {
          conversationId: 456,
          lastProcessedAt: 1640995200,
          lastMessageId: 'msg-002',
          ttl: 3400,
        },
        {
          conversationId: 123,
          lastProcessedAt: 1640995100,
          lastMessageId: 'msg-001',
          ttl: 3500,
        },
      ]);
    });

    it('should return empty array when no states exist', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const result = await messageOrderingGuard.getAllConversationStates();

      expect(result).toEqual([]);
    });

    it('should handle corrupted data gracefully', async () => {
      mockRedis.keys.mockResolvedValue(['msg_order:cw:123']);
      mockPipeline.exec.mockResolvedValue([
        [null, 'invalid-json'], // corrupted data
        [null, 3500],
      ]);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await messageOrderingGuard.getAllConversationStates();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle Redis errors', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const result = await messageOrderingGuard.getAllConversationStates();

      expect(result).toEqual([]);
    });
  });

  describe('batchCheckOrder', () => {
    it('should process messages in order within each conversation', async () => {
      const messages = [
        { conversationId: 123, messageId: 'msg-002', createdAt: 1640995200 },
        { conversationId: 123, messageId: 'msg-001', createdAt: 1640995100 },
        { conversationId: 456, messageId: 'msg-003', createdAt: 1640995300 },
      ];

      // Mock Redis responses for sequential processing
      mockRedis.get
        .mockResolvedValueOnce(null) // First message in conv 123
        .mockResolvedValueOnce(JSON.stringify({ timestamp: 1640995100, messageId: 'msg-001' })) // Second message in conv 123
        .mockResolvedValueOnce(null); // First message in conv 456

      mockRedis.setex.mockResolvedValue('OK');

      const results = await messageOrderingGuard.batchCheckOrder(messages);

      expect(results).toHaveLength(3);
      
      // Results should be in original order
      expect(results[0].currentMessageAt).toBe(1640995200); // msg-002
      expect(results[1].currentMessageAt).toBe(1640995100); // msg-001
      expect(results[2].currentMessageAt).toBe(1640995300); // msg-003
    });

    it('should return empty array for empty input', async () => {
      const result = await messageOrderingGuard.batchCheckOrder([]);
      expect(result).toEqual([]);
    });

    it('should detect out-of-order messages in batch', async () => {
      const messages = [
        { conversationId: 123, messageId: 'msg-001', createdAt: 1640995100 },
        { conversationId: 123, messageId: 'msg-000', createdAt: 1640995000 }, // Out of order
      ];

      mockRedis.get
        .mockResolvedValueOnce(null) // First message
        .mockResolvedValueOnce(JSON.stringify({ timestamp: 1640995100, messageId: 'msg-001' })); // Second message (out of order)

      mockRedis.setex.mockResolvedValue('OK');

      const results = await messageOrderingGuard.batchCheckOrder(messages);

      expect(results[0].isOutOfOrder).toBe(false);
      expect(results[1].isOutOfOrder).toBe(true);
      expect(results[1].shouldRouteToAgent).toBe(true);
    });
  });

  describe('cleanupExpiredStates', () => {
    it('should clean up expired states', async () => {
      const mockStates = [
        { conversationId: 123, lastProcessedAt: 1640995100, lastMessageId: 'msg-001', ttl: -1 }, // Expired
        { conversationId: 456, lastProcessedAt: 1640995200, lastMessageId: 'msg-002', ttl: 3500 }, // Active
        { conversationId: 789, lastProcessedAt: 1640995300, lastMessageId: 'msg-003', ttl: 0 }, // Expired
      ];

      jest.spyOn(messageOrderingGuard, 'getAllConversationStates').mockResolvedValue(mockStates);
      
      mockRedis.del
        .mockResolvedValueOnce(1) // First cleanup successful
        .mockResolvedValueOnce(1); // Second cleanup successful

      const result = await messageOrderingGuard.cleanupExpiredStates();

      expect(result).toBe(2);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith('msg_order:cw:123');
      expect(mockRedis.del).toHaveBeenCalledWith('msg_order:cw:789');
    });

    it('should handle errors during cleanup', async () => {
      jest.spyOn(messageOrderingGuard, 'getAllConversationStates').mockRejectedValue(new Error('Redis error'));

      const result = await messageOrderingGuard.cleanupExpiredStates();

      expect(result).toBe(0);
    });
  });

  describe('getOrderingStats', () => {
    it('should return basic ordering statistics', async () => {
      const mockStates = [
        { conversationId: 123, lastProcessedAt: 1640995100, lastMessageId: 'msg-001', ttl: 3500 },
        { conversationId: 456, lastProcessedAt: 1640995200, lastMessageId: 'msg-002', ttl: 3400 },
      ];

      jest.spyOn(messageOrderingGuard, 'getAllConversationStates').mockResolvedValue(mockStates);

      const result = await messageOrderingGuard.getOrderingStats();

      expect(result).toEqual({
        totalConversations: 2,
        outOfOrderCount: 0,
        averageTimeDrift: 0,
        maxTimeDrift: 0,
      });
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(messageOrderingGuard, 'getAllConversationStates').mockRejectedValue(new Error('Redis error'));

      const result = await messageOrderingGuard.getOrderingStats();

      expect(result).toEqual({
        totalConversations: 0,
        outOfOrderCount: 0,
        averageTimeDrift: 0,
        maxTimeDrift: 0,
      });
    });
  });

  describe('key generation', () => {
    it('should generate correct keys for different conversation IDs', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      await messageOrderingGuard.checkMessageOrder({
        conversationId: 999,
        messageId: 'msg-001',
        createdAt: 1640995100,
      });

      expect(mockRedis.get).toHaveBeenCalledWith('msg_order:cw:999');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'msg_order:cw:999',
        expect.any(Number),
        expect.any(String)
      );
    });
  });
});