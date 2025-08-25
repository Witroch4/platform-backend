import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode acessar status de saúde." },
        { status: 403 }
      );
    }

    const healthChecks = {
      database: { status: "unknown" as string, latency: 0, error: null as string | null },
      redis: { status: "unknown" as string, latency: 0, error: null as string | null },
      featureFlags: { status: "unknown" as string, totalFlags: 0, activeFlags: 0, error: null as string | null },
      userOverrides: { status: "unknown" as string, totalOverrides: 0, activeOverrides: 0, error: null as string | null },
      metrics: { status: "unknown" as string, recentMetrics: 0, error: null as string | null }
    };

    let overallStatus = "healthy";
    const issues = [];

    // Database health check
    try {
      const dbStart = Date.now();
      const prisma = getPrismaInstance();
      
      // Simple query to test database connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      healthChecks.database.latency = Date.now() - dbStart;
      healthChecks.database.status = healthChecks.database.latency < 1000 ? "healthy" : "degraded";
      
      if (healthChecks.database.status === "degraded") {
        issues.push("Database response time is high");
      }
    } catch (error) {
      healthChecks.database.status = "unhealthy";
      healthChecks.database.error = error instanceof Error ? error.message : "Unknown error";
      overallStatus = "unhealthy";
      issues.push("Database connection failed");
    }

    // Redis health check
    try {
      const redisStart = Date.now();
      const redis = getRedisInstance();
      
      // Test Redis connectivity with ping
      await redis.ping();
      
      healthChecks.redis.latency = Date.now() - redisStart;
      healthChecks.redis.status = healthChecks.redis.latency < 500 ? "healthy" : "degraded";
      
      if (healthChecks.redis.status === "degraded") {
        issues.push("Redis response time is high");
      }
    } catch (error) {
      healthChecks.redis.status = "unhealthy";
      healthChecks.redis.error = error instanceof Error ? error.message : "Unknown error";
      overallStatus = "degraded"; // Redis issues are not critical for basic functionality
      issues.push("Redis connection failed - feature flag caching may be impacted");
    }

    // Feature flags health check
    if (healthChecks.database.status !== "unhealthy") {
      try {
        const prisma = getPrismaInstance();
        
        const [totalFlags, activeFlags] = await Promise.all([
          prisma.featureFlag.count(),
          prisma.featureFlag.count({ where: { enabled: true } })
        ]);

        healthChecks.featureFlags.totalFlags = totalFlags;
        healthChecks.featureFlags.activeFlags = activeFlags;
        healthChecks.featureFlags.status = "healthy";

        // Check for potential issues
        if (totalFlags === 0) {
          issues.push("No feature flags configured");
          healthChecks.featureFlags.status = "warning";
        }

        if (totalFlags > 500) {
          issues.push("Large number of feature flags may impact performance");
          healthChecks.featureFlags.status = "warning";
        }

      } catch (error) {
        healthChecks.featureFlags.status = "unhealthy";
        healthChecks.featureFlags.error = error instanceof Error ? error.message : "Unknown error";
        overallStatus = "unhealthy";
        issues.push("Feature flags query failed");
      }
    }

    // User overrides health check
    if (healthChecks.database.status !== "unhealthy") {
      try {
        const prisma = getPrismaInstance();
        
        const [totalOverrides, activeOverrides] = await Promise.all([
          prisma.userFeatureFlagOverride.count(),
          prisma.userFeatureFlagOverride.count({
            where: {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
              ]
            }
          })
        ]);

        healthChecks.userOverrides.totalOverrides = totalOverrides;
        healthChecks.userOverrides.activeOverrides = activeOverrides;
        healthChecks.userOverrides.status = "healthy";

        // Check for expired overrides that should be cleaned up
        const expiredOverrides = totalOverrides - activeOverrides;
        if (expiredOverrides > 100) {
          issues.push(`${expiredOverrides} expired user overrides should be cleaned up`);
          healthChecks.userOverrides.status = "warning";
        }

      } catch (error) {
        healthChecks.userOverrides.status = "unhealthy";
        healthChecks.userOverrides.error = error instanceof Error ? error.message : "Unknown error";
        overallStatus = "unhealthy";
        issues.push("User overrides query failed");
      }
    }

    // Metrics health check
    if (healthChecks.database.status !== "unhealthy") {
      try {
        const prisma = getPrismaInstance();
        
        // Check for recent metrics (last 24 hours)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const recentMetrics = await prisma.featureFlagMetrics.count({
          where: {
            date: { gte: yesterday }
          }
        });

        healthChecks.metrics.recentMetrics = recentMetrics;
        healthChecks.metrics.status = recentMetrics > 0 ? "healthy" : "warning";

        if (recentMetrics === 0) {
          issues.push("No recent metrics data - metrics collection may not be working");
        }

      } catch (error) {
        healthChecks.metrics.status = "unhealthy";
        healthChecks.metrics.error = error instanceof Error ? error.message : "Unknown error";
        overallStatus = "degraded";
        issues.push("Metrics query failed");
      }
    }

    // Additional system checks
    const systemInfo = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "unknown"
    };

    // Memory usage check
    const memoryUsageMB = systemInfo.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 512) { // 512MB threshold
      issues.push(`High memory usage: ${memoryUsageMB.toFixed(2)}MB`);
      if (overallStatus === "healthy") overallStatus = "degraded";
    }

    // Determine final status
    if (overallStatus === "healthy" && issues.length > 0) {
      overallStatus = "degraded";
    }

    const response = {
      status: overallStatus,
      timestamp: systemInfo.timestamp,
      checks: healthChecks,
      issues,
      system: {
        uptime: systemInfo.uptime,
        memoryUsageMB: memoryUsageMB,
        nodeVersion: systemInfo.nodeVersion,
        environment: systemInfo.environment
      },
      recommendations: [] as string[]
    };

    // Add recommendations based on issues
    if (issues.some(issue => issue.includes("Redis"))) {
      response.recommendations.push("Check Redis server status and network connectivity");
    }

    if (issues.some(issue => issue.includes("Database"))) {
      response.recommendations.push("Check database server status and connection pool");
    }

    if (issues.some(issue => issue.includes("expired"))) {
      response.recommendations.push("Run cleanup job to remove expired user overrides");
    }

    if (issues.some(issue => issue.includes("metrics"))) {
      response.recommendations.push("Check metrics collection job and ensure it's running");
    }

    logger.info("Health check completed", {
      userId: session.user.id,
      status: overallStatus,
      issueCount: issues.length
    });

    // Return appropriate HTTP status based on health
    const httpStatus = overallStatus === "healthy" ? 200 : 
                      overallStatus === "degraded" ? 200 : 503;

    return NextResponse.json(response, { status: httpStatus });

  } catch (error) {
    logger.error("Error during health check", {
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
      checks: {},
      issues: ["Health check system failure"],
      system: {},
      recommendations: ["Check application logs and system status"]
    }, { status: 503 });
  }
}