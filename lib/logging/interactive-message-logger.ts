// Comprehensive logging system for Interactive Messages
// Provides structured logging for debugging, monitoring, and audit trails

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  context?: {
    userId?: string;
    caixaId?: string;
    messageId?: string;
    action?: string;
    component?: string;
    requestId?: string;
    sessionId?: string;
  };
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    duration?: number;
    memoryUsage?: NodeJS.MemoryUsage;
    startTime?: number;
    endTime?: number;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  maxLogSize: number;
  maxLogFiles: number;
  remoteEndpoint?: string;
  apiKey?: string;
  bufferSize: number;
  flushInterval: number;
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: false,
  enableRemote: false,
  maxLogSize: 10 * 1024 * 1024, // 10MB
  maxLogFiles: 5,
  bufferSize: 100,
  flushInterval: 5000 // 5 seconds
};

// Log categories for better organization
export const LOG_CATEGORIES = {
  VALIDATION: 'validation',
  ERROR_HANDLING: 'error_handling',
  API_REQUEST: 'api_request',
  API_RESPONSE: 'api_response',
  DATABASE: 'database',
  AUTHENTICATION: 'authentication',
  BUSINESS_LOGIC: 'business_logic',
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  USER_ACTION: 'user_action',
  SYSTEM: 'system',
  WEBHOOK: 'webhook',
  EXTERNAL_API: 'external_api'
} as const;

export type LogCategory = typeof LOG_CATEGORIES[keyof typeof LOG_CATEGORIES];

class InteractiveMessageLogger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private logCounter = 0;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushTimer();
  }

  // Main logging methods
  debug(message: string, category: LogCategory, context?: LogEntry['context'], metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, category, context, metadata);
  }

  info(message: string, category: LogCategory, context?: LogEntry['context'], metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, category, context, metadata);
  }

  warn(message: string, category: LogCategory, context?: LogEntry['context'], metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, category, context, metadata);
  }

  error(message: string, category: LogCategory, error?: Error, context?: LogEntry['context'], metadata?: Record<string, any>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log(LogLevel.ERROR, message, category, context, metadata, errorInfo);
  }

  critical(message: string, category: LogCategory, error?: Error, context?: LogEntry['context'], metadata?: Record<string, any>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log(LogLevel.CRITICAL, message, category, context, metadata, errorInfo);
    
    // Immediately flush critical logs
    this.flush();
  }

  // Performance logging
  startPerformanceTimer(operation: string, category: LogCategory, context?: LogEntry['context']): string {
    const timerId = this.generateId();
    const startTime = Date.now();
    
    this.debug(`Starting operation: ${operation}`, category, {
      ...context,
      timerId
    }, {
      operation,
      startTime
    });

    return timerId;
  }

  endPerformanceTimer(timerId: string, operation: string, category: LogCategory, context?: LogEntry['context'], metadata?: Record<string, any>): void {
    const endTime = Date.now();
    const memoryUsage = process.memoryUsage();
    
    // Try to find the start time from recent logs (simplified approach)
    const startTime = Date.now() - 1000; // Fallback if not found
    const duration = endTime - startTime;

    this.info(`Completed operation: ${operation}`, category, {
      ...context,
      timerId
    }, {
      ...metadata,
      operation,
      performance: {
        duration,
        memoryUsage,
        startTime,
        endTime
      }
    });
  }

  // Specialized logging methods
  logApiRequest(method: string, url: string, context?: LogEntry['context'], requestData?: any): void {
    this.info(`API Request: ${method} ${url}`, LOG_CATEGORIES.API_REQUEST, context, {
      method,
      url,
      requestData: this.sanitizeData(requestData)
    });
  }

  logApiResponse(method: string, url: string, status: number, context?: LogEntry['context'], responseData?: any, duration?: number): void {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    
    this.log(level, `API Response: ${method} ${url} - ${status}`, LOG_CATEGORIES.API_RESPONSE, context, {
      method,
      url,
      status,
      responseData: this.sanitizeData(responseData),
      performance: duration ? { duration } : undefined
    });
  }

  logValidationError(field: string, error: string, context?: LogEntry['context'], validationData?: any): void {
    this.warn(`Validation failed for field: ${field}`, LOG_CATEGORIES.VALIDATION, context, {
      field,
      validationError: error,
      validationData: this.sanitizeData(validationData)
    });
  }

  logDatabaseOperation(operation: string, table: string, context?: LogEntry['context'], queryData?: any, duration?: number): void {
    this.info(`Database ${operation}: ${table}`, LOG_CATEGORIES.DATABASE, context, {
      operation,
      table,
      queryData: this.sanitizeData(queryData),
      performance: duration ? { duration } : undefined
    });
  }

  logUserAction(action: string, context?: LogEntry['context'], actionData?: any): void {
    this.info(`User action: ${action}`, LOG_CATEGORIES.USER_ACTION, context, {
      action,
      actionData: this.sanitizeData(actionData)
    });
  }

  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: LogEntry['context'], eventData?: any): void {
    const level = severity === 'critical' ? LogLevel.CRITICAL : 
                  severity === 'high' ? LogLevel.ERROR :
                  severity === 'medium' ? LogLevel.WARN : LogLevel.INFO;

    this.log(level, `Security event: ${event}`, LOG_CATEGORIES.SECURITY, context, {
      event,
      severity,
      eventData: this.sanitizeData(eventData)
    });
  }

  // Core logging method
  private log(
    level: LogLevel,
    message: string,
    category: LogCategory,
    context?: LogEntry['context'],
    metadata?: Record<string, any>,
    error?: LogEntry['error'],
    performance?: LogEntry['performance']
  ): void {
    // Check if log level meets threshold
    if (level < this.config.level) {
      return;
    }

    const logEntry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      level,
      category,
      message,
      context,
      metadata,
      error,
      performance
    };

    // Add to buffer
    this.logBuffer.push(logEntry);

    // Console output if enabled
    if (this.config.enableConsole) {
      this.writeToConsole(logEntry);
    }

    // Flush if buffer is full
    if (this.logBuffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  // Output methods
  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context ? ` [${this.formatContext(entry.context)}]` : '';
    const metadataStr = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    
    const logMessage = `[${timestamp}] ${levelName} [${entry.category}]${contextStr} ${entry.message}${metadataStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(logMessage);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
    }
  }

  private formatContext(context: LogEntry['context']): string {
    const parts: string[] = [];
    
    if (context?.userId) parts.push(`user:${context.userId}`);
    if (context?.requestId) parts.push(`req:${context.requestId}`);
    if (context?.messageId) parts.push(`msg:${context.messageId}`);
    if (context?.caixaId) parts.push(`caixa:${context.caixaId}`);
    if (context?.component) parts.push(`comp:${context.component}`);
    if (context?.action) parts.push(`action:${context.action}`);
    
    return parts.join('|');
  }

  // Buffer management
  private flush(): void {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    // Write to file if enabled
    if (this.config.enableFile) {
      this.writeToFile(logsToFlush);
    }

    // Send to remote service if enabled
    if (this.config.enableRemote) {
      this.sendToRemote(logsToFlush);
    }
  }

  private writeToFile(logs: LogEntry[]): void {
    // In a real implementation, you would write to a rotating log file
    // For now, we'll store in localStorage for browser environments
    try {
      const existingLogs = JSON.parse(localStorage.getItem('interactive_message_logs') || '[]');
      const allLogs = [...existingLogs, ...logs];
      
      // Keep only recent logs to prevent storage overflow
      const maxLogs = 1000;
      const recentLogs = allLogs.slice(-maxLogs);
      
      localStorage.setItem('interactive_message_logs', JSON.stringify(recentLogs));
    } catch (error) {
      console.error('Failed to write logs to storage:', error);
    }
  }

  private async sendToRemote(logs: LogEntry[]): Promise<void> {
    if (!this.config.remoteEndpoint || !this.config.apiKey) return;

    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          logs,
          source: 'interactive-message-system',
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.error('Failed to send logs to remote service:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending logs to remote service:', error);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  // Utility methods
  private generateId(): string {
    return `log_${Date.now()}_${++this.logCounter}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    // Remove sensitive information
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization'];
    
    if (typeof data === 'object') {
      const sanitized = { ...data };
      
      for (const key of sensitiveKeys) {
        if (key in sanitized) {
          sanitized[key] = '[REDACTED]';
        }
      }
      
      return sanitized;
    }
    
    return data;
  }

  // Public utility methods
  getLogs(category?: LogCategory, level?: LogLevel, limit = 100): LogEntry[] {
    try {
      const storedLogs = JSON.parse(localStorage.getItem('interactive_message_logs') || '[]');
      let filteredLogs = storedLogs;

      if (category) {
        filteredLogs = filteredLogs.filter((log: LogEntry) => log.category === category);
      }

      if (level !== undefined) {
        filteredLogs = filteredLogs.filter((log: LogEntry) => log.level >= level);
      }

      return filteredLogs.slice(-limit);
    } catch (error) {
      console.error('Failed to retrieve logs:', error);
      return [];
    }
  }

  clearLogs(): void {
    try {
      localStorage.removeItem('interactive_message_logs');
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }

  getLogStats(): { total: number; byLevel: Record<string, number>; byCategory: Record<string, number> } {
    try {
      const logs = JSON.parse(localStorage.getItem('interactive_message_logs') || '[]');
      
      const stats = {
        total: logs.length,
        byLevel: {} as Record<string, number>,
        byCategory: {} as Record<string, number>
      };

      for (const log of logs) {
        const levelName = LogLevel[log.level];
        stats.byLevel[levelName] = (stats.byLevel[levelName] || 0) + 1;
        stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return { total: 0, byLevel: {}, byCategory: {} };
    }
  }

  // Cleanup
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(); // Final flush
  }
}

// Global logger instance
export const logger = new InteractiveMessageLogger({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  enableRemote: process.env.NODE_ENV === 'production',
  remoteEndpoint: process.env.LOG_ENDPOINT,
  apiKey: process.env.LOG_API_KEY
});

// Utility functions for common logging patterns
export function logApiCall<T>(
  operation: string,
  apiCall: () => Promise<T>,
  context?: LogEntry['context']
): Promise<T> {
  const timerId = logger.startPerformanceTimer(operation, LOG_CATEGORIES.API_REQUEST, context);
  
  return apiCall()
    .then(result => {
      logger.endPerformanceTimer(timerId, operation, LOG_CATEGORIES.API_REQUEST, context, { success: true });
      return result;
    })
    .catch(error => {
      logger.endPerformanceTimer(timerId, operation, LOG_CATEGORIES.API_REQUEST, context, { success: false });
      logger.error(`API call failed: ${operation}`, LOG_CATEGORIES.API_REQUEST, error, context);
      throw error;
    });
}

export function logDatabaseQuery<T>(
  query: string,
  operation: () => Promise<T>,
  context?: LogEntry['context']
): Promise<T> {
  const timerId = logger.startPerformanceTimer(`DB: ${query}`, LOG_CATEGORIES.DATABASE, context);
  
  return operation()
    .then(result => {
      logger.endPerformanceTimer(timerId, `DB: ${query}`, LOG_CATEGORIES.DATABASE, context, { success: true });
      return result;
    })
    .catch(error => {
      logger.endPerformanceTimer(timerId, `DB: ${query}`, LOG_CATEGORIES.DATABASE, context, { success: false });
      logger.error(`Database query failed: ${query}`, LOG_CATEGORIES.DATABASE, error, context);
      throw error;
    });
}

export function logUserAction(action: string, context?: LogEntry['context'], data?: any): void {
  logger.logUserAction(action, context, data);
}

export function logValidationError(field: string, error: string, context?: LogEntry['context'], data?: any): void {
  logger.logValidationError(field, error, context, data);
}

export function logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: LogEntry['context'], data?: any): void {
  logger.logSecurityEvent(event, severity, context, data);
}

// Export the logger class for custom instances
export { InteractiveMessageLogger };