import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from "@/lib/connections";
import { Queue } from "bullmq";
import { createDeadLetterQueue } from "./queue-config";
import log from "@/lib/log";

const prisma = getPrismaInstance();

/**
 * Tipos de erro para classificação
 */
export enum CostErrorType {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  PRICING_ERROR = "PRICING_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Interface para contexto de erro
 */
export interface ErrorContext {
  jobId?: string;
  jobName?: string;
  eventData?: any;
  attemptsMade?: number;
  maxAttempts?: number;
  provider?: string;
  product?: string;
  unit?: string;
  externalId?: string;
  traceId?: string;
  sessionId?: string;
  inboxId?: string;
  userId?: string;
}

/**
 * Interface para log de erro estruturado
 */
export interface CostErrorLog {
  id: string;
  timestamp: Date;
  errorType: CostErrorType;
  message: string;
  stack?: string;
  context: ErrorContext;
  isRetryable: boolean;
  severity: "low" | "medium" | "high" | "critical";
}

/**
 * Serviço de tratamento de erros para o sistema de custos
 */
export class CostErrorHandler {
  private dlq: Queue;
  private redis: any;

  constructor() {
    this.dlq = createDeadLetterQueue();
    this.redis = getRedisInstance();
  }

  /**
   * Classifica o tipo de erro baseado na mensagem/stack
   */
  private classifyError(error: Error): CostErrorType {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || "";

    if (message.includes("validation") || message.includes("invalid")) {
      return CostErrorType.VALIDATION_ERROR;
    }

    if (message.includes("price") || message.includes("pricing")) {
      return CostErrorType.PRICING_ERROR;
    }

    if (
      message.includes("database") ||
      message.includes("prisma") ||
      message.includes("connection") ||
      stack.includes("prisma")
    ) {
      return CostErrorType.DATABASE_ERROR;
    }

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("timeout") ||
      message.includes("econnreset")
    ) {
      return CostErrorType.NETWORK_ERROR;
    }

    if (message.includes("timeout")) {
      return CostErrorType.TIMEOUT_ERROR;
    }

    return CostErrorType.UNKNOWN_ERROR;
  }

  /**
   * Determina se um erro é retryable
   */
  private isRetryableError(errorType: CostErrorType): boolean {
    switch (errorType) {
      case CostErrorType.NETWORK_ERROR:
      case CostErrorType.TIMEOUT_ERROR:
      case CostErrorType.DATABASE_ERROR:
        return true;

      case CostErrorType.VALIDATION_ERROR:
      case CostErrorType.PRICING_ERROR:
        return false;

      case CostErrorType.UNKNOWN_ERROR:
      default:
        return true; // Por segurança, tenta retry em erros desconhecidos
    }
  }

  /**
   * Determina a severidade do erro
   */
  private getErrorSeverity(
    errorType: CostErrorType,
    context: ErrorContext
  ): "low" | "medium" | "high" | "critical" {
    // Erros críticos que afetam funcionalidade principal
    if (errorType === CostErrorType.DATABASE_ERROR) {
      return "critical";
    }

    // Erros de validação são de alta prioridade pois indicam problemas de dados
    if (errorType === CostErrorType.VALIDATION_ERROR) {
      return "high";
    }

    // Erros de precificação são médios pois podem ser resolvidos com reprocessamento
    if (errorType === CostErrorType.PRICING_ERROR) {
      return "medium";
    }

    // Erros de rede são baixos pois geralmente são temporários
    if (
      errorType === CostErrorType.NETWORK_ERROR ||
      errorType === CostErrorType.TIMEOUT_ERROR
    ) {
      return "low";
    }

    return "medium";
  }

  /**
   * Processa um erro e decide a estratégia de tratamento
   */
  async handleError(
    error: Error,
    context: ErrorContext
  ): Promise<{
    shouldRetry: boolean;
    retryDelay?: number;
    shouldMoveToDeadLetter: boolean;
  }> {
    const errorType = this.classifyError(error);
    const isRetryable = this.isRetryableError(errorType);
    const severity = this.getErrorSeverity(errorType, context);

    // Log estruturado do erro
    const errorLog: CostErrorLog = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      errorType,
      message: error.message,
      stack: error.stack,
      context,
      isRetryable,
      severity,
    };

    await this.logError(errorLog);

    // Determina se deve fazer retry
    const attemptsMade = context.attemptsMade || 0;
    const maxAttempts = context.maxAttempts || 3;
    const shouldRetry = isRetryable && attemptsMade < maxAttempts;

    // Calcula delay de retry exponencial
    let retryDelay: number | undefined;
    if (shouldRetry) {
      retryDelay = this.calculateRetryDelay(attemptsMade, errorType);
    }

    // Decide se deve mover para Dead Letter Queue
    const shouldMoveToDeadLetter = !shouldRetry && attemptsMade >= maxAttempts;

    if (shouldMoveToDeadLetter) {
      await this.moveToDeadLetterQueue(errorLog, context);
    }

    // Incrementa métricas de erro
    await this.incrementErrorMetrics(errorType, severity);

    return {
      shouldRetry,
      retryDelay,
      shouldMoveToDeadLetter,
    };
  }

  /**
   * Calcula delay de retry baseado no tipo de erro e tentativas
   */
  private calculateRetryDelay(
    attemptsMade: number,
    errorType: CostErrorType
  ): number {
    const baseDelay = 1000; // 1 segundo
    const maxDelay = 60000; // 1 minuto

    let multiplier = 1;
    switch (errorType) {
      case CostErrorType.DATABASE_ERROR:
        multiplier = 2; // Retry mais rápido para problemas de DB
        break;
      case CostErrorType.NETWORK_ERROR:
      case CostErrorType.TIMEOUT_ERROR:
        multiplier = 3; // Retry mais lento para problemas de rede
        break;
      default:
        multiplier = 2;
    }

    // Exponential backoff com jitter
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(multiplier, attemptsMade),
      maxDelay
    );

    // Adiciona jitter para evitar thundering herd
    const jitter = Math.random() * 0.3; // ±30%
    return Math.floor(exponentialDelay * (1 + jitter));
  }

  /**
   * Log estruturado de erro
   */
  private async logError(errorLog: CostErrorLog): Promise<void> {
    // Log usando o sistema de logging existente
    log.error("Cost processing error", {
      errorId: errorLog.id,
      errorType: errorLog.errorType,
      message: errorLog.message,
      severity: errorLog.severity,
      isRetryable: errorLog.isRetryable,
      context: errorLog.context,
    });

    // Armazena no Redis para análise posterior
    try {
      const key = `cost:errors:${errorLog.id}`;
      await this.redis.setex(key, 86400 * 7, JSON.stringify(errorLog)); // 7 dias
    } catch (redisError) {
      console.error("Erro ao armazenar log de erro no Redis:", redisError);
    }
  }

  /**
   * Move job falhado para Dead Letter Queue
   */
  private async moveToDeadLetterQueue(
    errorLog: CostErrorLog,
    context: ErrorContext
  ): Promise<void> {
    try {
      await this.dlq.add("failed-cost-event", {
        errorLog,
        originalContext: context,
        failedAt: new Date().toISOString(),
        reason: "max_attempts_exceeded",
      });

      log.warn("Event moved to Dead Letter Queue", {
        errorId: errorLog.id,
        jobId: context.jobId,
        attempts: context.attemptsMade,
        errorType: errorLog.errorType,
      });
    } catch (dlqError) {
      log.error("Failed to move event to Dead Letter Queue", {
        errorId: errorLog.id,
        dlqError: dlqError?.toString(),
      });
    }
  }

  /**
   * Incrementa métricas de erro no Redis
   */
  private async incrementErrorMetrics(
    errorType: CostErrorType,
    severity: string
  ): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];
      const hour = new Date().getHours();

      await this.redis
        .multi()
        .hincrby(`cost:errors:daily:${today}`, errorType, 1)
        .hincrby(`cost:errors:daily:${today}`, `severity:${severity}`, 1)
        .hincrby(`cost:errors:hourly:${today}:${hour}`, errorType, 1)
        .expire(`cost:errors:daily:${today}`, 86400 * 30) // 30 dias
        .expire(`cost:errors:hourly:${today}:${hour}`, 86400 * 7) // 7 dias
        .exec();
    } catch (metricsError) {
      console.error("Erro ao incrementar métricas de erro:", metricsError);
    }
  }

  /**
   * Obtém estatísticas de erro
   */
  async getErrorStats(days: number = 7): Promise<{
    totalErrors: number;
    errorsByType: Record<CostErrorType, number>;
    errorsBySeverity: Record<string, number>;
    errorRate: number;
    topErrors: Array<{
      type: CostErrorType;
      count: number;
      percentage: number;
    }>;
  }> {
    try {
      const stats = {
        totalErrors: 0,
        errorsByType: {} as Record<CostErrorType, number>,
        errorsBySeverity: {} as Record<string, number>,
        errorRate: 0,
        topErrors: [] as Array<{
          type: CostErrorType;
          count: number;
          percentage: number;
        }>,
      };

      // Coleta dados dos últimos N dias
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const dayErrors = await this.redis.hgetall(
          `cost:errors:daily:${dateStr}`
        );

        for (const [key, value] of Object.entries(dayErrors)) {
          const count = parseInt(value as string) || 0;

          if (key.startsWith("severity:")) {
            const severity = key.replace("severity:", "");
            stats.errorsBySeverity[severity] =
              (stats.errorsBySeverity[severity] || 0) + count;
          } else if (
            Object.values(CostErrorType).includes(key as CostErrorType)
          ) {
            const errorType = key as CostErrorType;
            stats.errorsByType[errorType] =
              (stats.errorsByType[errorType] || 0) + count;
            stats.totalErrors += count;
          }
        }
      }

      // Calcula top errors
      stats.topErrors = Object.entries(stats.errorsByType)
        .map(([type, count]) => ({
          type: type as CostErrorType,
          count,
          percentage:
            stats.totalErrors > 0 ? (count / stats.totalErrors) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return stats;
    } catch (error) {
      console.error("Erro ao obter estatísticas de erro:", error);
      return {
        totalErrors: 0,
        errorsByType: {} as Record<CostErrorType, number>,
        errorsBySeverity: {} as Record<string, number>,
        errorRate: 0,
        topErrors: [],
      };
    }
  }

  /**
   * Verifica se a taxa de erro está acima do limite
   */
  async checkErrorRateAlert(threshold: number = 0.05): Promise<{
    alertTriggered: boolean;
    currentRate: number;
    threshold: number;
  }> {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Obtém total de jobs processados e erros do dia
      const [totalJobs, errorStats] = await Promise.all([
        this.redis.get(`cost:jobs:daily:${today}`) || "0",
        this.redis.hgetall(`cost:errors:daily:${today}`),
      ]);

      const totalJobsCount = parseInt(totalJobs);
      const totalErrors = Object.entries(errorStats)
        .filter(([key]) => !key.startsWith("severity:"))
        .reduce((sum, [, count]) => sum + parseInt(count as string), 0);

      const currentRate = totalJobsCount > 0 ? totalErrors / totalJobsCount : 0;
      const alertTriggered = currentRate > threshold;

      if (alertTriggered) {
        log.warn("Error rate alert triggered", {
          currentRate,
          threshold,
          totalJobs: totalJobsCount,
          totalErrors,
        });
      }

      return {
        alertTriggered,
        currentRate,
        threshold,
      };
    } catch (error) {
      console.error("Erro ao verificar taxa de erro:", error);
      return {
        alertTriggered: false,
        currentRate: 0,
        threshold,
      };
    }
  }

  /**
   * Limpa logs de erro antigos
   */
  async cleanupOldErrors(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let cleanedCount = 0;
      const pattern = "cost:errors:*";
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        try {
          const errorData = await this.redis.get(key);
          if (errorData) {
            const parsed = JSON.parse(errorData);
            const errorDate = new Date(parsed.timestamp);

            if (errorDate < cutoffDate) {
              await this.redis.del(key);
              cleanedCount++;
            }
          }
        } catch (parseError) {
          // Se não conseguir parsear, remove a chave
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      log.info("Cleaned up old error logs", { cleanedCount, daysToKeep });
      return cleanedCount;
    } catch (error) {
      console.error("Erro ao limpar logs antigos:", error);
      return 0;
    }
  }
}

/**
 * Instância singleton do error handler
 */
export const costErrorHandler = new CostErrorHandler();

/**
 * Função utilitária para tratar erros em jobs
 */
export async function handleJobError(
  error: Error,
  jobId: string,
  jobName: string,
  eventData: any,
  attemptsMade: number,
  maxAttempts: number
): Promise<{
  shouldRetry: boolean;
  retryDelay?: number;
  shouldMoveToDeadLetter: boolean;
}> {
  const context: ErrorContext = {
    jobId,
    jobName,
    eventData,
    attemptsMade,
    maxAttempts,
    provider: eventData?.provider,
    product: eventData?.product,
    unit: eventData?.unit,
    externalId: eventData?.externalId,
    traceId: eventData?.traceId,
    sessionId: eventData?.sessionId,
    inboxId: eventData?.inboxId,
    userId: eventData?.userId,
  };

  return costErrorHandler.handleError(error, context);
}
