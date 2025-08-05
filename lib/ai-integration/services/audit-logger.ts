/**
 * Audit Logger Service
 * 
 * Handles creation of audit logs with PII masking for LGPD compliance.
 * Provides structured logging for LLM operations and intent classification.
 */

import { getPrismaInstance } from '@/lib/connections';
import log from '@/lib/log';
import { maskPII, sanitizeForAudit } from '../utils/pii-masking';

/**
 * Interface for LLM audit log entry
 */
export interface LlmAuditEntry {
  conversationId: string;
  messageId: string;
  mode: 'INTENT_CLASSIFY' | 'DYNAMIC_GENERATE';
  inputText: string;
  resultJson: any;
  score?: number;
  traceId?: string;
  accountId?: number;
  channel?: string;
  processingTimeMs?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Interface for intent hit log entry
 */
export interface IntentHitLogEntry {
  conversationId: string;
  messageId: string;
  candidateName: string;
  similarity: number;
  chosen: boolean;
  traceId?: string;
  accountId?: number;
  threshold?: number;
  processingTimeMs?: number;
}

/**
 * Interface for audit log creation result
 */
export interface AuditLogResult {
  id: string;
  piiDetected: boolean;
  maskedFields: string[];
  originalLength: number;
  maskedLength: number;
}

/**
 * Creates an LLM audit log entry with PII masking
 */
export async function createLlmAuditLog(entry: LlmAuditEntry): Promise<AuditLogResult> {
  try {
    // Mask PII in input text
    const piiResult = maskPII(entry.inputText);
    
    // Sanitize result JSON to remove any PII
    const sanitizedResult = sanitizeForAudit(entry.resultJson);
    
    // Add processing metadata
    const auditData = {
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      mode: entry.mode,
      inputText: piiResult.maskedText,
      resultJson: {
        ...sanitizedResult,
        _metadata: {
          piiDetected: piiResult.hasPII,
          detectedTypes: piiResult.detectedTypes,
          originalLength: piiResult.originalLength,
          maskedLength: piiResult.maskedLength,
          processingTimeMs: entry.processingTimeMs,
          tokenUsage: entry.tokenUsage,
          accountId: entry.accountId,
          channel: entry.channel,
          timestamp: new Date().toISOString()
        }
      },
      score: entry.score,
      traceId: entry.traceId
    };
    
    // Create audit log entry
    const auditLog = await getPrismaInstance().llmAudit.create({
      data: {
        ...auditData,
        accountId: String(entry.accountId || 1) // Default account ID if not provided
      }
    });
    
    // Log the audit creation (without PII)
    log.info('LLM audit log created', {
      auditId: auditLog.id,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      mode: entry.mode,
      piiDetected: piiResult.hasPII,
      detectedTypes: piiResult.detectedTypes,
      traceId: entry.traceId
    });
    
    return {
      id: auditLog.id,
      piiDetected: piiResult.hasPII,
      maskedFields: piiResult.detectedTypes,
      originalLength: piiResult.originalLength,
      maskedLength: piiResult.maskedLength
    };
    
  } catch (error) {
    log.error('Failed to create LLM audit log', {
      error,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      mode: entry.mode,
      traceId: entry.traceId
    });
    throw error;
  }
}

/**
 * Creates an intent hit log entry
 */
export async function createIntentHitLog(entry: IntentHitLogEntry): Promise<AuditLogResult> {
  try {
    const auditData = {
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      candidateName: entry.candidateName,
      similarity: entry.similarity,
      chosen: entry.chosen,
      traceId: entry.traceId
    };
    
    // Create intent hit log entry
    const hitLog = await getPrismaInstance().intentHitLog.create({
      data: {
        ...auditData,
        accountId: String(entry.accountId || 1), // Default account ID if not provided
        intent: {
          connect: { name: entry.candidateName }
        } // Connect to existing intent
      }
    });
    
    // Log the creation
    log.info('Intent hit log created', {
      hitLogId: hitLog.id,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      candidateName: entry.candidateName,
      similarity: entry.similarity,
      chosen: entry.chosen,
      traceId: entry.traceId
    });
    
    return {
      id: hitLog.id,
      piiDetected: false,
      maskedFields: [],
      originalLength: 0,
      maskedLength: 0
    };
    
  } catch (error) {
    log.error('Failed to create intent hit log', {
      error,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      candidateName: entry.candidateName,
      traceId: entry.traceId
    });
    throw error;
  }
}

/**
 * Creates multiple intent hit logs in batch (for classification candidates)
 */
export async function createIntentHitLogBatch(entries: IntentHitLogEntry[]): Promise<AuditLogResult[]> {
  try {
    const results: AuditLogResult[] = [];
    
    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      const batchPromises = batch.map(entry => createIntentHitLog(entry));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);
    }
    
    log.info('Intent hit log batch created', {
      totalEntries: entries.length,
      batchCount: Math.ceil(entries.length / batchSize),
      traceId: entries[0]?.traceId
    });
    
    return results;
    
  } catch (error) {
    log.error('Failed to create intent hit log batch', {
      error,
      entriesCount: entries.length,
      traceId: entries[0]?.traceId
    });
    throw error;
  }
}

/**
 * Retrieves audit logs with optional filtering (admin only)
 */
export async function getAuditLogs(options: {
  conversationId?: string;
  messageId?: string;
  mode?: 'INTENT_CLASSIFY' | 'DYNAMIC_GENERATE';
  traceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  logs: any[];
  total: number;
  hasMore: boolean;
}> {
  try {
    const {
      conversationId,
      messageId,
      mode,
      traceId,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;
    
    const where: any = {};
    
    if (conversationId) where.conversationId = conversationId;
    if (messageId) where.messageId = messageId;
    if (mode) where.mode = mode;
    if (traceId) where.traceId = traceId;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    
    const [logs, total] = await Promise.all([
      getPrismaInstance().llmAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          conversationId: true,
          messageId: true,
          mode: true,
          inputText: true, // Already masked
          resultJson: true,
          score: true,
          traceId: true,
          createdAt: true,
          expiresAt: true
        }
      }),
      getPrismaInstance().llmAudit.count({ where })
    ]);
    
    return {
      logs,
      total,
      hasMore: offset + limit < total
    };
    
  } catch (error) {
    log.error('Failed to retrieve audit logs', { error, options });
    throw error;
  }
}

/**
 * Retrieves intent hit logs with optional filtering (admin only)
 */
export async function getIntentHitLogs(options: {
  conversationId?: string;
  messageId?: string;
  candidateName?: string;
  chosen?: boolean;
  traceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  logs: any[];
  total: number;
  hasMore: boolean;
}> {
  try {
    const {
      conversationId,
      messageId,
      candidateName,
      chosen,
      traceId,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;
    
    const where: any = {};
    
    if (conversationId) where.conversationId = conversationId;
    if (messageId) where.messageId = messageId;
    if (candidateName) where.candidateName = candidateName;
    if (typeof chosen === 'boolean') where.chosen = chosen;
    if (traceId) where.traceId = traceId;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    
    const [logs, total] = await Promise.all([
      getPrismaInstance().intentHitLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      getPrismaInstance().intentHitLog.count({ where })
    ]);
    
    return {
      logs,
      total,
      hasMore: offset + limit < total
    };
    
  } catch (error) {
    log.error('Failed to retrieve intent hit logs', { error, options });
    throw error;
  }
}

/**
 * Deletes audit logs by conversation ID (for LGPD right to be forgotten)
 */
export async function deleteAuditLogsByConversation(conversationId: string): Promise<{
  llmAuditDeleted: number;
  intentHitLogDeleted: number;
}> {
  try {
    log.info('Deleting audit logs for conversation', { conversationId });
    
    const [llmAuditResult, intentHitLogResult] = await Promise.all([
      getPrismaInstance().llmAudit.deleteMany({
        where: { conversationId }
      }),
      getPrismaInstance().intentHitLog.deleteMany({
        where: { conversationId }
      })
    ]);
    
    const result = {
      llmAuditDeleted: llmAuditResult.count,
      intentHitLogDeleted: intentHitLogResult.count
    };
    
    log.info('Audit logs deleted for conversation', {
      conversationId,
      ...result
    });
    
    return result;
    
  } catch (error) {
    log.error('Failed to delete audit logs by conversation', {
      error,
      conversationId
    });
    throw error;
  }
}

/**
 * Gets audit log statistics for monitoring
 */
export async function getAuditLogStats(): Promise<{
  llmAudit: {
    total: number;
    byMode: Record<string, number>;
    last24h: number;
    averageScore: number;
  };
  intentHitLog: {
    total: number;
    successful: number;
    successRate: number;
    last24h: number;
    averageSimilarity: number;
  };
}> {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [
      llmAuditTotal,
      llmAuditLast24h,
      llmAuditByMode,
      llmAuditScoreStats,
      intentHitLogTotal,
      intentHitLogSuccessful,
      intentHitLogLast24h,
      intentHitLogSimilarityStats
    ] = await Promise.all([
      getPrismaInstance().llmAudit.count(),
      getPrismaInstance().llmAudit.count({ where: { createdAt: { gte: yesterday } } }),
      getPrismaInstance().llmAudit.groupBy({
        by: ['mode'],
        _count: { id: true }
      }),
      getPrismaInstance().llmAudit.aggregate({
        _avg: { score: true }
      }),
      getPrismaInstance().intentHitLog.count(),
      getPrismaInstance().intentHitLog.count({ where: { chosen: true } }),
      getPrismaInstance().intentHitLog.count({ where: { createdAt: { gte: yesterday } } }),
      getPrismaInstance().intentHitLog.aggregate({
        _avg: { similarity: true }
      })
    ]);
    
    return {
      llmAudit: {
        total: llmAuditTotal,
        byMode: llmAuditByMode.reduce((acc, item) => {
          acc[item.mode] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
        last24h: llmAuditLast24h,
        averageScore: llmAuditScoreStats._avg.score || 0
      },
      intentHitLog: {
        total: intentHitLogTotal,
        successful: intentHitLogSuccessful,
        successRate: intentHitLogTotal > 0 ? (intentHitLogSuccessful / intentHitLogTotal) * 100 : 0,
        last24h: intentHitLogLast24h,
        averageSimilarity: intentHitLogSimilarityStats._avg.similarity || 0
      }
    };
    
  } catch (error) {
    log.error('Failed to get audit log statistics', { error });
    throw error;
  }
}