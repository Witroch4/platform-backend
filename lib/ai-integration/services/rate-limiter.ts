/**
 * Rate Limiting Service
 * Based on requirements 2.3, 2.4, 15.4
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { RateLimitConfig, RateLimitScope } from "../types/webhook";

export interface RateLimitResult {
	allowed: boolean;
	scope: "conversation" | "account" | "contact" | "ip";
	limit: number;
	remaining: number;
	resetTime: number;
}

export class RateLimiterService {
	private readonly redis: Redis;
	private readonly config: RateLimitConfig;

	constructor(redis: Redis, config: RateLimitConfig) {
		this.redis = redis;
		this.config = config;
	}

	/**
	 * Check rate limits for all scopes
	 * Returns the first scope that is rate limited
	 */
	async checkRateLimit(
		conversationId: string,
		accountId: string,
		contactId: string,
		clientIp?: string,
	): Promise<RateLimitResult> {
		// Check conversation rate limit first (most restrictive)
		const conversationResult = await this.checkScopeLimit("conversation", conversationId, this.config.conversation);
		if (!conversationResult.allowed) {
			return conversationResult;
		}

		// Check contact rate limit
		const contactResult = await this.checkScopeLimit("contact", contactId, this.config.contact);
		if (!contactResult.allowed) {
			return contactResult;
		}

		// Check account rate limit
		const accountResult = await this.checkScopeLimit("account", accountId, this.config.account);
		if (!accountResult.allowed) {
			return accountResult;
		}

		// Check IP rate limit if provided (60 req/10s)
		if (clientIp) {
			const ipResult = await this.checkScopeLimit("ip", clientIp, { limit: 60, window: 10 });
			if (!ipResult.allowed) {
				return ipResult;
			}
		}

		// All checks passed
		return conversationResult; // Return the most restrictive successful check
	}

	/**
	 * Check rate limit for a specific scope using sliding window
	 */
	private async checkScopeLimit(
		scope: "conversation" | "account" | "contact" | "ip",
		identifier: string,
		config: { limit: number; window: number },
	): Promise<RateLimitResult> {
		try {
			const key = `rl:${scope}:${identifier}`;
			const now = Date.now();
			const windowStart = now - config.window * 1000;

			// Use Redis pipeline for atomic operations
			const pipeline = this.redis.pipeline();

			// Remove expired entries
			pipeline.zremrangebyscore(key, "-inf", windowStart);

			// Count current entries
			pipeline.zcard(key);

			// Add current request
			pipeline.zadd(key, now, `${now}-${Math.random()}`);

			// Set expiry
			pipeline.expire(key, config.window);

			const results = await pipeline.exec();

			if (!results) {
				throw new Error("Pipeline execution failed");
			}

			const currentCount = (results[1][1] as number) || 0;
			const allowed = currentCount < config.limit;
			const remaining = Math.max(0, config.limit - currentCount - 1);
			const resetTime = now + config.window * 1000;

			return {
				allowed,
				scope,
				limit: config.limit,
				remaining,
				resetTime,
			};
		} catch (error) {
			console.error(`Rate limit check failed for scope ${scope}:`, error);

			// Fail open - allow request if Redis is down
			return {
				allowed: true,
				scope,
				limit: config.limit,
				remaining: config.limit - 1,
				resetTime: Date.now() + config.window * 1000,
			};
		}
	}

	/**
	 * Get current rate limit status without incrementing
	 */
	async getRateLimitStatus(
		scope: "conversation" | "account" | "contact" | "ip",
		identifier: string,
		config: { limit: number; window: number },
	): Promise<Omit<RateLimitResult, "allowed">> {
		try {
			const key = `rl:${scope}:${identifier}`;
			const now = Date.now();
			const windowStart = now - config.window * 1000;

			// Clean up expired entries and count current
			await this.redis.zremrangebyscore(key, "-inf", windowStart);
			const currentCount = await this.redis.zcard(key);

			const remaining = Math.max(0, config.limit - currentCount);
			const resetTime = now + config.window * 1000;

			return {
				scope,
				limit: config.limit,
				remaining,
				resetTime,
			};
		} catch (error) {
			console.error(`Rate limit status check failed for scope ${scope}:`, error);

			return {
				scope,
				limit: config.limit,
				remaining: config.limit,
				resetTime: Date.now() + config.window * 1000,
			};
		}
	}

	/**
	 * Reset rate limit for a specific scope and identifier
	 */
	async resetRateLimit(scope: "conversation" | "account" | "contact" | "ip", identifier: string): Promise<void> {
		try {
			const key = `rl:${scope}:${identifier}`;
			await this.redis.del(key);
		} catch (error) {
			console.error(`Failed to reset rate limit for scope ${scope}:`, error);
			throw error;
		}
	}
}

/**
 * Parse rate limit configuration from environment variables
 * Format: "limit/window" (e.g., "8/10s", "80/10s")
 */
export function parseRateLimitConfig(): RateLimitConfig {
	const parseRateLimit = (envVar: string, defaultValue: string): { limit: number; window: number } => {
		const value = process.env[envVar] || defaultValue;
		const match = value.match(/^(\d+)\/(\d+)s?$/);

		if (!match) {
			throw new Error(
				`Invalid rate limit format for ${envVar}: ${value}. Expected format: "limit/window" (e.g., "8/10s")`,
			);
		}

		return {
			limit: parseInt(match[1], 10),
			window: parseInt(match[2], 10),
		};
	};

	return {
		conversation: parseRateLimit("RL_CONV", "8/10"),
		account: parseRateLimit("RL_ACC", "80/10"),
		contact: parseRateLimit("RL_CONTACT", "15/10"),
	};
}
