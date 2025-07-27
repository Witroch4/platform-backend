/**
 * Redis configuration for tests
 * Fixes port configuration issue (6380 → 6379)
 */

export const testRedisConfig = {
  host: 'localhost',
  port: 6379, // Fixed: was 6380, now 6379
  db: 15, // Use separate DB for tests
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

// Mock Redis connection for tests
export const createMockRedisConnection = () => ({
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  mget: jest.fn().mockResolvedValue([]),
  keys: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue('PONG'),
  info: jest.fn().mockResolvedValue('used_memory_human:10.5M'),
  pipeline: jest.fn().mockReturnValue({
    setex: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  }),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
});

export default testRedisConfig;