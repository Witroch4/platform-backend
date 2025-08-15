import { createCostQueue, checkCostQueueHealth, COST_QUEUE_NAME } from '../queue-config';

// Mock Redis connection
jest.mock('@/lib/redis', () => ({
  getRedisConnection: jest.fn(() => ({
    host: 'localhost',
    port: 6379,
  }))
}));

describe('Cost Queue Configuration', () => {
  it('should create cost queue with correct name', () => {
    const queue = createCostQueue();
    expect(queue.name).toBe(COST_QUEUE_NAME);
  });

  it('should have correct queue name constant', () => {
    expect(COST_QUEUE_NAME).toBe('cost-events');
  });

  it('should handle health check gracefully', async () => {
    // Mock queue methods
    const mockQueue = {
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      getDelayed: jest.fn().mockResolvedValue([]),
    };

    // Mock createCostQueue to return our mock
    jest.doMock('../queue-config', () => ({
      ...jest.requireActual('../queue-config'),
      createCostQueue: () => mockQueue,
    }));

    const health = await checkCostQueueHealth();
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('details');
  });
});