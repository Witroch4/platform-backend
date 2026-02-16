/**
 * Queue Management - User Cache
 *
 * Specialized cache for user sessions and permissions
 */

import { getCacheManager, CacheManager } from "./cache-manager";
import { CACHE_KEYS } from "../constants";
import { User } from "../types/user.types";

export interface UserSession {
	userId: string;
	email: string;
	name: string;
	role: string;
	permissions: string[];
	queueAccess: Record<string, string[]>;
	lastActivity: Date;
	expiresAt: Date;
}

export interface UserPermissions {
	userId: string;
	permissions: string[];
	queueAccess: Record<string, string[]>;
	role: string;
	lastUpdated: Date;
}

export class UserCache {
	private cache: CacheManager;

	constructor(cacheManager?: CacheManager) {
		this.cache = cacheManager || getCacheManager();
	}

	/**
	 * Cache user session
	 */
	async setUserSession(userId: string, session: UserSession, ttl?: number): Promise<boolean> {
		const key = CACHE_KEYS.USER_SESSION(userId);
		return this.cache.set(key, session, { ttl });
	}

	/**
	 * Get cached user session
	 */
	async getUserSession(userId: string): Promise<UserSession | null> {
		const key = CACHE_KEYS.USER_SESSION(userId);
		return this.cache.get<UserSession>(key);
	}

	/**
	 * Update user session activity
	 */
	async updateUserActivity(userId: string): Promise<boolean> {
		const session = await this.getUserSession(userId);
		if (!session) return false;

		session.lastActivity = new Date();
		return this.setUserSession(userId, session);
	}

	/**
	 * Cache user permissions
	 */
	async setUserPermissions(userId: string, permissions: UserPermissions, ttl: number = 1800): Promise<boolean> {
		const key = CACHE_KEYS.USER_PERMISSIONS(userId);
		return this.cache.set(key, permissions, { ttl });
	}

	/**
	 * Get cached user permissions
	 */
	async getUserPermissions(userId: string): Promise<UserPermissions | null> {
		const key = CACHE_KEYS.USER_PERMISSIONS(userId);
		return this.cache.get<UserPermissions>(key);
	}

	/**
	 * Check if user has permission
	 */
	async hasPermission(userId: string, permission: string, queueName?: string): Promise<boolean> {
		const permissions = await this.getUserPermissions(userId);
		if (!permissions) return false;

		// Check global permissions
		if (permissions.permissions.includes(permission)) {
			return true;
		}

		// Check queue-specific permissions
		if (queueName && permissions.queueAccess[queueName]?.includes(permission)) {
			return true;
		}

		return false;
	}

	/**
	 * Get user's accessible queues
	 */
	async getUserAccessibleQueues(userId: string): Promise<string[]> {
		const permissions = await this.getUserPermissions(userId);
		if (!permissions) return [];

		return Object.keys(permissions.queueAccess);
	}

	/**
	 * Cache user profile
	 */
	async setUserProfile(userId: string, profile: Partial<User>, ttl: number = 3600): Promise<boolean> {
		const key = `user:profile:${userId}`;
		return this.cache.set(key, profile, { ttl });
	}

	/**
	 * Get cached user profile
	 */
	async getUserProfile(userId: string): Promise<Partial<User> | null> {
		const key = `user:profile:${userId}`;
		return this.cache.get<Partial<User>>(key);
	}

	/**
	 * Cache user preferences
	 */
	async setUserPreferences(userId: string, preferences: Record<string, any>, ttl: number = 86400): Promise<boolean> {
		const key = `user:preferences:${userId}`;
		return this.cache.set(key, preferences, { ttl });
	}

	/**
	 * Get cached user preferences
	 */
	async getUserPreferences(userId: string): Promise<Record<string, any> | null> {
		const key = `user:preferences:${userId}`;
		return this.cache.get<Record<string, any>>(key);
	}

	/**
	 * Set user preference
	 */
	async setUserPreference(userId: string, key: string, value: any): Promise<boolean> {
		const preferences = (await this.getUserPreferences(userId)) || {};
		preferences[key] = value;
		return this.setUserPreferences(userId, preferences);
	}

	/**
	 * Get user preference
	 */
	async getUserPreference(userId: string, key: string, defaultValue?: any): Promise<any> {
		const preferences = await this.getUserPreferences(userId);
		return preferences?.[key] ?? defaultValue;
	}

	/**
	 * Add user to active users set
	 */
	async addActiveUser(userId: string): Promise<number> {
		const key = "users:active";
		return this.cache.addToSet(key, userId);
	}

	/**
	 * Remove user from active users set
	 */
	async removeActiveUser(userId: string): Promise<number> {
		const key = "users:active";
		return this.cache.removeFromSet(key, userId);
	}

	/**
	 * Get all active users
	 */
	async getActiveUsers(): Promise<string[]> {
		const key = "users:active";
		return this.cache.getSetMembers(key);
	}

	/**
	 * Cache user login attempt
	 */
	async recordLoginAttempt(userId: string, success: boolean, ip?: string): Promise<number> {
		const key = `user:login:${userId}`;
		const attempt = {
			success,
			timestamp: Date.now(),
			ip,
		};

		return this.cache.pushToList(key, JSON.stringify(attempt));
	}

	/**
	 * Get user login attempts
	 */
	async getLoginAttempts(
		userId: string,
		limit: number = 10,
	): Promise<Array<{ success: boolean; timestamp: number; ip?: string }>> {
		const key = `user:login:${userId}`;
		const attempts = await this.cache.getListRange(key, 0, limit - 1);

		return attempts.map((attempt) => {
			try {
				return JSON.parse(attempt);
			} catch {
				return { success: false, timestamp: 0 };
			}
		});
	}

	/**
	 * Cache user rate limit
	 */
	async setUserRateLimit(userId: string, endpoint: string, count: number, windowMs: number): Promise<boolean> {
		const window = Math.floor(Date.now() / windowMs);
		const key = CACHE_KEYS.RATE_LIMIT(`user:${userId}:${endpoint}`, window);
		const ttl = Math.ceil(windowMs / 1000);

		return this.cache.set(key, count, { ttl });
	}

	/**
	 * Get user rate limit
	 */
	async getUserRateLimit(userId: string, endpoint: string, windowMs: number): Promise<number> {
		const window = Math.floor(Date.now() / windowMs);
		const key = CACHE_KEYS.RATE_LIMIT(`user:${userId}:${endpoint}`, window);
		const count = await this.cache.get<number>(key);

		return count || 0;
	}

	/**
	 * Increment user rate limit
	 */
	async incrementUserRateLimit(userId: string, endpoint: string, windowMs: number): Promise<number> {
		const window = Math.floor(Date.now() / windowMs);
		const key = CACHE_KEYS.RATE_LIMIT(`user:${userId}:${endpoint}`, window);
		const count = await this.cache.increment(key);

		// Set expiration if this is the first increment
		if (count === 1) {
			const ttl = Math.ceil(windowMs / 1000);
			await this.cache.expire(key, ttl);
		}

		return count;
	}

	/**
	 * Cache user dashboard layout
	 */
	async setUserDashboardLayout(userId: string, layout: Record<string, any>, ttl: number = 86400): Promise<boolean> {
		const key = `user:dashboard:${userId}`;
		return this.cache.set(key, layout, { ttl });
	}

	/**
	 * Get cached user dashboard layout
	 */
	async getUserDashboardLayout(userId: string): Promise<Record<string, any> | null> {
		const key = `user:dashboard:${userId}`;
		return this.cache.get<Record<string, any>>(key);
	}

	/**
	 * Cache user notification settings
	 */
	async setUserNotificationSettings(
		userId: string,
		settings: Record<string, any>,
		ttl: number = 86400,
	): Promise<boolean> {
		const key = `user:notifications:${userId}`;
		return this.cache.set(key, settings, { ttl });
	}

	/**
	 * Get cached user notification settings
	 */
	async getUserNotificationSettings(userId: string): Promise<Record<string, any> | null> {
		const key = `user:notifications:${userId}`;
		return this.cache.get<Record<string, any>>(key);
	}

	/**
	 * Cache user recent activity
	 */
	async addUserActivity(
		userId: string,
		activity: { action: string; resource: string; timestamp: number },
	): Promise<number> {
		const key = `user:activity:${userId}`;
		return this.cache.pushToList(key, JSON.stringify(activity));
	}

	/**
	 * Get user recent activity
	 */
	async getUserActivity(
		userId: string,
		limit: number = 20,
	): Promise<Array<{ action: string; resource: string; timestamp: number }>> {
		const key = `user:activity:${userId}`;
		const activities = await this.cache.getListRange(key, 0, limit - 1);

		return activities.map((activity) => {
			try {
				return JSON.parse(activity);
			} catch {
				return { action: "unknown", resource: "unknown", timestamp: 0 };
			}
		});
	}

	/**
	 * Invalidate user session
	 */
	async invalidateUserSession(userId: string): Promise<boolean> {
		const key = CACHE_KEYS.USER_SESSION(userId);
		return this.cache.delete(key);
	}

	/**
	 * Invalidate user permissions
	 */
	async invalidateUserPermissions(userId: string): Promise<boolean> {
		const key = CACHE_KEYS.USER_PERMISSIONS(userId);
		return this.cache.delete(key);
	}

	/**
	 * Invalidate all user cache
	 */
	async invalidateUser(userId: string): Promise<number> {
		const pattern = `*user*${userId}*`;
		return this.cache.deletePattern(pattern);
	}

	/**
	 * Invalidate all user cache data
	 */
	async invalidateAllUsers(): Promise<number> {
		return this.cache.deletePattern("user:*");
	}

	/**
	 * Get user cache statistics
	 */
	async getUserCacheStats(): Promise<{ totalSessions: number; activeUsers: number; totalPermissions: number }> {
		const activeUsers = await this.getActiveUsers();

		// This is a simplified implementation
		// In a real scenario, you might want to scan for actual keys
		return {
			totalSessions: activeUsers.length,
			activeUsers: activeUsers.length,
			totalPermissions: 0, // Would need to scan permission keys
		};
	}
}

// Singleton instance
let userCache: UserCache | null = null;

/**
 * Get user cache instance
 */
export function getUserCache(): UserCache {
	if (!userCache) {
		userCache = new UserCache();
	}
	return userCache;
}

/**
 * Set user cache instance (useful for testing)
 */
export function setUserCache(cache: UserCache): void {
	userCache = cache;
}

export default getUserCache;
