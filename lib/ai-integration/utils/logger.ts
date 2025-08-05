/**
 * Structured Logging for AI Integration
 * Based on requirements 6.3, 14.1, 14.2
 */

export interface LogContext {
  traceId: string;
  accountId?: number;
  conversationId?: number;
  messageId?: string;
  jobId?: string;
  stage: 'webhook' | 'queue' | 'classify' | 'generate' | 'deliver' | 'admin';
  channel?: 'whatsapp' | 'instagram' | 'messenger';
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context: LogContext;
  service: string;
  version: string;
  environment: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class StructuredLogger {
  private service: string;
  private version: string;
  private environment: string;
  private logLevel: LogLevel;

  constructor(options: {
    service: string;
    version?: string;
    environment?: string;
    logLevel?: LogLevel;
  }) {
    this.service = options.service;
    this.version = options.version || '1.0.0';
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.logLevel = options.logLevel || (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatLog(level: LogLevel, message: string, context: Partial<LogContext>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context as LogContext,
      service: this.service,
      version: this.version,
      environment: this.environment,
    };
  }

  private output(logEntry: LogEntry): void {
    const logString = JSON.stringify(logEntry);
    
    switch (logEntry.level) {
      case 'error':
        console.error(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      case 'debug':
        console.debug(logString);
        break;
      default:
        console.log(logString);
    }
  }

  info(message: string, context: Partial<LogContext> = {}): void {
    if (!this.shouldLog('info')) return;
    this.output(this.formatLog('info', message, context));
  }

  warn(message: string, context: Partial<LogContext> = {}): void {
    if (!this.shouldLog('warn')) return;
    this.output(this.formatLog('warn', message, context));
  }

  error(message: string, context: Partial<LogContext> = {}): void {
    if (!this.shouldLog('error')) return;
    this.output(this.formatLog('error', message, context));
  }

  debug(message: string, context: Partial<LogContext> = {}): void {
    if (!this.shouldLog('debug')) return;
    this.output(this.formatLog('debug', message, context));
  }

  // Convenience methods for specific stages
  webhook(message: string, context: Partial<LogContext> = {}): void {
    this.info(message, { ...context, stage: 'webhook' });
  }

  queue(message: string, context: Partial<LogContext> = {}): void {
    this.info(message, { ...context, stage: 'queue' });
  }

  classify(message: string, context: Partial<LogContext> = {}): void {
    this.info(message, { ...context, stage: 'classify' });
  }

  generate(message: string, context: Partial<LogContext> = {}): void {
    this.info(message, { ...context, stage: 'generate' });
  }

  deliver(message: string, context: Partial<LogContext> = {}): void {
    this.info(message, { ...context, stage: 'deliver' });
  }

  // Performance logging
  performance(message: string, startTime: number, context: Partial<LogContext> = {}): void {
    const duration = Date.now() - startTime;
    this.info(message, { ...context, duration });
  }

  // Error with stack trace
  errorWithStack(message: string, error: Error, context: Partial<LogContext> = {}): void {
    this.error(message, {
      ...context,
      error: error.message,
      metadata: {
        stack: error.stack,
        name: error.name,
      },
    });
  }

  // Child logger with inherited context
  child(inheritedContext: Partial<LogContext>): StructuredLogger {
    const childLogger = new StructuredLogger({
      service: this.service,
      version: this.version,
      environment: this.environment,
      logLevel: this.logLevel,
    });

    // Override methods to include inherited context
    const originalMethods = ['info', 'warn', 'error', 'debug'];
    originalMethods.forEach((method) => {
      const originalMethod = (childLogger as any)[method];
      (childLogger as any)[method] = (message: string, context: Partial<LogContext> = {}) => {
        originalMethod.call(childLogger, message, { ...inheritedContext, ...context });
      };
    });

    return childLogger;
  }
}

// Create default logger instance
export const aiLogger = new StructuredLogger({
  service: 'chatwit-ai-integration',
  version: process.env.APP_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  logLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
});

// Export types and logger
export { StructuredLogger };
export default aiLogger;