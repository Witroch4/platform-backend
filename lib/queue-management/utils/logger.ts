/**
 * Logger Utility for Queue Management System
 * 
 * Structured logging with different levels and context support
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogContext {
  queueName?: string
  jobId?: string
  userId?: string
  correlationId?: string
  requestId?: string
  [key: string]: any
}

export interface LogEntry {
  timestamp: Date
  level: LogLevel
  message: string
  context?: LogContext
  error?: Error
  module: string
}

/**
 * Logger class with structured logging support
 */
export class Logger {
  private module: string
  private logLevel: LogLevel
  private context: LogContext

  constructor(module: string, context: LogContext = {}) {
    this.module = module
    this.context = context
    this.logLevel = this.getLogLevelFromEnv()
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger(this.module, { ...this.context, ...context })
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log(LogLevel.ERROR, message, error, context)
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log(LogLevel.WARN, message, undefined, context)
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log(LogLevel.INFO, message, undefined, context)
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log(LogLevel.DEBUG, message, undefined, context)
    }
  }

  /**
   * Log trace message
   */
  trace(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.log(LogLevel.TRACE, message, undefined, context)
    }
  }

  /**
   * Log performance metrics
   */
  performance(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation} completed in ${duration}ms`, {
      ...context,
      operation,
      duration,
      type: 'performance'
    })
  }

  /**
   * Log audit events
   */
  audit(action: string, userId: string, resource: string, context?: LogContext): void {
    this.info(`Audit: ${action} on ${resource} by ${userId}`, {
      ...context,
      action,
      userId,
      resource,
      type: 'audit'
    })
  }

  /**
   * Log security events
   */
  security(event: string, userId?: string, context?: LogContext): void {
    this.warn(`Security: ${event}${userId ? ` (user: ${userId})` : ''}`, {
      ...context,
      event,
      userId,
      type: 'security'
    })
  }

  private log(level: LogLevel, message: string, error?: Error | any, context?: LogContext): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: { ...this.context, ...context },
      error: error instanceof Error ? error : undefined,
      module: this.module
    }

    // Format and output the log entry
    this.output(entry, error)
  }

  private output(entry: LogEntry, error?: any): void {
    const levelName = LogLevel[entry.level]
    const timestamp = entry.timestamp.toISOString()
    
    // Create base log object
    const logObj: any = {
      timestamp,
      level: levelName,
      module: entry.module,
      message: entry.message,
      ...entry.context
    }

    // Add error information if present
    if (entry.error) {
      logObj.error = {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack
      }
    } else if (error && typeof error === 'object') {
      logObj.error = error
    }

    // Output based on environment
    if (process.env.NODE_ENV === 'production') {
      // Structured JSON logging for production
      console.log(JSON.stringify(logObj))
    } else {
      // Human-readable logging for development
      const colorCode = this.getColorCode(entry.level)
      const resetCode = '\x1b[0m'
      
      let output = `${colorCode}[${timestamp}] ${levelName.padEnd(5)} ${entry.module}: ${entry.message}${resetCode}`
      
      if (Object.keys(entry.context || {}).length > 0) {
        output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`
      }
      
      if (entry.error) {
        output += `\n  Error: ${entry.error.message}`
        if (entry.error.stack) {
          output += `\n  Stack: ${entry.error.stack}`
        }
      } else if (error) {
        output += `\n  Error: ${JSON.stringify(error, null, 2)}`
      }
      
      console.log(output)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel
  }

  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase()
    switch (envLevel) {
      case 'ERROR':
        return LogLevel.ERROR
      case 'WARN':
        return LogLevel.WARN
      case 'INFO':
        return LogLevel.INFO
      case 'DEBUG':
        return LogLevel.DEBUG
      case 'TRACE':
        return LogLevel.TRACE
      default:
        return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG
    }
  }

  private getColorCode(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return '\x1b[31m' // Red
      case LogLevel.WARN:
        return '\x1b[33m' // Yellow
      case LogLevel.INFO:
        return '\x1b[36m' // Cyan
      case LogLevel.DEBUG:
        return '\x1b[35m' // Magenta
      case LogLevel.TRACE:
        return '\x1b[37m' // White
      default:
        return '\x1b[0m' // Reset
    }
  }
}

/**
 * Create a logger instance
 */
export function createLogger(module: string, context?: LogContext): Logger {
  return new Logger(module, context)
}

/**
 * Default logger instance
 */
export const logger = new Logger('QueueManagement')

/**
 * Performance measurement decorator
 */
export function measurePerformance(logger: Logger, operation: string) {
  return function (target: any, propertyName: string) {
    const method = target[propertyName]

    target[propertyName] = async function (...args: any[]) {
      const start = Date.now()
      try {
        const result = await method.apply(this, args)
        const duration = Date.now() - start
        logger.performance(operation, duration, { method: propertyName })
        return result
      } catch (error: any) {
        const duration = Date.now() - start
        logger.performance(`${operation} (failed)`, duration, { 
          method: propertyName, 
          error: error?.message || 'Unknown error'
        })
        throw error
      }
    }
  }
}

/**
 * Audit logging decorator
 */
export function auditLog(logger: Logger, action: string) {
  return function (target: any, propertyName: string) {
    const method = target[propertyName]

    target[propertyName] = async function (...args: any[]) {
      const context = (this as any).getAuditContext ? (this as any).getAuditContext() : {}
      try {
        const result = await method.apply(this, args)
        logger.audit(action, context.userId || 'system', context.resource || propertyName, {
          method: propertyName,
          args: args.length > 0 ? args[0] : undefined
        })
        return result
      } catch (error: any) {
        logger.audit(`${action} (failed)`, context.userId || 'system', context.resource || propertyName, {
          method: propertyName,
          error: error?.message || 'Unknown error'
        })
        throw error
      }
    }
  }
}

export default Logger