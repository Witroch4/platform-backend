/**
 * Payload Sampling and Redaction
 * Based on requirements 12.2, 6.3
 */

import { defaultRedactor } from './pii-redaction';
import { aiLogger } from './logger';
import { aiMetrics } from './metrics';

export interface SamplingConfig {
  enabled: boolean;
  sampleRate: number; // Percentage (0-100)
  maxPayloadSize: number; // Maximum payload size to sample (bytes)
  retentionHours: number; // How long to keep samples
  redactionEnabled: boolean;
  storageType: 'memory' | 'file' | 'database';
  maxSamples: number; // Maximum number of samples to keep in memory
}

export interface PayloadSample {
  id: string;
  timestamp: number;
  type: 'webhook_incoming' | 'webhook_outgoing' | 'llm_request' | 'llm_response' | 'chatwit_request' | 'chatwit_response';
  accountId?: number;
  conversationId?: number;
  messageId?: string;
  traceId?: string;
  originalSize: number;
  redactedPayload: any;
  metadata: {
    channel?: string;
    stage?: string;
    success?: boolean;
    latency?: number;
    [key: string]: any;
  };
}

export interface SamplingReport {
  totalSamples: number;
  samplesByType: Record<string, number>;
  samplesByAccount: Record<string, number>;
  oldestSample?: Date;
  newestSample?: Date;
  totalSize: number;
  averageSize: number;
}

export class PayloadSamplingService {
  private config: SamplingConfig;
  private samples: Map<string, PayloadSample> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(config: Partial<SamplingConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? (process.env.PAYLOAD_SAMPLING_ENABLED === 'true'),
      sampleRate: config.sampleRate ?? parseFloat(process.env.PAYLOAD_SAMPLE_RATE || '1'), // 1% default
      maxPayloadSize: config.maxPayloadSize ?? parseInt(process.env.PAYLOAD_MAX_SIZE || '262144'), // 256KB
      retentionHours: config.retentionHours ?? parseInt(process.env.PAYLOAD_RETENTION_HOURS || '24'),
      redactionEnabled: config.redactionEnabled ?? (process.env.PAYLOAD_REDACTION_ENABLED !== 'false'),
      storageType: (config.storageType as any) ?? (process.env.PAYLOAD_STORAGE_TYPE || 'memory'),
      maxSamples: config.maxSamples ?? parseInt(process.env.PAYLOAD_MAX_SAMPLES || '1000'),
    };

    // Start cleanup job
    this.startCleanupJob();
  }

  // Determine if payload should be sampled
  private shouldSample(): boolean {
    if (!this.config.enabled) return false;
    
    return Math.random() * 100 < this.config.sampleRate;
  }

  // Generate unique sample ID
  private generateSampleId(): string {
    return `sample_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check if payload size is within limits
  private isPayloadSizeValid(payload: any): boolean {
    const payloadSize = JSON.stringify(payload).length;
    return payloadSize <= this.config.maxPayloadSize;
  }

  // Redact payload if enabled
  private redactPayload(payload: any): any {
    if (!this.config.redactionEnabled) {
      return payload;
    }

    return defaultRedactor.redactObject(payload);
  }

  // Sample a payload
  samplePayload(
    type: PayloadSample['type'],
    payload: any,
    metadata: PayloadSample['metadata'] = {}
  ): string | null {
    if (!this.shouldSample()) {
      return null;
    }

    if (!this.isPayloadSizeValid(payload)) {
      aiLogger.debug('Payload too large for sampling', {
        stage: 'admin',
        metadata: {
          type,
          payloadSize: JSON.stringify(payload).length,
          maxSize: this.config.maxPayloadSize,
        },
      });
      return null;
    }

    try {
      const sampleId = this.generateSampleId();
      const originalSize = JSON.stringify(payload).length;
      const redactedPayload = this.redactPayload(payload);

      const sample: PayloadSample = {
        id: sampleId,
        timestamp: Date.now(),
        type,
        accountId: metadata.accountId,
        conversationId: metadata.conversationId,
        messageId: metadata.messageId,
        traceId: metadata.traceId,
        originalSize,
        redactedPayload,
        metadata,
      };

      // Store sample
      this.storeSample(sample);

      // Record metrics
      aiMetrics.incrementJobsTotal('payload_sampling', 'success', {
        type,
        account_id: metadata.accountId?.toString() || 'unknown',
      });

      aiLogger.debug('Payload sampled', {
        stage: 'admin',
        metadata: {
          sampleId,
          type,
          originalSize,
          redacted: this.config.redactionEnabled,
        },
      });

      return sampleId;

    } catch (error) {
      aiMetrics.incrementJobsTotal('payload_sampling', 'error', { type });
      
      aiLogger.errorWithStack('Failed to sample payload', error as Error, {
        stage: 'admin',
        metadata: { type },
      });

      return null;
    }
  }

  // Store sample based on storage type
  private storeSample(sample: PayloadSample): void {
    switch (this.config.storageType) {
      case 'memory':
        this.storeInMemory(sample);
        break;
      case 'file':
        this.storeInFile(sample);
        break;
      case 'database':
        this.storeInDatabase(sample);
        break;
      default:
        this.storeInMemory(sample);
    }
  }

  // Store sample in memory
  private storeInMemory(sample: PayloadSample): void {
    // Remove oldest samples if we exceed max
    if (this.samples.size >= this.config.maxSamples) {
      const oldestKey = Array.from(this.samples.keys())[0];
      this.samples.delete(oldestKey);
    }

    this.samples.set(sample.id, sample);
  }

  // Store sample in file (simplified implementation)
  private storeInFile(sample: PayloadSample): void {
    // This would write to a file system
    // For now, fall back to memory storage
    this.storeInMemory(sample);
  }

  // Store sample in database (simplified implementation)
  private storeInDatabase(sample: PayloadSample): void {
    // This would write to a database
    // For now, fall back to memory storage
    this.storeInMemory(sample);
  }

  // Get sample by ID
  getSample(sampleId: string): PayloadSample | null {
    return this.samples.get(sampleId) || null;
  }

  // Get samples by criteria
  getSamples(criteria: {
    type?: PayloadSample['type'];
    accountId?: number;
    conversationId?: number;
    traceId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): PayloadSample[] {
    let samples = Array.from(this.samples.values());

    // Apply filters
    if (criteria.type) {
      samples = samples.filter(s => s.type === criteria.type);
    }

    if (criteria.accountId) {
      samples = samples.filter(s => s.accountId === criteria.accountId);
    }

    if (criteria.conversationId) {
      samples = samples.filter(s => s.conversationId === criteria.conversationId);
    }

    if (criteria.traceId) {
      samples = samples.filter(s => s.traceId === criteria.traceId);
    }

    if (criteria.startTime) {
      samples = samples.filter(s => s.timestamp >= criteria.startTime!);
    }

    if (criteria.endTime) {
      samples = samples.filter(s => s.timestamp <= criteria.endTime!);
    }

    // Sort by timestamp (newest first)
    samples.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (criteria.limit) {
      samples = samples.slice(0, criteria.limit);
    }

    return samples;
  }

  // Get sampling report
  getSamplingReport(): SamplingReport {
    const samples = Array.from(this.samples.values());
    
    const samplesByType: Record<string, number> = {};
    const samplesByAccount: Record<string, number> = {};
    let totalSize = 0;

    samples.forEach(sample => {
      // Count by type
      samplesByType[sample.type] = (samplesByType[sample.type] || 0) + 1;
      
      // Count by account
      const accountKey = sample.accountId?.toString() || 'unknown';
      samplesByAccount[accountKey] = (samplesByAccount[accountKey] || 0) + 1;
      
      // Sum sizes
      totalSize += sample.originalSize;
    });

    const timestamps = samples.map(s => s.timestamp);
    const oldestSample = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
    const newestSample = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;
    const averageSize = samples.length > 0 ? totalSize / samples.length : 0;

    return {
      totalSamples: samples.length,
      samplesByType,
      samplesByAccount,
      oldestSample,
      newestSample,
      totalSize,
      averageSize,
    };
  }

  // Start cleanup job to remove old samples
  private startCleanupJob(): void {
    // Run cleanup every hour
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOldSamples();
    }, 60 * 60 * 1000);
  }

  // Clean up old samples
  private cleanupOldSamples(): void {
    const cutoffTime = Date.now() - (this.config.retentionHours * 60 * 60 * 1000);
    let removedCount = 0;

    for (const [sampleId, sample] of this.samples.entries()) {
      if (sample.timestamp < cutoffTime) {
        this.samples.delete(sampleId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      aiLogger.info('Cleaned up old payload samples', {
        stage: 'admin',
        metadata: {
          removedCount,
          remainingCount: this.samples.size,
          cutoffTime: new Date(cutoffTime).toISOString(),
        },
      });

      aiMetrics.incrementJobsTotal('payload_cleanup', 'success', {
        removed_count: removedCount.toString(),
      });
    }
  }

  // Stop the service
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    aiLogger.info('Payload sampling service stopped', {
      stage: 'admin',
      metadata: {
        totalSamples: this.samples.size,
      },
    });
  }

  // Clear all samples
  clearSamples(): void {
    const count = this.samples.size;
    this.samples.clear();

    aiLogger.info('All payload samples cleared', {
      stage: 'admin',
      metadata: { clearedCount: count },
    });

    aiMetrics.incrementJobsTotal('payload_clear', 'success', {
      cleared_count: count.toString(),
    });
  }

  // Update configuration
  updateConfig(newConfig: Partial<SamplingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    aiLogger.info('Payload sampling configuration updated', {
      stage: 'admin',
      metadata: { newConfig },
    });
  }

  // Get current configuration
  getConfig(): SamplingConfig {
    return { ...this.config };
  }

  // Export samples for analysis
  exportSamples(format: 'json' | 'csv' = 'json'): string {
    const samples = Array.from(this.samples.values());

    if (format === 'json') {
      return JSON.stringify(samples, null, 2);
    }

    if (format === 'csv') {
      if (samples.length === 0) return '';

      const headers = [
        'id', 'timestamp', 'type', 'accountId', 'conversationId', 
        'messageId', 'traceId', 'originalSize', 'success', 'latency'
      ];

      const rows = samples.map(sample => [
        sample.id,
        new Date(sample.timestamp).toISOString(),
        sample.type,
        sample.accountId || '',
        sample.conversationId || '',
        sample.messageId || '',
        sample.traceId || '',
        sample.originalSize,
        sample.metadata.success || '',
        sample.metadata.latency || '',
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return '';
  }
}

// Global payload sampling service
export const payloadSamplingService = new PayloadSamplingService();

// Convenience functions
export function sampleWebhookPayload(payload: any, metadata: any = {}): string | null {
  return payloadSamplingService.samplePayload('webhook_incoming', payload, metadata);
}

export function sampleLLMRequest(payload: any, metadata: any = {}): string | null {
  return payloadSamplingService.samplePayload('llm_request', payload, metadata);
}

export function sampleLLMResponse(payload: any, metadata: any = {}): string | null {
  return payloadSamplingService.samplePayload('llm_response', payload, metadata);
}

export function sampleChatwitRequest(payload: any, metadata: any = {}): string | null {
  return payloadSamplingService.samplePayload('chatwit_request', payload, metadata);
}

export function sampleChatwitResponse(payload: any, metadata: any = {}): string | null {
  return payloadSamplingService.samplePayload('chatwit_response', payload, metadata);
}

export default PayloadSamplingService;