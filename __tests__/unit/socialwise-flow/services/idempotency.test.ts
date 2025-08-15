/**
 * Unit tests for SocialWise Flow Idempotency Service
 */

import { SocialWiseIdempotencyService } from '@/lib/socialwise-flow/services/idempotency';
import { SocialWiseFlowPayloadType } from '@/lib/socialwise-flow/schemas/payload';

// Mock Redis
const mockRedis = {
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
};

// Mock getRedisInstance
jest.mock('@/lib/connections', () => ({
  getRedisInstance: () => mockRedis,
}));

describe('SocialWiseIdempotencyService', () => {
  let service: SocialWiseIdempotencyService;

  beforeEach(() => {
    service = new SocialWiseIdempotencyService(300); // 5 minutes TTL
    jest.clearAllMocks();
  });

  describe('extractIdempotencyKey', () => {
    it('should extract key with wamid', () => {
      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const key = service.extractIdempotencyKey(payload);

      expect(key).toEqual({
        wamid: 'wamid789',
        messageId: undefined,
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      });
    });

    it('should extract key with message_data.id when wamid is not present', () => {
      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'instagram',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'instagram' },
            message_data: { id: 'msg789' },
          },
        },
      };

      const key = service.extractIdempotencyKey(payload);

      expect(key).toEqual({
        wamid: undefined,
        messageId: 'msg789',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      });
    });
  });

  describe('isDuplicate', () => {
    it('should return false for new message (not duplicate)', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.isDuplicate(key);

      expect(result).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'sw:idem:acc123:inbox456:wamid123',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should return true for duplicate message', async () => {
      mockRedis.set.mockResolvedValue(null); // Key already exists

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.isDuplicate(key);

      expect(result).toBe(true);
    });

    it('should use messageId when wamid is not available', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const key = {
        messageId: 'msg123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.isDuplicate(key);

      expect(result).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'sw:idem:acc123:inbox456:msg123',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should use sessionId as fallback when neither wamid nor messageId available', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const key = {
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.isDuplicate(key);

      expect(result).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'sw:idem:acc123:inbox456:session123',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should fail open on Redis error', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.isDuplicate(key);

      expect(result).toBe(false); // Fail open
    });
  });

  describe('isPayloadDuplicate', () => {
    it('should check duplicate for complete payload', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const result = await service.isPayloadDuplicate(payload);

      expect(result).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'sw:idem:acc123:inbox456:wamid789',
        '1',
        'EX',
        300,
        'NX'
      );
    });
  });

  describe('markAsProcessed', () => {
    it('should mark message as processed', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      await service.markAsProcessed(key);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'sw:idem:acc123:inbox456:wamid123',
        300,
        '1'
      );
    });
  });

  describe('keyExists', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.keyExists(key);

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('sw:idem:acc123:inbox456:wamid123');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.keyExists(key);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const key = {
        wamid: 'wamid123',
        sessionId: 'session123',
        accountId: 'acc123',
        inboxId: 'inbox456',
      };

      const result = await service.keyExists(key);

      expect(result).toBe(false);
    });
  });
});