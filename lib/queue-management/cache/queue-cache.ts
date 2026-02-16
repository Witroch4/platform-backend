/**
 * Queue Management - Queue Cache
 *
 * Specialized cache for queue-related data
 */

import { getCacheManager, CacheManager } from "./cache-manager";
import { CACHE_KEYS } from "../constants";
import { QueueHealth, QueueConfig } from "../types/queue.types";

export class QueueCache {
	private cache: CacheManager;

	constructor(cacheManager?: CacheManager) {
		this.cache = cacheManager || getCacheManager();
	}

	/**
	 * Cache queue health data
	 */
	async setQueueHealth(queueName: string, health: QueueHealth, ttl?: number): Promise<boolean> {
		const key = CACHE_KEYS.QUEUE_HEALTH(queueName);
		return this.cache.set(key, health, { ttl });
	}

	/**
	 * Get cached queue health data
	 */
	async getQueueHealth(queueName: string): Promise<QueueHealth | null> {
		const key = CACHE_KEYS.QUEUE_HEALTH(queueName);
		return this.cache.get<QueueHealth>(key);
	}

	/**
	 * Cache queue configuration
	 */
	async setQueueConfig(queueName: string, config: QueueConfig, ttl?: number): Promise<boolean> {
		const key = CACHE_KEYS.QUEUE_CONFIG(queueName);
		return this.cache.set(key, config, { ttl });
	}

	/**
	 * Get cached queue configuration
	 */
	async getQueueConfig(queueName: string): Promise<QueueConfig | null> {
		const key = CACHE_KEYS.QUEUE_CONFIG(queueName);
		return this.cache.get<QueueConfig>(key);
	}

	/**
	 * Invalidate queue health cache
	 */
	async invalidateQueueHealth(queueName: string): Promise<boolean> {
		const key = CACHE_KEYS.QUEUE_HEALTH(queueName);
		return this.cache.delete(key);
	}

	/**
	 * Invalidate queue config cache
	 */
	async invalidateQueueConfig(queueName: string): Promise<boolean> {
		const key = CACHE_KEYS.QUEUE_CONFIG(queueName);
		return this.cache.delete(key);
	}

	/**
	 * Invalidate all cache for a queue
	 */
	async invalidateQueue(queueName: string): Promise<number> {
		const pattern = `*${queueName}*`;
		return this.cache.deletePattern(pattern);
	}

	/**
	 * Cache queue list
	 */
	async setQueueList(queues: string[], ttl: number = 60): Promise<boolean> {
		const key = "queue:list";
		return this.cache.set(key, queues, { ttl });
	}

	/**
	 * Get cached queue list
	 */
	async getQueueList(): Promise<string[] | null> {
		const key = "queue:list";
		return this.cache.get<string[]>(key);
	}

	/**
	 * Add queue to active queues set
	 */
	async addActiveQueue(queueName: string): Promise<number> {
		const key = "queue:active";
		return this.cache.addToSet(key, queueName);
	}

	/**
	 * Remove queue from active queues set
	 */
	async removeActiveQueue(queueName: string): Promise<number> {
		const key = "queue:active";
		return this.cache.removeFromSet(key, queueName);
	}

	/**
	 * Get all active queues
	 */
	async getActiveQueues(): Promise<string[]> {
		const key = "queue:active";
		return this.cache.getSetMembers(key);
	}

	/**
	 * Cache queue statistics
	 */
	async setQueueStats(queueName: string, stats: Record<string, number>, ttl: number = 30): Promise<boolean> {
		const key = `queue:stats:${queueName}`;
		return this.cache.set(key, stats, { ttl });
	}

	/**
	 * Get cached queue statistics
	 */
	async getQueueStats(queueName: string): Promise<Record<string, number> | null> {
		const key = `queue:stats:${queueName}`;
		return this.cache.get<Record<string, number>>(key);
	}

	/**
	 * Increment queue counter
	 */
	async incrementQueueCounter(queueName: string, counter: string, by: number = 1): Promise<number> {
		const key = `queue:counter:${queueName}:${counter}`;
		return this.cache.increment(key, by);
	}

	/**
	 * Set queue counter
	 */
	async setQueueCounter(queueName: string, counter: string, value: number, ttl: number = 300): Promise<boolean> {
		const key = `queue:counter:${queueName}:${counter}`;
		return this.cache.set(key, value, { ttl });
	}

	/**
	 * Get queue counter
	 */
	async getQueueCounter(queueName: string, counter: string): Promise<number> {
		const key = `queue:counter:${queueName}:${counter}`;
		const value = await this.cache.get<number>(key);
		return value || 0;
	}

	/**
	 * Cache queue job IDs by state
	 */
	async setQueueJobIds(queueName: string, state: string, jobIds: string[], ttl: number = 60): Promise<boolean> {
		const key = `queue:jobs:${queueName}:${state}`;
		return this.cache.set(key, jobIds, { ttl });
	}

	/**
	 * Get cached queue job IDs by state
	 */
	async getQueueJobIds(queueName: string, state: string): Promise<string[] | null> {
		const key = `queue:jobs:${queueName}:${state}`;
		return this.cache.get<string[]>(key);
	}

	/**
	 * Cache queue processing rate
	 */
	async setQueueProcessingRate(queueName: string, rate: number, ttl: number = 60): Promise<boolean> {
		const key = `queue:rate:${queueName}`;
		return this.cache.set(key, rate, { ttl });
	}

	/**
	 * Get cached queue processing rate
	 */
	async getQueueProcessingRate(queueName: string): Promise<number | null> {
		const key = `queue:rate:${queueName}`;
		return this.cache.get<number>(key);
	}

	/**
	 * Add to queue processing history (for rate calculation)
	 */
	async addToProcessingHistory(queueName: string, timestamp: number, count: number): Promise<number> {
		const key = `queue:history:${queueName}`;
		return this.cache.addToSortedSet(key, timestamp, count.toString());
	}

	/**
	 * Get queue processing history
	 */
	async getProcessingHistory(queueName: string, since: number): Promise<Array<{ timestamp: number; count: number }>> {
		const key = `queue:history:${queueName}`;
		const results = await this.cache.getSortedSetRange(key, 0, -1, true);

		const history: Array<{ timestamp: number; count: number }> = [];
		for (let i = 0; i < results.length; i += 2) {
			const count = parseInt(results[i]);
			const timestamp = parseInt(results[i + 1]);

			if (timestamp >= since) {
				history.push({ timestamp, count });
			}
		}

		return history;
	}

	/**
	 * Set queue pause state
	 */
	async setQueuePaused(queueName: string, paused: boolean, ttl: number = 3600): Promise<boolean> {
		const key = `queue:paused:${queueName}`;
		return this.cache.set(key, paused, { ttl });
	}

	/**
	 * Check if queue is paused
	 */
	async isQueuePaused(queueName: string): Promise<boolean> {
		const key = `queue:paused:${queueName}`;
		const paused = await this.cache.get<boolean>(key);
		return paused || false;
	}

	/**
	 * Cache queue error information
	 */
	async setQueueError(
		queueName: string,
		error: { message: string; timestamp: number; count: number },
		ttl: number = 300,
	): Promise<boolean> {
		const key = `queue:error:${queueName}`;
		return this.cache.set(key, error, { ttl });
	}

	/**
	 * Get cached queue error information
	 */
	async getQueueError(queueName: string): Promise<{ message: string; timestamp: number; count: number } | null> {
		const key = `queue:error:${queueName}`;
		return this.cache.get<{ message: string; timestamp: number; count: number }>(key);
	}

	/**
	 * Increment queue error count
	 */
	async incrementQueueErrorCount(queueName: string): Promise<number> {
		const key = `queue:error:count:${queueName}`;
		return this.cache.increment(key);
	}

	/**
	 * Reset queue error count
	 */
	async resetQueueErrorCount(queueName: string): Promise<boolean> {
		const key = `queue:error:count:${queueName}`;
		return this.cache.delete(key);
	}

	/**
	 * Get queue error count
	 */
	async getQueueErrorCount(queueName: string): Promise<number> {
		const key = `queue:error:count:${queueName}`;
		const count = await this.cache.get<number>(key);
		return count || 0;
	}

	/**
	 * Cache queue worker information
	 */
	async setQueueWorkers(
		queueName: string,
		workers: Array<{ id: string; status: string; lastSeen: number }>,
		ttl: number = 60,
	): Promise<boolean> {
		const key = `queue:workers:${queueName}`;
		return this.cache.set(key, workers, { ttl });
	}

	/**
	 * Get cached queue worker information
	 */
	async getQueueWorkers(queueName: string): Promise<Array<{ id: string; status: string; lastSeen: number }> | null> {
		const key = `queue:workers:${queueName}`;
		return this.cache.get<Array<{ id: string; status: string; lastSeen: number }>>(key);
	}

	/**
	 * Invalidate all queue-related cache
	 */
	async invalidateAllQueueCache(): Promise<number> {
		return this.cache.deletePattern("queue:*");
	}
}

// Singleton instance
let queueCache: QueueCache | null = null;

/**
 * Get queue cache instance
 */
export function getQueueCache(): QueueCache {
	if (!queueCache) {
		queueCache = new QueueCache();
	}
	return queueCache;
}

/**
 * Set queue cache instance (useful for testing)
 */
export function setQueueCache(cache: QueueCache): void {
	queueCache = cache;
}

export default getQueueCache;
