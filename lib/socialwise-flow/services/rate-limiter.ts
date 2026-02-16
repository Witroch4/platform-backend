/**
 * SocialWise Flow Rate Limiting Service
 * Based on requirements 4.2, 4.5
 */

import { getRedisInstance } from "@/lib/connections";
import { RateLimiterService, RateLimitResult, parseRateLimitConfig } from "@/lib/ai-integration/services/rate-limiter";
import { SocialWiseFlowPayloadType, type SocialWiseChatwitData } from "../schemas/payload";

export interface SocialWiseRateLimitContext {
	accountId: string;
	inboxId: string;
	sessionId: string;
	clientIp?: string;
	userAgent?: string;
}

export class SocialWiseRateLimiterService {
	private readonly rateLimiter: RateLimiterService;
	private readonly redis: any;

	constructor() {
		const redis = getRedisInstance();
		const config = parseRateLimitConfig();
		this.rateLimiter = new RateLimiterService(redis, config);
		this.redis = redis;
	}

	/**
	 * Extract rate limiting context from SocialWise payload
	 */
	extractRateLimitContext(payload: SocialWiseFlowPayloadType, request: Request): SocialWiseRateLimitContext {
		const context = payload.context["socialwise-chatwit"] as SocialWiseChatwitData | undefined;

		// Convert IDs to strings for consistency with fallbacks
		const accountId = String(context?.account_data?.id || payload.context.inbox?.account_id || 0);
		const inboxId = String(context?.inbox_data?.id || payload.context.inbox?.id || 0);
		const sessionId = payload.session_id;

		// Extract client IP from headers
		const clientIp =
			request.headers.get("x-forwarded-for") ||
			request.headers.get("x-real-ip") ||
			request.headers.get("cf-connecting-ip") ||
			"unknown";

		const userAgent = request.headers.get("user-agent") || "unknown";

		return {
			accountId,
			inboxId,
			sessionId,
			clientIp,
			userAgent,
		};
	}

	/**
	 * Check rate limits for SocialWise flow with enhanced scoping
	 */
	async checkSocialWiseRateLimit(context: SocialWiseRateLimitContext): Promise<RateLimitResult> {
		// Use session as conversation identifier for SocialWise
		const conversationId = context.sessionId;
		const accountId = context.accountId;
		const contactId = `${context.inboxId}:${context.sessionId}`; // Composite contact ID
		const clientIp = context.clientIp;

		return this.rateLimiter.checkRateLimit(conversationId, accountId, contactId, clientIp);
	}

	/**
	 * Check rate limits for SocialWise payload automatically
	 */
	async checkPayloadRateLimit(payload: SocialWiseFlowPayloadType, request: Request): Promise<RateLimitResult> {
		const context = this.extractRateLimitContext(payload, request);
		return this.checkSocialWiseRateLimit(context);
	}

	/**
	 * Enhanced rate limiting with SocialWise-specific scopes
	 */
	async checkEnhancedRateLimit(context: SocialWiseRateLimitContext): Promise<RateLimitResult> {
		const config = SocialWiseRateLimiterService.getSocialWiseRateLimitConfig();

		// Check inbox-specific rate limit first (most restrictive for SocialWise)
		const inboxResult = await this.checkCustomScopeLimit("inbox", `inbox:${context.inboxId}`, config.inbox);
		if (!inboxResult.allowed) {
			return inboxResult;
		}

		// Check session rate limit
		const sessionResult = await this.checkCustomScopeLimit("session", `session:${context.sessionId}`, config.session);
		if (!sessionResult.allowed) {
			return sessionResult;
		}

		// Check account rate limit using composed service
		const accountResult = await this.rateLimiter.checkRateLimit(
			context.sessionId, // Use session as conversation ID
			context.accountId,
			`${context.inboxId}:${context.sessionId}`, // Composite contact ID
			context.clientIp,
		);
		if (!accountResult.allowed) {
			return accountResult;
		}

		// All checks passed
		return sessionResult; // Return the most restrictive successful check
	}

	/**
	 * Custom scope limit check for SocialWise-specific scopes
	 */
	private async checkCustomScopeLimit(
		scope: string,
		identifier: string,
		config: { limit: number; window: number },
	): Promise<RateLimitResult> {
		try {
			const key = `sw-rl:${scope}:${identifier}`;
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
				scope: scope as any, // Cast to satisfy the interface
				limit: config.limit,
				remaining,
				resetTime,
			};
		} catch (error) {
			console.error(`Rate limit check failed for scope ${scope}:`, error);

			// Fail open - allow request if Redis is down
			return {
				allowed: true,
				scope: scope as any,
				limit: config.limit,
				remaining: config.limit - 1,
				resetTime: Date.now() + config.window * 1000,
			};
		}
	}

	/**
	 * Get current rate limit status for SocialWise context
	 */
	async getSocialWiseRateLimitStatus(context: SocialWiseRateLimitContext): Promise<{
		inbox: Omit<RateLimitResult, "allowed">;
		session: Omit<RateLimitResult, "allowed">;
		account: Omit<RateLimitResult, "allowed">;
	}> {
		const config = SocialWiseRateLimiterService.getSocialWiseRateLimitConfig();

		const [inboxStatus, sessionStatus, accountStatus] = await Promise.all([
			this.getCustomScopeStatus("inbox", `inbox:${context.inboxId}`, config.inbox),
			this.getCustomScopeStatus("session", `session:${context.sessionId}`, config.session),
			this.rateLimiter.getRateLimitStatus("account", context.accountId, config.account),
		]);

		return {
			inbox: inboxStatus,
			session: sessionStatus,
			account: accountStatus,
		};
	}

	/**
	 * Get current rate limit status for custom scopes
	 */
	private async getCustomScopeStatus(
		scope: string,
		identifier: string,
		config: { limit: number; window: number },
	): Promise<Omit<RateLimitResult, "allowed">> {
		try {
			const key = `sw-rl:${scope}:${identifier}`;
			const now = Date.now();
			const windowStart = now - config.window * 1000;

			// Clean up expired entries and count current
			await this.redis.zremrangebyscore(key, "-inf", windowStart);
			const currentCount = await this.redis.zcard(key);

			const remaining = Math.max(0, config.limit - currentCount);
			const resetTime = now + config.window * 1000;

			return {
				scope: scope as any,
				limit: config.limit,
				remaining,
				resetTime,
			};
		} catch (error) {
			console.error(`Rate limit status check failed for scope ${scope}:`, error);

			return {
				scope: scope as any,
				limit: config.limit,
				remaining: config.limit,
				resetTime: Date.now() + config.window * 1000,
			};
		}
	}

	/**
	 * Reset rate limits for SocialWise context
	 */
	async resetSocialWiseRateLimits(context: SocialWiseRateLimitContext): Promise<void> {
		try {
			const keys = [`sw-rl:inbox:inbox:${context.inboxId}`, `sw-rl:session:session:${context.sessionId}`];

			await Promise.all(keys.map((key) => this.redis.del(key)));

			// Also reset composed service rate limits
			await Promise.all([
				this.rateLimiter.resetRateLimit("conversation", context.sessionId),
				this.rateLimiter.resetRateLimit("account", context.accountId),
				this.rateLimiter.resetRateLimit("contact", `${context.inboxId}:${context.sessionId}`),
				context.clientIp && context.clientIp !== "unknown"
					? this.rateLimiter.resetRateLimit("ip", context.clientIp)
					: Promise.resolve(),
			]);
		} catch (error) {
			console.error("Failed to reset SocialWise rate limits:", error);
			throw error;
		}
	}

	/**
	 * Get rate limit configuration for SocialWise
	 */
	static getSocialWiseRateLimitConfig() {
		return {
			inbox: {
				limit: parseInt(process.env.SW_RL_INBOX_LIMIT || "20", 10),
				window: parseInt(process.env.SW_RL_INBOX_WINDOW || "60", 10),
			},
			session: {
				limit: parseInt(process.env.SW_RL_SESSION_LIMIT || "10", 10),
				window: parseInt(process.env.SW_RL_SESSION_WINDOW || "60", 10),
			},
			account: {
				limit: parseInt(process.env.SW_RL_ACCOUNT_LIMIT || "100", 10),
				window: parseInt(process.env.SW_RL_ACCOUNT_WINDOW || "60", 10),
			},
			ip: {
				limit: parseInt(process.env.SW_RL_IP_LIMIT || "200", 10),
				window: parseInt(process.env.SW_RL_IP_WINDOW || "60", 10),
			},
		};
	}
}
