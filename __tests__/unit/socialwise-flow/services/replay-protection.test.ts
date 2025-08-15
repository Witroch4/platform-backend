/**
 * Unit tests for SocialWise Flow Replay Protection Service
 */

import { SocialWiseReplayProtectionService } from '@/lib/socialwise-flow/services/replay-protection';

// Mock Redis
const mockRedis = {
  set: jest.fn(),
  exists: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
};

// Mock getRedisInstance
jest.mock('@/lib/connections', () => ({
  getRedisInstance: () => mockRedis,
}));

describe('SocialWiseReplayProtectionService', () => {
  let service: SocialWiseReplayProtectionService;

  beforeEach(() => {
    service = new SocialWiseReplayProtectionService(300); // 5 minutes TTL
    jest.clearAllMocks();
  });

  describe('checkAndMarkNonce', () => {
    it('should allow new valid nonce', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const nonce = 'abcd1234efgh5678ijkl';
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: true,
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'sw:nonce:abcd1234efgh5678ijkl',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should reject duplicate nonce (replay detected)', async () => {
      mockRedis.set.mockResolvedValue(null); // Key already exists

      const nonce = 'abcd1234efgh5678ijkl';
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: false,
        error: 'Replay detected: nonce already used',
      });
    });

    it('should reject invalid nonce format - too short', async () => {
      const nonce = 'short';
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: false,
        error: 'Nonce must be at least 16 characters',
      });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should reject invalid nonce format - too long', async () => {
      const nonce = 'a'.repeat(129); // 129 characters
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: false,
        error: 'Nonce too long',
      });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should reject invalid nonce format - invalid characters', async () => {
      const nonce = 'invalid@nonce#with$special%chars';
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: false,
        error: 'Nonce contains invalid characters',
      });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should allow nonce with valid characters (alphanumeric, underscore, dash)', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const nonce = 'valid_nonce-123_ABC';
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: true,
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'sw:nonce:valid_nonce-123_ABC',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should fail open on Redis error', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const nonce = 'abcd1234efgh5678ijkl';
      const result = await service.checkAndMarkNonce(nonce);

      expect(result).toEqual({
        allowed: true, // Fail open
      });
    });
  });

  describe('nonceExists', () => {
    it('should return true when nonce exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const nonce = 'abcd1234efgh5678ijkl';
      const result = await service.nonceExists(nonce);

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('sw:nonce:abcd1234efgh5678ijkl');
    });

    it('should return false when nonce does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const nonce = 'abcd1234efgh5678ijkl';
      const result = await service.nonceExists(nonce);

      expect(result).toBe(false);
    });

    it('should return false for invalid nonce format', async () => {
      const nonce = 'invalid';
      const result = await service.nonceExists(nonce);

      expect(result).toBe(false);
      expect(mockRedis.exists).not.toHaveBeenCalled();
    });

    it('should return false on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const nonce = 'abcd1234efgh5678ijkl';
      const result = await service.nonceExists(nonce);

      expect(result).toBe(false);
    });
  });

  describe('extractNonceFromRequest', () => {
    it('should extract nonce from X-Nonce header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'x-nonce': 'abcd1234efgh5678ijkl',
        },
      });

      const nonce = service.extractNonceFromRequest(request);

      expect(nonce).toBe('abcd1234efgh5678ijkl');
    });

    it('should extract nonce from query parameter', () => {
      const request = new Request('https://example.com?nonce=abcd1234efgh5678ijkl');

      const nonce = service.extractNonceFromRequest(request);

      expect(nonce).toBe('abcd1234efgh5678ijkl');
    });

    it('should prefer header over query parameter', () => {
      const request = new Request('https://example.com?nonce=query_nonce', {
        headers: {
          'x-nonce': 'header_nonce_value',
        },
      });

      const nonce = service.extractNonceFromRequest(request);

      expect(nonce).toBe('header_nonce_value');
    });

    it('should return null when no nonce is present', () => {
      const request = new Request('https://example.com');

      const nonce = service.extractNonceFromRequest(request);

      expect(nonce).toBeNull();
    });

    it('should trim whitespace from nonce', () => {
      const request = new Request('https://example.com', {
        headers: {
          'x-nonce': '  abcd1234efgh5678ijkl  ',
        },
      });

      const nonce = service.extractNonceFromRequest(request);

      expect(nonce).toBe('abcd1234efgh5678ijkl');
    });

    it('should handle malformed URL gracefully', () => {
      // Create a request with invalid URL structure
      const request = {
        url: 'not-a-valid-url',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      } as any;

      const nonce = service.extractNonceFromRequest(request);

      expect(nonce).toBeNull();
    });
  });

  describe('removeNonce', () => {
    it('should remove nonce successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      const nonce = 'abcd1234efgh5678ijkl';
      await service.removeNonce(nonce);

      expect(mockRedis.del).toHaveBeenCalledWith('sw:nonce:abcd1234efgh5678ijkl');
    });

    it('should throw error on Redis failure', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      const nonce = 'abcd1234efgh5678ijkl';

      await expect(service.removeNonce(nonce)).rejects.toThrow('Redis error');
    });
  });

  describe('getNonceTTL', () => {
    it('should return TTL for existing nonce', async () => {
      mockRedis.ttl.mockResolvedValue(250);

      const nonce = 'abcd1234efgh5678ijkl';
      const ttl = await service.getNonceTTL(nonce);

      expect(ttl).toBe(250);
      expect(mockRedis.ttl).toHaveBeenCalledWith('sw:nonce:abcd1234efgh5678ijkl');
    });

    it('should return -1 on Redis error', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('Redis error'));

      const nonce = 'abcd1234efgh5678ijkl';
      const ttl = await service.getNonceTTL(nonce);

      expect(ttl).toBe(-1);
    });
  });
});