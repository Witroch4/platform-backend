/**
 * Redis Connection Wrapper with Timeout Handling
 * Provides resilient Redis operations with automatic retry and timeout management
 */

import { getRedisInstance } from "./connections";
import { recoverRedisConnection } from "./redis-health-check";

interface RedisOperationOptions {
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

class RedisWrapper {
	private static instance: RedisWrapper;
	private redis: any;

	private constructor() {
		this.redis = getRedisInstance();
	}

	static getInstance(): RedisWrapper {
		if (!RedisWrapper.instance) {
			RedisWrapper.instance = new RedisWrapper();
		}
		return RedisWrapper.instance;
	}

	/**
	 * Execute Redis command with timeout and retry logic
	 */
	async executeWithRetry<T>(operation: () => Promise<T>, options: RedisOperationOptions = {}): Promise<T> {
		const {
			timeout = 45000, // 45s default timeout (mais generoso)
			retries = 3, // Mais tentativas
			retryDelay = 2000, // Delay maior entre tentativas
		} = options;

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				// Create timeout promise
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error(`Redis operation timed out after ${timeout}ms`));
					}, timeout);
				});

				// Race between operation and timeout
				const result = await Promise.race([operation(), timeoutPromise]);

				// If we get here, operation succeeded
				if (attempt > 0) {
					console.log(`[Redis Wrapper] ✅ Operation succeeded on attempt ${attempt + 1}`);
				}

				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				console.warn(`[Redis Wrapper] ⚠️ Operation failed on attempt ${attempt + 1}:`, {
					error: lastError.message,
					attempt: attempt + 1,
					maxRetries: retries + 1,
				});

				// If this is the last attempt, don't retry
				if (attempt === retries) {
					break;
				}

				// Check if it's a timeout or connection error
				if (
					lastError.message.includes("timed out") ||
					lastError.message.includes("Connection is closed") ||
					lastError.message.includes("ECONNRESET")
				) {
					console.log(`[Redis Wrapper] 🔄 Attempting Redis recovery before retry ${attempt + 2}`);

					try {
						await recoverRedisConnection();
						this.redis = getRedisInstance(); // Get fresh instance
					} catch (recoveryError) {
						console.error("[Redis Wrapper] ❌ Recovery failed:", recoveryError);
					}
				}

				// Wait before retrying
				if (attempt < retries) {
					await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
				}
			}
		}

		// All attempts failed
		console.error(`[Redis Wrapper] ❌ All ${retries + 1} attempts failed:`, lastError?.message);
		throw lastError || new Error("Redis operation failed after all retries");
	}

	/**
	 * Get Redis instance with connection validation
	 */
	async getValidatedRedis(): Promise<any> {
		try {
			// Check if current instance is ready
			if (this.redis.status === "ready") {
				return this.redis;
			}

			// If not ready, try to get a fresh instance
			console.log(`[Redis Wrapper] Redis not ready (status: ${this.redis.status}), getting fresh instance`);
			this.redis = getRedisInstance();

			// Wait for it to be ready (with timeout)
			const readyPromise = new Promise<void>((resolve, reject) => {
				if (this.redis.status === "ready") {
					resolve();
					return;
				}

				const timeout = setTimeout(() => {
					reject(new Error("Redis ready timeout"));
				}, 10000);

				this.redis.once("ready", () => {
					clearTimeout(timeout);
					resolve();
				});

				this.redis.once("error", (error: Error) => {
					clearTimeout(timeout);
					reject(error);
				});
			});

			await readyPromise;
			return this.redis;
		} catch (error) {
			console.error("[Redis Wrapper] ❌ Failed to get validated Redis instance:", error);
			throw error;
		}
	}

	/**
	 * Ping Redis with retry logic
	 */
	async ping(options?: RedisOperationOptions): Promise<string> {
		return this.executeWithRetry(async () => {
			const redis = await this.getValidatedRedis();
			return redis.ping();
		}, options);
	}

	/**
	 * Set key with retry logic
	 */
	async set(key: string, value: string, options?: RedisOperationOptions): Promise<string> {
		return this.executeWithRetry(async () => {
			const redis = await this.getValidatedRedis();
			return redis.set(key, value);
		}, options);
	}

	/**
	 * Get key with retry logic
	 */
	async get(key: string, options?: RedisOperationOptions): Promise<string | null> {
		return this.executeWithRetry(async () => {
			const redis = await this.getValidatedRedis();
			return redis.get(key);
		}, options);
	}

	/**
	 * Delete key with retry logic
	 */
	async del(key: string, options?: RedisOperationOptions): Promise<number> {
		return this.executeWithRetry(async () => {
			const redis = await this.getValidatedRedis();
			return redis.del(key);
		}, options);
	}

	/**
	 * Execute any Redis command with retry logic
	 */
	async command(commandName: string, ...args: any[]): Promise<any> {
		return this.executeWithRetry(async () => {
			const redis = await this.getValidatedRedis();
			return redis[commandName](...args);
		});
	}
}

// Export singleton instance
export const redisWrapper = RedisWrapper.getInstance();

// Export utility functions for common operations
export async function redisPing(options?: RedisOperationOptions): Promise<string> {
	return redisWrapper.ping(options);
}

export async function redisSet(key: string, value: string, options?: RedisOperationOptions): Promise<string> {
	return redisWrapper.set(key, value, options);
}

export async function redisGet(key: string, options?: RedisOperationOptions): Promise<string | null> {
	return redisWrapper.get(key, options);
}

export async function redisDel(key: string, options?: RedisOperationOptions): Promise<number> {
	return redisWrapper.del(key, options);
}

export async function redisCommand(commandName: string, ...args: any[]): Promise<any> {
	return redisWrapper.command(commandName, ...args);
}
