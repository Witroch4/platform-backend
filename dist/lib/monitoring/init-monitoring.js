"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeMonitoring = initializeMonitoring;
exports.createMonitoredPrisma = createMonitoredPrisma;
exports.performHealthCheck = performHealthCheck;
exports.getMonitoringStatus = getMonitoringStatus;
exports.isMonitoringInitialized = isMonitoringInitialized;
exports.reinitializeMonitoring = reinitializeMonitoring;
const application_performance_monitor_1 = require("./application-performance-monitor");
const queue_monitor_1 = require("./queue-monitor");
const database_monitor_1 = require("./database-monitor");
const credentials_cache_1 = require("../cache/credentials-cache");
// Global monitoring state
let monitoringInitialized = false;
/**
 * Initialize all monitoring systems
 * This should be called once during application startup
 */
async function initializeMonitoring() {
    if (monitoringInitialized) {
        console.log("[Monitoring] Monitoring already initialized, skipping...");
        return;
    }
    try {
        console.log("[Monitoring] Initializing comprehensive monitoring system...");
        // 1. Start Application Performance Monitoring
        (0, application_performance_monitor_1.startApplicationPerformanceMonitoring)();
        console.log("[Monitoring] ✓ Application Performance Monitor started");
        // 2. Initialize Queue Monitoring
        await (0, queue_monitor_1.initializeQueueMonitoring)();
        console.log("[Monitoring] ✓ Queue Monitor initialized");
        // 2.1. Initialize Instagram Translation Monitoring
        const { initializeInstagramTranslationMonitoring } = await Promise.resolve().then(() => __importStar(require('./instagram-translation-monitor')));
        await initializeInstagramTranslationMonitoring();
        console.log("[Monitoring] ✓ Instagram Translation Monitor initialized");
        // 2.2. Initialize Instagram Translation Logging
        const { initializeInstagramTranslationLogging } = await Promise.resolve().then(() => __importStar(require('../logging/instagram-translation-logger')));
        await initializeInstagramTranslationLogging();
        console.log("[Monitoring] ✓ Instagram Translation Logging initialized");
        // 2.3. Initialize Instagram Error Tracking
        const { initializeInstagramErrorTracking } = await Promise.resolve().then(() => __importStar(require('./instagram-error-tracker')));
        await initializeInstagramErrorTracking();
        console.log("[Monitoring] ✓ Instagram Error Tracking initialized");
        // 3. Database Monitor is automatically initialized when imported
        console.log("[Monitoring] ✓ Database Monitor initialized");
        // 4. Start Cache Maintenance and Monitoring
        (0, credentials_cache_1.startCacheMaintenance)();
        console.log("[Monitoring] ✓ Cache Monitoring started");
        // 5. Set up graceful shutdown handlers
        setupGracefulShutdown();
        console.log("[Monitoring] ✓ Graceful shutdown handlers registered");
        // 6. Start health check endpoint
        startHealthCheckEndpoint();
        console.log("[Monitoring] ✓ Health check endpoint started");
        monitoringInitialized = true;
        console.log("[Monitoring] 🎉 All monitoring systems initialized successfully");
        // Log initial system status
        await logInitialSystemStatus();
    }
    catch (error) {
        console.error("[Monitoring] Failed to initialize monitoring systems:", error);
        throw error;
    }
}
/**
 * Create a monitored Prisma client instance
 * Use this instead of the regular Prisma client to enable database monitoring
 */
function createMonitoredPrisma(prisma) {
    return (0, database_monitor_1.createMonitoredPrismaClient)(prisma);
}
/**
 * Set up graceful shutdown handlers for monitoring systems
 */
function setupGracefulShutdown() {
    const shutdownHandler = async (signal) => {
        console.log(`[Monitoring] Received ${signal}, shutting down monitoring systems...`);
        try {
            // Import monitoring instances
            const { apm } = await Promise.resolve().then(() => __importStar(require("./application-performance-monitor")));
            const { queueMonitor } = await Promise.resolve().then(() => __importStar(require("./queue-monitor")));
            const { databaseMonitor } = await Promise.resolve().then(() => __importStar(require("./database-monitor")));
            // Shutdown all monitoring systems
            await Promise.all([
                apm.shutdown(),
                queueMonitor.shutdown(),
                databaseMonitor.shutdown(),
            ]);
            console.log("[Monitoring] All monitoring systems shut down gracefully");
            process.exit(0);
        }
        catch (error) {
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
function startHealthCheckEndpoint() {
    // This would typically be integrated into your main HTTP server
    // For now, we'll just set up periodic health checks
    setInterval(async () => {
        try {
            await performHealthCheck();
        }
        catch (error) {
            console.error("[Monitoring] Health check failed:", error);
        }
    }, 60000); // Every minute
}
/**
 * Perform a comprehensive health check of all monitoring systems
 */
async function performHealthCheck() {
    const healthCheck = {
        status: "healthy",
        components: {},
        timestamp: new Date().toISOString(),
    };
    try {
        // Check Application Performance Monitor
        const { apm } = await Promise.resolve().then(() => __importStar(require("./application-performance-monitor")));
        const apmStart = Date.now();
        const activeAlerts = apm.getActiveAlerts();
        const apmLatency = Date.now() - apmStart;
        const criticalAlerts = activeAlerts.filter((a) => a.level === "critical").length;
        healthCheck.components.apm = {
            status: criticalAlerts > 0 ? "unhealthy" : "healthy",
            message: `${activeAlerts.length} active alerts (${criticalAlerts} critical)`,
            latency: apmLatency,
        };
        // Check Queue Monitor
        const { queueMonitor } = await Promise.resolve().then(() => __importStar(require("./queue-monitor")));
        const queueStart = Date.now();
        const queueDashboard = queueMonitor.getQueueDashboard();
        const queueLatency = Date.now() - queueStart;
        const hasQueueIssues = queueDashboard.queues.some((q) => q.health.failed > 50 || q.health.waiting > 100 || q.health.paused);
        healthCheck.components.queues = {
            status: hasQueueIssues ? "degraded" : "healthy",
            message: `${queueDashboard.overview.totalQueues} queues, ${queueDashboard.overview.failedJobs} failed jobs`,
            latency: queueLatency,
        };
        // Check Database Monitor
        const { databaseMonitor } = await Promise.resolve().then(() => __importStar(require("./database-monitor")));
        const dbStart = Date.now();
        const dbStats = databaseMonitor.getQueryPerformanceStats(5); // Last 5 minutes
        const dbLatency = Date.now() - dbStart;
        const hasDbIssues = dbStats.successRate < 95 || dbStats.averageExecutionTime > 2000;
        healthCheck.components.database = {
            status: hasDbIssues ? "degraded" : "healthy",
            message: `${dbStats.successRate}% success rate, ${dbStats.averageExecutionTime}ms avg query time`,
            latency: dbLatency,
        };
        // Check Cache Health
        const { credentialsCache } = await Promise.resolve().then(() => __importStar(require("../cache/credentials-cache")));
        const cacheStart = Date.now();
        const cacheHealth = await credentialsCache.checkHealth();
        const cacheLatency = Date.now() - cacheStart;
        healthCheck.components.cache = {
            status: cacheHealth.isConnected ? "healthy" : "unhealthy",
            message: `Connected: ${cacheHealth.isConnected}, Latency: ${cacheHealth.latency}ms`,
            latency: cacheLatency,
        };
        // Determine overall status
        const componentStatuses = Object.values(healthCheck.components).map((c) => c.status);
        if (componentStatuses.includes("unhealthy")) {
            healthCheck.status = "unhealthy";
        }
        else if (componentStatuses.includes("degraded")) {
            healthCheck.status = "degraded";
        }
    }
    catch (error) {
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
async function logInitialSystemStatus() {
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
            console[logLevel](`[Monitoring] ${component}: ${status.status} - ${status.message}`);
        }
    }
    catch (error) {
        console.error("[Monitoring] Failed to log initial system status:", error);
    }
}
/**
 * Get monitoring system status
 */
function getMonitoringStatus() {
    return {
        initialized: monitoringInitialized,
        uptime: process.uptime(),
        version: "1.0.0", // You might want to get this from package.json
    };
}
/**
 * Utility function to check if monitoring is initialized
 */
function isMonitoringInitialized() {
    return monitoringInitialized;
}
/**
 * Force reinitialize monitoring (use with caution)
 */
async function reinitializeMonitoring() {
    console.log("[Monitoring] Force reinitializing monitoring systems...");
    monitoringInitialized = false;
    await initializeMonitoring();
}
// Export monitoring utilities
__exportStar(require("./application-performance-monitor"), exports);
__exportStar(require("./queue-monitor"), exports);
__exportStar(require("./database-monitor"), exports);
// Default export for easy importing
exports.default = {
    initializeMonitoring,
    createMonitoredPrisma,
    performHealthCheck,
    getMonitoringStatus,
    isMonitoringInitialized,
    reinitializeMonitoring,
};
