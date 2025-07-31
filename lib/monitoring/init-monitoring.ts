import { startApplicationPerformanceMonitoring } from "./application-performance-monitor";
import { initializeQueueMonitoring } from "./queue-monitor";
import {
  databaseMonitor,
  createMonitoredPrismaClient,
} from "./database-monitor";
import { startCacheMaintenance } from "../cache/credentials-cache";

// Global monitoring state
let monitoringInitialized = false;

/**
 * Initialize all monitoring systems
 * This should be called once during application startup
 */
export async function initializeMonitoring(): Promise<void> {
  if (monitoringInitialized) {
    console.log("[Monitoring] Monitoring already initialized, skipping...");
    return;
  }

  try {
    console.log("[Monitoring] Initializing comprehensive monitoring system...");

    // 1. Start Application Performance Monitoring
    startApplicationPerformanceMonitoring();
    console.log("[Monitoring] ✓ Application Performance Monitor started");

    // 2. Initialize Queue Monitoring
    await initializeQueueMonitoring();
    console.log("[Monitoring] ✓ Queue Monitor initialized");

    // 2.1. Initialize Instagram Translation Monitoring
    const { initializeInstagramTranslationMonitoring } = await import('./instagram-translation-monitor');
    await initializeInstagramTranslationMonitoring();
    console.log("[Monitoring] ✓ Instagram Translation Monitor initialized");

    // 2.2. Initialize Instagram Translation Logging
    const { initializeInstagramTranslationLogging } = await import('../logging/instagram-translation-logger');
    await initializeInstagramTranslationLogging();
    console.log("[Monitoring] ✓ Instagram Translation Logging initialized");

    // 2.3. Initialize Instagram Error Tracking
    const { initializeInstagramErrorTracking } = await import('./instagram-error-tracker');
    await initializeInstagramErrorTracking();
    console.log("[Monitoring] ✓ Instagram Error Tracking initialized");

    // 3. Database Monitor is automatically initialized when imported
    console.log("[Monitoring] ✓ Database Monitor initialized");

    // 4. Start Cache Maintenance and Monitoring
    startCacheMaintenance();
    console.log("[Monitoring] ✓ Cache Monitoring started");

    // 5. Set up graceful shutdown handlers
    setupGracefulShutdown();
    console.log("[Monitoring] ✓ Graceful shutdown handlers registered");

    // 6. Start health check endpoint
    startHealthCheckEndpoint();
    console.log("[Monitoring] ✓ Health check endpoint started");

    monitoringInitialized = true;
    console.log(
      "[Monitoring] 🎉 All monitoring systems initialized successfully"
    );

    // Log initial system status
    await logInitialSystemStatus();
  } catch (error) {
    console.error(
      "[Monitoring] Failed to initialize monitoring systems:",
      error
    );
    throw error;
  }
}

/**
 * Create a monitored Prisma client instance
 * Use this instead of the regular Prisma client to enable database monitoring
 */
export function createMonitoredPrisma(prisma: any) {
  return createMonitoredPrismaClient(prisma);
}

/**
 * Set up graceful shutdown handlers for monitoring systems
 */
function setupGracefulShutdown(): void {
  const shutdownHandler = async (signal: string) => {
    console.log(
      `[Monitoring] Received ${signal}, shutting down monitoring systems...`
    );

    try {
      // Import monitoring instances
      const { apm } = await import("./application-performance-monitor");
      const { queueMonitor } = await import("./queue-monitor");
      const { databaseMonitor } = await import("./database-monitor");

      // Shutdown all monitoring systems
      await Promise.all([
        apm.shutdown(),
        queueMonitor.shutdown(),
        databaseMonitor.shutdown(),
      ]);

      console.log("[Monitoring] All monitoring systems shut down gracefully");
      process.exit(0);
    } catch (error) {
      console.error("[Monitoring] Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGUSR2", () => shutdownHandler("SIGUSR2")); // For nodemon
}

/**
 * Start a simple health check endpoint for monitoring systems
 */
function startHealthCheckEndpoint(): void {
  // This would typically be integrated into your main HTTP server
  // For now, we'll just set up periodic health checks

  setInterval(async () => {
    try {
      await performHealthCheck();
    } catch (error) {
      console.error("[Monitoring] Health check failed:", error);
    }
  }, 60000); // Every minute
}

/**
 * Perform a comprehensive health check of all monitoring systems
 */
export async function performHealthCheck(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  components: Record<
    string,
    { status: string; message?: string; latency?: number }
  >;
  timestamp: string;
}> {
  const healthCheck = {
    status: "healthy" as "healthy" | "degraded" | "unhealthy",
    components: {} as Record<
      string,
      { status: string; message?: string; latency?: number }
    >,
    timestamp: new Date().toISOString(),
  };

  try {
    // Check Application Performance Monitor
    const { apm } = await import("./application-performance-monitor");
    const apmStart = Date.now();
    const activeAlerts = apm.getActiveAlerts();
    const apmLatency = Date.now() - apmStart;

    const criticalAlerts = activeAlerts.filter(
      (a) => a.level === "critical"
    ).length;
    healthCheck.components.apm = {
      status: criticalAlerts > 0 ? "unhealthy" : "healthy",
      message: `${activeAlerts.length} active alerts (${criticalAlerts} critical)`,
      latency: apmLatency,
    };

    // Check Queue Monitor
    const { queueMonitor } = await import("./queue-monitor");
    const queueStart = Date.now();
    const queueDashboard = queueMonitor.getQueueDashboard();
    const queueLatency = Date.now() - queueStart;

    const hasQueueIssues = queueDashboard.queues.some(
      (q) => q.health.failed > 50 || q.health.waiting > 100 || q.health.paused
    );
    healthCheck.components.queues = {
      status: hasQueueIssues ? "degraded" : "healthy",
      message: `${queueDashboard.overview.totalQueues} queues, ${queueDashboard.overview.failedJobs} failed jobs`,
      latency: queueLatency,
    };

    // Check Database Monitor
    const { databaseMonitor } = await import("./database-monitor");
    const dbStart = Date.now();
    const dbStats = databaseMonitor.getQueryPerformanceStats(5); // Last 5 minutes
    const dbLatency = Date.now() - dbStart;

    const hasDbIssues =
      dbStats.successRate < 95 || dbStats.averageExecutionTime > 2000;
    healthCheck.components.database = {
      status: hasDbIssues ? "degraded" : "healthy",
      message: `${dbStats.successRate}% success rate, ${dbStats.averageExecutionTime}ms avg query time`,
      latency: dbLatency,
    };

    // Check Cache Health
    const { credentialsCache } = await import("../cache/credentials-cache");
    const cacheStart = Date.now();
    const cacheHealth = await credentialsCache.checkHealth();
    const cacheLatency = Date.now() - cacheStart;

    healthCheck.components.cache = {
      status: cacheHealth.isConnected ? "healthy" : "unhealthy",
      message: `Connected: ${cacheHealth.isConnected}, Latency: ${cacheHealth.latency}ms`,
      latency: cacheLatency,
    };

    // Determine overall status
    const componentStatuses = Object.values(healthCheck.components).map(
      (c) => c.status
    );
    if (componentStatuses.includes("unhealthy")) {
      healthCheck.status = "unhealthy";
    } else if (componentStatuses.includes("degraded")) {
      healthCheck.status = "degraded";
    }
  } catch (error) {
    healthCheck.status = "unhealthy";
    healthCheck.components.error = {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return healthCheck;
}

/**
 * Log initial system status after monitoring initialization
 */
async function logInitialSystemStatus(): Promise<void> {
  try {
    const healthCheck = await performHealthCheck();

    console.log("[Monitoring] Initial system status:", {
      status: healthCheck.status,
      components: Object.keys(healthCheck.components).length,
      timestamp: healthCheck.timestamp,
    });

    // Log component details
    for (const [component, status] of Object.entries(healthCheck.components)) {
      const logLevel = status.status === "healthy" ? "info" : "warn";
      console[logLevel](
        `[Monitoring] ${component}: ${status.status} - ${status.message}`
      );
    }
  } catch (error) {
    console.error("[Monitoring] Failed to log initial system status:", error);
  }
}

/**
 * Get monitoring system status
 */
export function getMonitoringStatus(): {
  initialized: boolean;
  uptime: number;
  version: string;
} {
  return {
    initialized: monitoringInitialized,
    uptime: process.uptime(),
    version: "1.0.0", // You might want to get this from package.json
  };
}

/**
 * Utility function to check if monitoring is initialized
 */
export function isMonitoringInitialized(): boolean {
  return monitoringInitialized;
}

/**
 * Force reinitialize monitoring (use with caution)
 */
export async function reinitializeMonitoring(): Promise<void> {
  console.log("[Monitoring] Force reinitializing monitoring systems...");
  monitoringInitialized = false;
  await initializeMonitoring();
}

// Export monitoring utilities
export * from "./application-performance-monitor";
export * from "./queue-monitor";
export * from "./database-monitor";

// Default export for easy importing
export default {
  initializeMonitoring,
  createMonitoredPrisma,
  performHealthCheck,
  getMonitoringStatus,
  isMonitoringInitialized,
  reinitializeMonitoring,
};
