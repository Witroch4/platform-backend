/**
 * Queue Management System Integration
 *
 * Integration layer to connect with existing system components
 */

import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { getQueueManagementConfig } from "../config";
import { getCacheManager } from "../cache";
import { seedQueueManagementSystem } from "../seeds/initial-data";

/**
 * Initialize queue management system with existing infrastructure
 */
export async function initializeQueueManagementSystem() {
	try {
		console.log("🚀 Initializing Queue Management System...");

		// Get existing singleton instances
		const prisma = getPrismaInstance();
		const redis = getRedisInstance();

		// Verify database connection
		await prisma.$queryRaw`SELECT 1`;
		console.log("✅ Database connection verified");

		// Verify Redis connection
		await redis.ping();
		console.log("✅ Redis connection verified");

		// Initialize cache manager with existing Redis instance
		const cacheManager = getCacheManager();
		console.log("✅ Cache manager initialized");

		// Check if queue management tables exist
		const queueConfigExists = await checkTableExists(prisma, "QueueConfig");

		if (!queueConfigExists) {
			console.log("⚠️  Queue management tables not found. Please run the migration first.");
			console.log("Run: npx prisma migrate deploy");
			return false;
		}

		// Seed initial data if needed
		const existingConfigs = await prisma.queueConfig.count();
		if (existingConfigs === 0) {
			console.log("🌱 Seeding initial queue management data...");
			await seedQueueManagementSystem();
		}

		console.log("✅ Queue Management System initialized successfully");
		return true;
	} catch (error) {
		console.error("❌ Failed to initialize Queue Management System:", error);
		return false;
	}
}

/**
 * Check if a table exists in the database
 */
async function checkTableExists(prisma: any, tableName: string): Promise<boolean> {
	try {
		const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      );
    `;
		return result[0]?.exists || false;
	} catch (error) {
		console.error(`Error checking table ${tableName}:`, error);
		return false;
	}
}

/**
 * Get system health status
 */
export async function getSystemHealth() {
	try {
		const prisma = getPrismaInstance();
		const redis = getRedisInstance();
		const config = getQueueManagementConfig();

		// Check database
		const dbStart = Date.now();
		await prisma.$queryRaw`SELECT 1`;
		const dbLatency = Date.now() - dbStart;

		// Check Redis
		const redisStart = Date.now();
		await redis.ping();
		const redisLatency = Date.now() - redisStart;

		// Get cache stats
		const cacheManager = getCacheManager();
		const cacheStats = cacheManager.getStats();

		return {
			status: "healthy",
			timestamp: new Date(),
			components: {
				database: {
					status: "healthy",
					latency: dbLatency,
					url: config.database.url.replace(/:\/\/.*@/, "://***@"),
				},
				redis: {
					status: "healthy",
					latency: redisLatency,
					host: config.redis.host,
					port: config.redis.port,
				},
				cache: {
					status: "healthy",
					stats: cacheStats,
				},
			},
			config: {
				environment: process.env.NODE_ENV,
				features: config.features,
				performance: {
					cacheEnabled: config.performance.cacheEnabled,
					rateLimitingEnabled: config.performance.rateLimiting.enabled,
				},
			},
		};
	} catch (error) {
		return {
			status: "unhealthy",
			timestamp: new Date(),
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Validate system configuration
 */
export function validateSystemConfiguration() {
	const config = getQueueManagementConfig();
	const issues: string[] = [];

	// Check required environment variables
	if (!process.env.DATABASE_URL) {
		issues.push("DATABASE_URL environment variable is required");
	}

	if (!config.security.jwtSecret) {
		issues.push("JWT secret is required for authentication");
	}

	// Check Redis configuration
	if (!config.redis.host) {
		issues.push("Redis host configuration is required");
	}

	// Check feature flags
	if (config.features.advancedMetrics && !config.metrics.enabled) {
		issues.push("Advanced metrics feature requires metrics to be enabled");
	}

	return {
		valid: issues.length === 0,
		issues,
	};
}

/**
 * Get system information for debugging
 */
export async function getSystemInfo() {
	const config = getQueueManagementConfig();
	const health = await getSystemHealth();
	const validation = validateSystemConfiguration();

	return {
		version: "1.0.0",
		environment: process.env.NODE_ENV,
		timestamp: new Date(),
		health,
		validation,
		configuration: {
			database: {
				maxConnections: config.database.maxConnections,
				connectionTimeout: config.database.connectionTimeout,
			},
			redis: {
				host: config.redis.host,
				port: config.redis.port,
				db: config.redis.db,
			},
			features: config.features,
			performance: config.performance,
		},
	};
}

/**
 * Graceful shutdown handler
 */
export async function shutdownQueueManagementSystem() {
	try {
		console.log("🛑 Shutting down Queue Management System...");

		// Close cache connections
		const cacheManager = getCacheManager();
		await cacheManager.close();

		console.log("✅ Queue Management System shutdown complete");
	} catch (error) {
		console.error("❌ Error during Queue Management System shutdown:", error);
	}
}

/**
 * Integration with existing auth system
 */
export function integrateWithAuthSystem() {
	// This function would integrate with the existing Auth.js 5 system
	// For now, it's a placeholder that documents the integration points

	return {
		authProvider: "Auth.js 5",
		roleRequired: "SUPERADMIN",
		routes: {
			dashboard: "/admin/queue-management",
			auditLogs: "/admin/queue-management/audit-logs",
		},
		middleware: "middleware.ts",
		routeConfig: "config/routes/index.ts",
	};
}

/**
 * Integration with existing monitoring system
 */
export function integrateWithMonitoringSystem() {
	// Integration points with existing monitoring
	return {
		dashboardRoute: "/api/admin/monitoring/dashboard",
		healthCheck: getSystemHealth,
		metrics: {
			enabled: true,
			endpoint: "/api/admin/queue-management/metrics",
		},
	};
}
