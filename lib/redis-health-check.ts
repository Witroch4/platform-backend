/**
 * Redis Health Check Utility
 * Monitors Redis connection health and provides recovery mechanisms
 */

import { getRedisInstance } from './connections';

interface RedisHealthStatus {
  healthy: boolean;
  latency?: number;
  error?: string;
  timestamp: string;
  connectionStatus: string;
}

class RedisHealthChecker {
  private static instance: RedisHealthChecker;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck?: RedisHealthStatus;

  private constructor() {}

  static getInstance(): RedisHealthChecker {
    if (!RedisHealthChecker.instance) {
      RedisHealthChecker.instance = new RedisHealthChecker();
    }
    return RedisHealthChecker.instance;
  }

  /**
   * Perform a health check on Redis connection
   */
  async checkHealth(): Promise<RedisHealthStatus> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      const redis = getRedisInstance();
      
      // Check connection status
      const connectionStatus = redis.status;
      
      if (connectionStatus !== 'ready') {
        return {
          healthy: false,
          error: `Redis not ready, status: ${connectionStatus}`,
          timestamp,
          connectionStatus,
        };
      }

      // Perform a simple ping to measure latency
      await redis.ping();
      const latency = Date.now() - startTime;

      const healthStatus: RedisHealthStatus = {
        healthy: true,
        latency,
        timestamp,
        connectionStatus,
      };

      this.lastHealthCheck = healthStatus;
      return healthStatus;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const healthStatus: RedisHealthStatus = {
        healthy: false,
        error: errorMessage,
        timestamp,
        connectionStatus: 'error',
      };

      this.lastHealthCheck = healthStatus;
      
      console.error('[Redis Health] Health check failed:', {
        error: errorMessage,
        timestamp,
        latency: Date.now() - startTime,
      });

      return healthStatus;
    }
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    console.log(`[Redis Health] Starting health monitoring (interval: ${intervalMs}ms)`);

    this.healthCheckInterval = setInterval(async () => {
      const health = await this.checkHealth();
      
      if (!health.healthy) {
        console.warn('[Redis Health] Redis unhealthy:', {
          error: health.error,
          connectionStatus: health.connectionStatus,
          timestamp: health.timestamp,
        });
      } else if (health.latency && health.latency > 1000) {
        console.warn('[Redis Health] High Redis latency:', {
          latency: `${health.latency}ms`,
          timestamp: health.timestamp,
        });
      }
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      console.log('[Redis Health] Health monitoring stopped');
    }
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): RedisHealthStatus | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Attempt to recover Redis connection
   */
  async attemptRecovery(): Promise<boolean> {
    try {
      console.log('[Redis Health] Attempting Redis connection recovery...');
      
      const redis = getRedisInstance();
      
      // Try to disconnect and reconnect
      if (redis.status === 'ready' || redis.status === 'connecting') {
        await redis.disconnect();
      }
      
      // Wait a bit before reconnecting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect
      await redis.connect();
      
      // Verify connection
      const health = await this.checkHealth();
      
      if (health.healthy) {
        console.log('[Redis Health] ✅ Redis connection recovered successfully');
        return true;
      } else {
        console.error('[Redis Health] ❌ Redis recovery failed:', health.error);
        return false;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Redis Health] ❌ Redis recovery attempt failed:', errorMessage);
      return false;
    }
  }
}

// Export singleton instance
export const redisHealthChecker = RedisHealthChecker.getInstance();

// Export utility functions
export async function checkRedisHealth(): Promise<RedisHealthStatus> {
  return redisHealthChecker.checkHealth();
}

export function startRedisHealthMonitoring(intervalMs?: number): void {
  redisHealthChecker.startMonitoring(intervalMs);
}

export function stopRedisHealthMonitoring(): void {
  redisHealthChecker.stopMonitoring();
}

export async function recoverRedisConnection(): Promise<boolean> {
  return redisHealthChecker.attemptRecovery();
}