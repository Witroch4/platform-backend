/**
 * Redis Configuration for Tests
 */

export const testRedisConfig = {
  host: 'localhost',
  port: 6380, // Porta diferente para testes
  db: 15,     // Database diferente para testes
  password: undefined,
  maxRetriesPerRequest: 3,
  lazyConnect: true,  // Changed to true
  connectTimeout: 5000,
  enableOfflineQueue: true, // Changed to true
  enableReadyCheck: true,
};

export function createMockRedisConnection() {
  // Para testes que não precisam de Redis real
  return {
    host: testRedisConfig.host,
    port: testRedisConfig.port,
    password: testRedisConfig.password,
    db: testRedisConfig.db,
  };
}

export function isRedisAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Import the real IORedis, not the mock
      const Redis = require('ioredis');
      const redis = new Redis(testRedisConfig);
      
      redis.ping()
        .then(() => {
          redis.disconnect();
          resolve(true);
        })
        .catch(() => {
          redis.disconnect();
          resolve(false);
        });
    } catch (error) {
      resolve(false);
    }
  });
}