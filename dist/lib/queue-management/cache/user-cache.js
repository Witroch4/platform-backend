"use strict";
/**
 * Queue Management - User Cache
 *
 * Specialized cache for user sessions and permissions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserCache = void 0;
exports.getUserCache = getUserCache;
exports.setUserCache = setUserCache;
const cache_manager_1 = require("./cache-manager");
const constants_1 = require("../constants");
class UserCache {
    cache;
    constructor(cacheManager) {
        this.cache = cacheManager || (0, cache_manager_1.getCacheManager)();
    }
    /**
     * Cache user session
     */
    async setUserSession(userId, session, ttl) {
        const key = constants_1.CACHE_KEYS.USER_SESSION(userId);
        return this.cache.set(key, session, { ttl });
    }
    /**
     * Get cached user session
     */
    async getUserSession(userId) {
        const key = constants_1.CACHE_KEYS.USER_SESSION(userId);
        return this.cache.get(key);
    }
    /**
     * Update user session activity
     */
    async updateUserActivity(userId) {
        const session = await this.getUserSession(userId);
        if (!session)
            return false;
        session.lastActivity = new Date();
        return this.setUserSession(userId, session);
    }
    /**
     * Cache user permissions
     */
    async setUserPermissions(userId, permissions, ttl = 1800) {
        const key = constants_1.CACHE_KEYS.USER_PERMISSIONS(userId);
        return this.cache.set(key, permissions, { ttl });
    }
    /**
     * Get cached user permissions
     */
    async getUserPermissions(userId) {
        const key = constants_1.CACHE_KEYS.USER_PERMISSIONS(userId);
        return this.cache.get(key);
    }
    /**
     * Check if user has permission
     */
    async hasPermission(userId, permission, queueName) {
        const permissions = await this.getUserPermissions(userId);
        if (!permissions)
            return false;
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
    async getUserAccessibleQueues(userId) {
        const permissions = await this.getUserPermissions(userId);
        if (!permissions)
            return [];
        return Object.keys(permissions.queueAccess);
    }
    /**
     * Cache user profile
     */
    async setUserProfile(userId, profile, ttl = 3600) {
        const key = `user:profile:${userId}`;
        return this.cache.set(key, profile, { ttl });
    }
    /**
     * Get cached user profile
     */
    async getUserProfile(userId) {
        const key = `user:profile:${userId}`;
        return this.cache.get(key);
    }
    /**
     * Cache user preferences
     */
    async setUserPreferences(userId, preferences, ttl = 86400) {
        const key = `user:preferences:${userId}`;
        return this.cache.set(key, preferences, { ttl });
    }
    /**
     * Get cached user preferences
     */
    async getUserPreferences(userId) {
        const key = `user:preferences:${userId}`;
        return this.cache.get(key);
    }
    /**
     * Set user preference
     */
    async setUserPreference(userId, key, value) {
        const preferences = await this.getUserPreferences(userId) || {};
        preferences[key] = value;
        return this.setUserPreferences(userId, preferences);
    }
    /**
     * Get user preference
     */
    async getUserPreference(userId, key, defaultValue) {
        const preferences = await this.getUserPreferences(userId);
        return preferences?.[key] ?? defaultValue;
    }
    /**
     * Add user to active users set
     */
    async addActiveUser(userId) {
        const key = 'users:active';
        return this.cache.addToSet(key, userId);
    }
    /**
     * Remove user from active users set
     */
    async removeActiveUser(userId) {
        const key = 'users:active';
        return this.cache.removeFromSet(key, userId);
    }
    /**
     * Get all active users
     */
    async getActiveUsers() {
        const key = 'users:active';
        return this.cache.getSetMembers(key);
    }
    /**
     * Cache user login attempt
     */
    async recordLoginAttempt(userId, success, ip) {
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
    async getLoginAttempts(userId, limit = 10) {
        const key = `user:login:${userId}`;
        const attempts = await this.cache.getListRange(key, 0, limit - 1);
        return attempts.map(attempt => {
            try {
                return JSON.parse(attempt);
            }
            catch {
                return { success: false, timestamp: 0 };
            }
        });
    }
    /**
     * Cache user rate limit
     */
    async setUserRateLimit(userId, endpoint, count, windowMs) {
        const window = Math.floor(Date.now() / windowMs);
        const key = constants_1.CACHE_KEYS.RATE_LIMIT(`user:${userId}:${endpoint}`, window);
        const ttl = Math.ceil(windowMs / 1000);
        return this.cache.set(key, count, { ttl });
    }
    /**
     * Get user rate limit
     */
    async getUserRateLimit(userId, endpoint, windowMs) {
        const window = Math.floor(Date.now() / windowMs);
        const key = constants_1.CACHE_KEYS.RATE_LIMIT(`user:${userId}:${endpoint}`, window);
        const count = await this.cache.get(key);
        return count || 0;
    }
    /**
     * Increment user rate limit
     */
    async incrementUserRateLimit(userId, endpoint, windowMs) {
        const window = Math.floor(Date.now() / windowMs);
        const key = constants_1.CACHE_KEYS.RATE_LIMIT(`user:${userId}:${endpoint}`, window);
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
    async setUserDashboardLayout(userId, layout, ttl = 86400) {
        const key = `user:dashboard:${userId}`;
        return this.cache.set(key, layout, { ttl });
    }
    /**
     * Get cached user dashboard layout
     */
    async getUserDashboardLayout(userId) {
        const key = `user:dashboard:${userId}`;
        return this.cache.get(key);
    }
    /**
     * Cache user notification settings
     */
    async setUserNotificationSettings(userId, settings, ttl = 86400) {
        const key = `user:notifications:${userId}`;
        return this.cache.set(key, settings, { ttl });
    }
    /**
     * Get cached user notification settings
     */
    async getUserNotificationSettings(userId) {
        const key = `user:notifications:${userId}`;
        return this.cache.get(key);
    }
    /**
     * Cache user recent activity
     */
    async addUserActivity(userId, activity) {
        const key = `user:activity:${userId}`;
        return this.cache.pushToList(key, JSON.stringify(activity));
    }
    /**
     * Get user recent activity
     */
    async getUserActivity(userId, limit = 20) {
        const key = `user:activity:${userId}`;
        const activities = await this.cache.getListRange(key, 0, limit - 1);
        return activities.map(activity => {
            try {
                return JSON.parse(activity);
            }
            catch {
                return { action: 'unknown', resource: 'unknown', timestamp: 0 };
            }
        });
    }
    /**
     * Invalidate user session
     */
    async invalidateUserSession(userId) {
        const key = constants_1.CACHE_KEYS.USER_SESSION(userId);
        return this.cache.delete(key);
    }
    /**
     * Invalidate user permissions
     */
    async invalidateUserPermissions(userId) {
        const key = constants_1.CACHE_KEYS.USER_PERMISSIONS(userId);
        return this.cache.delete(key);
    }
    /**
     * Invalidate all user cache
     */
    async invalidateUser(userId) {
        const pattern = `*user*${userId}*`;
        return this.cache.deletePattern(pattern);
    }
    /**
     * Invalidate all user cache data
     */
    async invalidateAllUsers() {
        return this.cache.deletePattern('user:*');
    }
    /**
     * Get user cache statistics
     */
    async getUserCacheStats() {
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
exports.UserCache = UserCache;
// Singleton instance
let userCache = null;
/**
 * Get user cache instance
 */
function getUserCache() {
    if (!userCache) {
        userCache = new UserCache();
    }
    return userCache;
}
/**
 * Set user cache instance (useful for testing)
 */
function setUserCache(cache) {
    userCache = cache;
}
exports.default = getUserCache;
