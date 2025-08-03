import { performance } from 'perf_hooks';
import { PrismaClient } from '@prisma/client';
import { apm } from './application-performance-monitor';
import { getRedisInstance } from '../connections';
import crypto from 'crypto';

// Database monitoring interfaces
export interface DatabaseQueryMetrics {
  queryId: string;
  queryType: string;
  queryHash: string;
  executionTime: number;
  success: boolean;
  error?: string;
  timestamp: Date;
  affectedRows?: number;
  model?: string;
  operation?: string;
  params?: any;
}

export interface DatabaseConnectionMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  connectionPoolSize: number;
  timestamp: Date;
}

export interface SlowQueryAlert {
  queryHash: string;
  queryType: string;
  averageExecutionTime: number;
  occurrences: number;
  lastOccurrence: Date;
  threshold: number;
}

// Alert thresholds for database monitoring
export const DATABASE_ALERT_THRESHOLDS = {
  SLOW_QUERY_TIME: 1000, // ms
  VERY_SLOW_QUERY_TIME: 5000, // ms
  HIGH_ERROR_RATE: 5, // percentage
  MAX_CONNECTION_USAGE: 80, // percentage of pool
  QUERY_FREQUENCY_ALERT: 100, // queries per minute
} as const;

export class DatabaseMonitor {
  private static instance: DatabaseMonitor;
  private redis: ReturnType<typeof getRedisInstance>;
  private queryMetrics: DatabaseQueryMetrics[] = [];
  private slowQueries: Map<string, SlowQueryAlert> = new Map();
  private connectionMetrics: DatabaseConnectionMetrics[] = [];
  
  private readonly METRICS_BUFFER_SIZE = 1000;
  private readonly SLOW_QUERY_THRESHOLD = DATABASE_ALERT_THRESHOLDS.SLOW_QUERY_TIME;
  private readonly MONITORING_INTERVAL = 60000; // 1 minute
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  constructor(redisConnection?: ReturnType<typeof getRedisInstance>) {
    this.redis = redisConnection || getRedisInstance();
    this.startMonitoring();
  }

  static getInstance(): DatabaseMonitor {
    if (!this.instance) {
      this.instance = new DatabaseMonitor();
    }
    return this.instance;
  }

  // Create a monitoring wrapper for Prisma client
  createMonitoredPrismaClient(prisma: PrismaClient): PrismaClient {
    // Create a proxy to intercept all database operations
    return new Proxy(prisma, {
      get: (target: PrismaClient, prop: keyof PrismaClient) => {
        const originalMethod = target[prop];
        
        // If it's a model (like user, lead, etc.)
        if (typeof originalMethod === 'object' && originalMethod !== null) {
          return new Proxy(originalMethod as Record<string, any>, {
            get: (modelTarget: Record<string, any>, modelProp: string) => {
              const modelMethod = modelTarget[modelProp];
              
              // If it's a database operation method
              if (typeof modelMethod === 'function' && this.isDatabaseOperation(modelProp as string)) {
                return this.wrapDatabaseOperation(
                  modelMethod.bind(modelTarget),
                  prop as string,
                  modelProp as string
                );
              }
              
              return modelMethod;
            }
          });
        }
        
        return originalMethod;
      }
    });
  }

  // Check if a method is a database operation
  private isDatabaseOperation(methodName: string): boolean {
    const dbOperations = [
      'findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow',
      'create', 'createMany', 'update', 'updateMany', 'upsert',
      'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'
    ];
    return dbOperations.includes(methodName);
  }

  // Wrap database operation with monitoring
  private wrapDatabaseOperation<T extends (...args: any[]) => Promise<any>>(
    originalMethod: T,
    modelName: string,
    operationName: string
  ): T {
    return (async (...args: Parameters<T>) => {
      const queryId = this.generateQueryId();
      const queryType = `${modelName}.${operationName}`;
      const queryHash = this.generateQueryHash(queryType, args);
      const start = performance.now();
      
      let result: any;
      let error: Error | undefined;
      let affectedRows: number | undefined;

      try {
        result = await originalMethod(...args);
        
        // Try to determine affected rows
        if (Array.isArray(result)) {
          affectedRows = result.length;
        } else if (result && typeof result === 'object' && 'count' in result) {
          affectedRows = result.count;
        } else if (result) {
          affectedRows = 1;
        }

        return result;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        throw error;
      } finally {
        const executionTime = performance.now() - start;
        
        const metrics: DatabaseQueryMetrics = {
          queryId,
          queryType,
          queryHash,
          executionTime,
          success: !error,
          error: error?.message,
          timestamp: new Date(),
          affectedRows,
          model: modelName,
          operation: operationName,
          params: this.sanitizeParams(args),
        };

        this.recordQueryMetrics(metrics);
      }
    }) as T;
  }

  // Generate unique query ID
  private generateQueryId(): string {
    return `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Generate query hash for grouping similar queries
  private generateQueryHash(queryType: string, params: any[]): string {
    const hashInput = `${queryType}-${JSON.stringify(this.normalizeParams(params))}`;
    return crypto.createHash('md5').update(hashInput).digest('hex').substr(0, 8);
  }

  // Normalize parameters for consistent hashing
  private normalizeParams(params: any[]): any {
    return params.map(param => {
      if (typeof param === 'object' && param !== null) {
        // Remove specific values, keep structure
        return this.normalizeObject(param);
      }
      return typeof param;
    });
  }

  // Normalize object for hashing
  private normalizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeObject(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const normalized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (typeof value === 'string' || typeof value === 'number') {
            normalized[key] = typeof value;
          } else {
            normalized[key] = this.normalizeObject(value);
          }
        }
      }
      return normalized;
    }
    
    return typeof obj;
  }

  // Sanitize parameters for logging (remove sensitive data)
  private sanitizeParams(params: any[]): any {
    return params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return this.sanitizeObject(param);
      }
      return param;
    });
  }

  // Sanitize object for logging
  private sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      const sensitiveFields = ['password', 'token', 'key', 'secret', 'apiKey'];
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveFields.some(field => lowerKey.includes(field))) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = this.sanitizeObject(obj[key]);
          }
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  // Record query metrics
  private recordQueryMetrics(metrics: DatabaseQueryMetrics): void {
    // Add to buffer
    this.queryMetrics.push(metrics);
    
    // Keep buffer size manageable
    if (this.queryMetrics.length > this.METRICS_BUFFER_SIZE) {
      this.queryMetrics.shift();
    }

    // Record in APM
    apm.recordDatabaseMetrics({
      queryType: metrics.queryType,
      executionTime: metrics.executionTime,
      success: metrics.success,
      error: metrics.error,
      timestamp: metrics.timestamp,
      affectedRows: metrics.affectedRows,
      queryHash: metrics.queryHash,
    });

    // Check for slow query alerts
    this.checkSlowQueryAlerts(metrics);

    // Log query metrics
    const logLevel = metrics.executionTime > DATABASE_ALERT_THRESHOLDS.VERY_SLOW_QUERY_TIME ? 'warn' : 'log';
    console[logLevel](`[DatabaseMonitor] Query executed: ${metrics.queryType}`, {
      queryId: metrics.queryId,
      executionTime: metrics.executionTime,
      success: metrics.success,
      affectedRows: metrics.affectedRows,
    });
  }

  // Check for slow query alerts
  private checkSlowQueryAlerts(metrics: DatabaseQueryMetrics): void {
    if (metrics.executionTime > this.SLOW_QUERY_THRESHOLD) {
      const existingAlert = this.slowQueries.get(metrics.queryHash);
      
      if (existingAlert) {
        // Update existing slow query alert
        existingAlert.occurrences++;
        existingAlert.lastOccurrence = metrics.timestamp;
        existingAlert.averageExecutionTime = 
          (existingAlert.averageExecutionTime * (existingAlert.occurrences - 1) + metrics.executionTime) / 
          existingAlert.occurrences;
      } else {
        // Create new slow query alert
        const slowQueryAlert: SlowQueryAlert = {
          queryHash: metrics.queryHash,
          queryType: metrics.queryType,
          averageExecutionTime: metrics.executionTime,
          occurrences: 1,
          lastOccurrence: metrics.timestamp,
          threshold: this.SLOW_QUERY_THRESHOLD,
        };
        
        this.slowQueries.set(metrics.queryHash, slowQueryAlert);
      }

      // Create APM alert
      const alertLevel = metrics.executionTime > DATABASE_ALERT_THRESHOLDS.VERY_SLOW_QUERY_TIME ? 'error' : 'warning';
      
      apm.triggerAlert({
        level: alertLevel,
        component: 'database',
        message: `Slow query detected: ${metrics.queryType} (${metrics.executionTime}ms)`,
        metrics: {
          queryType: metrics.queryType,
          queryHash: metrics.queryHash,
          executionTime: metrics.executionTime,
          threshold: this.SLOW_QUERY_THRESHOLD,
        },
      });
    }

    // Alert on query failure
    if (!metrics.success) {
      apm.triggerAlert({
        level: 'error',
        component: 'database',
        message: `Database query failed: ${metrics.queryType}`,
        metrics: {
          queryType: metrics.queryType,
          queryHash: metrics.queryHash,
          error: metrics.error,
        },
      });
    }
  }

  // Start monitoring
  private startMonitoring(): void {
    // Monitor connection metrics periodically
    setInterval(() => {
      this.collectConnectionMetrics().catch(error => {
        console.error('[DatabaseMonitor] Error collecting connection metrics:', error);
      });
    }, this.MONITORING_INTERVAL);

    // Cleanup old metrics periodically
    setInterval(() => {
      this.cleanupOldMetrics();
    }, this.CLEANUP_INTERVAL);

    // Analyze query patterns periodically
    setInterval(() => {
      this.analyzeQueryPatterns();
    }, this.MONITORING_INTERVAL * 5); // Every 5 minutes

    console.log('[DatabaseMonitor] Database monitoring started');
  }

  // Collect connection metrics (this would need to be implemented based on your database setup)
  private async collectConnectionMetrics(): Promise<void> {
    try {
      // This is a placeholder - actual implementation would depend on your database setup
      // For PostgreSQL with Prisma, you might need to query pg_stat_activity
      
      const metrics: DatabaseConnectionMetrics = {
        activeConnections: 0, // Would be queried from database
        idleConnections: 0,   // Would be queried from database
        totalConnections: 0,  // Would be queried from database
        connectionPoolSize: 10, // From your database configuration
        timestamp: new Date(),
      };

      this.connectionMetrics.push(metrics);
      
      if (this.connectionMetrics.length > 100) {
        this.connectionMetrics.shift();
      }

      // Check for connection alerts
      this.checkConnectionAlerts(metrics);

    } catch (error) {
      console.error('[DatabaseMonitor] Error collecting connection metrics:', error);
    }
  }

  // Check for connection-related alerts
  private checkConnectionAlerts(metrics: DatabaseConnectionMetrics): void {
    const connectionUsage = (metrics.activeConnections / metrics.connectionPoolSize) * 100;
    
    if (connectionUsage > DATABASE_ALERT_THRESHOLDS.MAX_CONNECTION_USAGE) {
      apm.triggerAlert({
        level: 'warning',
        component: 'database',
        message: `High database connection usage: ${connectionUsage.toFixed(1)}%`,
        metrics: {
          activeConnections: metrics.activeConnections,
          connectionPoolSize: metrics.connectionPoolSize,
          usage: connectionUsage,
        },
      });
    }
  }

  // Analyze query patterns for optimization opportunities
  private analyzeQueryPatterns(): void {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    const recentQueries = this.queryMetrics.filter(
      query => query.timestamp.getTime() > fiveMinutesAgo
    );

    if (recentQueries.length === 0) return;

    // Group queries by type
    const queryGroups = new Map<string, DatabaseQueryMetrics[]>();
    recentQueries.forEach(query => {
      const group = queryGroups.get(query.queryType) || [];
      group.push(query);
      queryGroups.set(query.queryType, group);
    });

    // Analyze each query group
    for (const [queryType, queries] of queryGroups.entries()) {
      const frequency = queries.length;
      const averageTime = queries.reduce((sum, q) => sum + q.executionTime, 0) / queries.length;
      const errorRate = (queries.filter(q => !q.success).length / queries.length) * 100;

      // Alert on high frequency queries
      if (frequency > DATABASE_ALERT_THRESHOLDS.QUERY_FREQUENCY_ALERT) {
        apm.triggerAlert({
          level: 'info',
          component: 'database',
          message: `High frequency query detected: ${queryType} (${frequency} times in 5 minutes)`,
          metrics: {
            queryType,
            frequency,
            averageTime,
            timeWindow: '5 minutes',
          },
        });
      }

      // Alert on high error rate
      if (errorRate > DATABASE_ALERT_THRESHOLDS.HIGH_ERROR_RATE && queries.length > 10) {
        apm.triggerAlert({
          level: 'error',
          component: 'database',
          message: `High error rate for query: ${queryType} (${errorRate.toFixed(1)}%)`,
          metrics: {
            queryType,
            errorRate,
            totalQueries: queries.length,
            timeWindow: '5 minutes',
          },
        });
      }
    }

    console.log(`[DatabaseMonitor] Query pattern analysis completed`, {
      totalQueries: recentQueries.length,
      uniqueQueryTypes: queryGroups.size,
      timeWindow: '5 minutes',
    });
  }

  // Get query performance statistics
  getQueryPerformanceStats(timeWindowMinutes: number = 60): {
    totalQueries: number;
    averageExecutionTime: number;
    slowQueries: number;
    failedQueries: number;
    successRate: number;
    topSlowQueries: Array<{
      queryType: string;
      queryHash: string;
      averageTime: number;
      occurrences: number;
    }>;
  } {
    const now = Date.now();
    const timeWindow = timeWindowMinutes * 60 * 1000;
    const recentQueries = this.queryMetrics.filter(
      query => now - query.timestamp.getTime() <= timeWindow
    );

    if (recentQueries.length === 0) {
      return {
        totalQueries: 0,
        averageExecutionTime: 0,
        slowQueries: 0,
        failedQueries: 0,
        successRate: 0,
        topSlowQueries: [],
      };
    }

    const totalQueries = recentQueries.length;
    const averageExecutionTime = recentQueries.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries;
    const slowQueries = recentQueries.filter(q => q.executionTime > this.SLOW_QUERY_THRESHOLD).length;
    const failedQueries = recentQueries.filter(q => !q.success).length;
    const successRate = ((totalQueries - failedQueries) / totalQueries) * 100;

    // Get top slow queries
    const queryGroups = new Map<string, { times: number[], queryType: string }>();
    recentQueries.forEach(query => {
      const key = query.queryHash;
      const group = queryGroups.get(key) || { times: [], queryType: query.queryType };
      group.times.push(query.executionTime);
      queryGroups.set(key, group);
    });

    const topSlowQueries = Array.from(queryGroups.entries())
      .map(([queryHash, data]) => ({
        queryType: data.queryType,
        queryHash,
        averageTime: data.times.reduce((sum, time) => sum + time, 0) / data.times.length,
        occurrences: data.times.length,
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    return {
      totalQueries,
      averageExecutionTime: Math.round(averageExecutionTime * 100) / 100,
      slowQueries,
      failedQueries,
      successRate: Math.round(successRate * 100) / 100,
      topSlowQueries,
    };
  }

  // Get slow query alerts
  getSlowQueryAlerts(): SlowQueryAlert[] {
    return Array.from(this.slowQueries.values())
      .sort((a, b) => b.averageExecutionTime - a.averageExecutionTime);
  }

  // Get recent query metrics
  getRecentQueryMetrics(limit: number = 100): DatabaseQueryMetrics[] {
    return this.queryMetrics.slice(-limit);
  }

  // Get failed queries
  getFailedQueries(limit: number = 50): DatabaseQueryMetrics[] {
    return this.queryMetrics
      .filter(query => !query.success)
      .slice(-limit);
  }

  // Get connection metrics
  getConnectionMetrics(): DatabaseConnectionMetrics[] {
    return [...this.connectionMetrics];
  }

  // Clear slow query alert
  clearSlowQueryAlert(queryHash: string): boolean {
    return this.slowQueries.delete(queryHash);
  }

  // Cleanup old metrics
  private cleanupOldMetrics(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Cleanup query metrics
    this.queryMetrics = this.queryMetrics.filter(
      query => query.timestamp.getTime() > oneDayAgo
    );

    // Cleanup connection metrics
    this.connectionMetrics = this.connectionMetrics.filter(
      metrics => metrics.timestamp.getTime() > oneDayAgo
    );

    // Cleanup old slow query alerts
    for (const [queryHash, alert] of this.slowQueries.entries()) {
      if (alert.lastOccurrence.getTime() < oneDayAgo) {
        this.slowQueries.delete(queryHash);
      }
    }

    console.log('[DatabaseMonitor] Old metrics cleaned up');
  }

  // Get database dashboard data
  getDatabaseDashboard(): {
    performance: ReturnType<DatabaseMonitor['getQueryPerformanceStats']>;
    slowQueries: SlowQueryAlert[];
    recentFailures: DatabaseQueryMetrics[];
    connectionStatus: DatabaseConnectionMetrics | null;
  } {
    const performance = this.getQueryPerformanceStats();
    const slowQueries = this.getSlowQueryAlerts();
    const recentFailures = this.getFailedQueries(10);
    const connectionStatus = this.connectionMetrics.length > 0 
      ? this.connectionMetrics[this.connectionMetrics.length - 1] 
      : null;

    return {
      performance,
      slowQueries,
      recentFailures,
      connectionStatus,
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      console.log('[DatabaseMonitor] Shutting down database monitor...');
      
      // Clear metrics
      this.queryMetrics = [];
      this.connectionMetrics = [];
      this.slowQueries.clear();

      console.log('[DatabaseMonitor] Database monitor shutdown completed');
    } catch (error) {
      console.error('[DatabaseMonitor] Error during shutdown:', error);
    }
  }
}

// Global database monitor instance
export const databaseMonitor = DatabaseMonitor.getInstance();

// Utility function to create monitored Prisma client
export function createMonitoredPrismaClient(prisma: PrismaClient): PrismaClient {
  return databaseMonitor.createMonitoredPrismaClient(prisma);
}

// Utility functions
export function getQueryPerformanceStats(timeWindowMinutes?: number) {
  return databaseMonitor.getQueryPerformanceStats(timeWindowMinutes);
}

export function getSlowQueryAlerts(): SlowQueryAlert[] {
  return databaseMonitor.getSlowQueryAlerts();
}

export function getDatabaseDashboard() {
  return databaseMonitor.getDatabaseDashboard();
}

