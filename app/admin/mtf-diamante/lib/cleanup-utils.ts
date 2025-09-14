// app/admin/mtf-diamante/lib/cleanup-utils.ts
// Utilities for code cleanup and maintenance

/**
 * Development-only logging utility
 * Automatically strips logs in production builds
 */
export const devLog = {
  log: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(...args);
    }
  },
  
  group: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.group(label);
    }
  },
  
  groupEnd: () => {
    if (process.env.NODE_ENV === 'development') {
      console.groupEnd();
    }
  },
  
  time: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.time(label);
    }
  },
  
  timeEnd: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(label);
    }
  }
};

/**
 * Deprecated function wrapper
 * Shows warnings in development and tracks usage
 */
export function deprecated<T extends (...args: any[]) => any>(
  fn: T,
  message: string,
  alternative?: string
): T {
  return ((...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      const fullMessage = alternative 
        ? `⚠️ [DEPRECATED] ${message}. Use ${alternative} instead.`
        : `⚠️ [DEPRECATED] ${message}`;
      
      console.warn(fullMessage);
      
      // Stack trace to help identify usage
      console.trace('Deprecated function called from:');
    }
    
    return fn(...args);
  }) as T;
}

/**
 * TODO tracker for development
 * Helps identify areas that need attention
 */
export function todo(message: string, priority: 'low' | 'medium' | 'high' = 'medium') {
  if (process.env.NODE_ENV === 'development') {
    const emoji = priority === 'high' ? '🚨' : priority === 'medium' ? '⚠️' : '📝';
    console.warn(`${emoji} [TODO] ${message}`);
  }
}

/**
 * Performance measurement utility
 * Only active in development
 */
export class DevPerformanceMeasure {
  private startTime: number = 0;
  private label: string;
  
  constructor(label: string) {
    this.label = label;
    if (process.env.NODE_ENV === 'development') {
      this.startTime = performance.now();
      console.time(label);
    }
  }
  
  end() {
    if (process.env.NODE_ENV === 'development') {
      const duration = performance.now() - this.startTime;
      console.timeEnd(this.label);
      
      if (duration > 100) {
        console.warn(`⏱️ [Performance] ${this.label} took ${duration.toFixed(2)}ms (>100ms)`);
      }
    }
  }
}

/**
 * Memory usage tracker
 * Only active in development
 */
export function trackMemoryUsage(context: string) {
  if (process.env.NODE_ENV === 'development' && 'memory' in performance) {
    const memory = (performance as any).memory;
    const used = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    const total = Math.round(memory.totalJSHeapSize / 1024 / 1024);
    const limit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
    
    devLog.log(`🧠 [${context}] Memory: ${used}MB used, ${total}MB total, ${limit}MB limit`);
    
    // Warn if memory usage is high
    if (used > limit * 0.8) {
      devLog.warn(`⚠️ [${context}] High memory usage: ${used}MB (${((used/limit)*100).toFixed(1)}% of limit)`);
    }
  }
}

/**
 * Code cleanup checklist
 * Helps ensure code quality standards
 */
export const cleanupChecklist = {
  /**
   * Check if all console.log statements are wrapped in development checks
   */
  checkConsoleStatements: () => {
    if (process.env.NODE_ENV === 'development') {
      devLog.log('✅ Console statements should be wrapped in development checks');
      devLog.log('✅ Use devLog utility instead of direct console calls');
    }
  },
  
  /**
   * Check if all TODO comments are tracked
   */
  checkTodoComments: () => {
    if (process.env.NODE_ENV === 'development') {
      devLog.log('✅ TODO comments should use todo() utility for tracking');
    }
  },
  
  /**
   * Check if deprecated functions are properly marked
   */
  checkDeprecatedFunctions: () => {
    if (process.env.NODE_ENV === 'development') {
      devLog.log('✅ Deprecated functions should use deprecated() wrapper');
    }
  },
  
  /**
   * Check if performance-critical code is measured
   */
  checkPerformanceMeasurement: () => {
    if (process.env.NODE_ENV === 'development') {
      devLog.log('✅ Performance-critical code should use DevPerformanceMeasure');
    }
  }
};

/**
 * Legacy code migration helper
 * Helps track migration progress
 */
export class LegacyMigrationTracker {
  private static migrations: Map<string, { completed: boolean; notes?: string }> = new Map();
  
  static markCompleted(migrationId: string, notes?: string) {
    this.migrations.set(migrationId, { completed: true, notes });
    
    if (process.env.NODE_ENV === 'development') {
      devLog.log(`✅ [Migration] ${migrationId} completed${notes ? `: ${notes}` : ''}`);
    }
  }
  
  static markPending(migrationId: string, notes?: string) {
    this.migrations.set(migrationId, { completed: false, notes });
    
    if (process.env.NODE_ENV === 'development') {
      devLog.warn(`⏳ [Migration] ${migrationId} pending${notes ? `: ${notes}` : ''}`);
    }
  }
  
  static getStatus() {
    if (process.env.NODE_ENV === 'development') {
      const completed = Array.from(this.migrations.entries()).filter(([_, status]) => status.completed);
      const pending = Array.from(this.migrations.entries()).filter(([_, status]) => !status.completed);
      
      devLog.group('📊 Migration Status');
      devLog.log(`✅ Completed: ${completed.length}`);
      devLog.log(`⏳ Pending: ${pending.length}`);
      
      if (pending.length > 0) {
        devLog.group('Pending Migrations:');
        pending.forEach(([id, status]) => {
          devLog.warn(`- ${id}${status.notes ? ` (${status.notes})` : ''}`);
        });
        devLog.groupEnd();
      }
      
      devLog.groupEnd();
    }
    
    return {
      completed: Array.from(this.migrations.entries()).filter(([_, status]) => status.completed).length,
      pending: Array.from(this.migrations.entries()).filter(([_, status]) => !status.completed).length,
      total: this.migrations.size
    };
  }
}

/**
 * Code quality metrics
 * Helps track code quality improvements
 */
export const codeQualityMetrics = {
  /**
   * Track function complexity
   */
  trackComplexity: (functionName: string, complexity: number) => {
    if (process.env.NODE_ENV === 'development') {
      if (complexity > 10) {
        devLog.warn(`🔴 [Complexity] ${functionName} has high complexity: ${complexity}`);
      } else if (complexity > 5) {
        devLog.warn(`🟡 [Complexity] ${functionName} has moderate complexity: ${complexity}`);
      } else {
        devLog.log(`🟢 [Complexity] ${functionName} has low complexity: ${complexity}`);
      }
    }
  },
  
  /**
   * Track file size
   */
  trackFileSize: (fileName: string, lines: number) => {
    if (process.env.NODE_ENV === 'development') {
      if (lines > 500) {
        devLog.warn(`🔴 [File Size] ${fileName} is very large: ${lines} lines`);
      } else if (lines > 300) {
        devLog.warn(`🟡 [File Size] ${fileName} is large: ${lines} lines`);
      }
    }
  },
  
  /**
   * Track import count
   */
  trackImports: (fileName: string, importCount: number) => {
    if (process.env.NODE_ENV === 'development') {
      if (importCount > 20) {
        devLog.warn(`🔴 [Imports] ${fileName} has many imports: ${importCount}`);
      } else if (importCount > 15) {
        devLog.warn(`🟡 [Imports] ${fileName} has moderate imports: ${importCount}`);
      }
    }
  }
};

// Initialize migration tracking for MTF Diamante refactor
// REMOVIDO: Logs de migration desnecessários que só geram ruído no console
// As migrações já foram concluídas e não precisam mais ser logadas