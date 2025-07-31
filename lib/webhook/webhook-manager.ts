import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../redis/redis-client';
import { webhookQueue } from './webhook-queue';
import { paginateArray, applySorting, applyFilters } from '../utils/api-helpers';
import { PrismaClient } from '@prisma/client';
import { WebhookConfig, WebhookDelivery } from '@prisma/client';

// Interfaces
export interface WebhookConfig {
  id?: string;
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  secret?: string;
  enabled: boolean;
  retryPolicy?: {
    maxAttempts: number;
    backoffType: 'fixed' | 'exponential';
    initialDelay: number;
    maxDelay: number;
  };
  filters?: {
    queueNames?: string[];
    jobTypes?: string[];
    severityLevels?: string[];
  };
  timeout: number;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  responseStatus?: number;
  responseBody?: string;
  responseTime?: number;
  error?: string;
  nextRetryAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

export interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  averageResponseTime: number;
  successRate: number;
  lastDeliveryAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  consecutiveFailures: number;
}

export interface WebhookEvent {
  eventType: string;
  timestamp: Date;
  data: any;
  queueName?: string;
  jobId?: string;
  correlationId?: string;
}

export class WebhookManager {
  private static instance: WebhookManager;
  
  constructor() {
    this.initializeEventListeners();
  }

  static getInstance(): WebhookManager {
    if (!this.instance) {
      this.instance = new WebhookManager();
    }
    return this.instance;
  }

  /**
   * Initialize event listeners for queue events
   */
  private initializeEventListeners(): void {
    // This would be called when queues are registered
    // to set up event listeners for webhook triggers
    console.log('[WebhookManager] Event listeners initialized');
  }

  async createWebhookConfig(data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    const webhook = await prisma.webhookConfig.create({
      data: {
        name: data.name || '',
        url: data.url || '',
        method: data.method || 'POST',
        headers: data.headers || {},
        events: data.events || [],
        isActive: data.isActive ?? true,
        retryCount: data.retryCount || 3,
        timeout: data.timeout || 30000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return webhook;
  }

  async getWebhookConfigById(id: string): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhookConfig.findUnique({
      where: { id },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return webhook;
  }

  async getWebhookConfigByName(name: string): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhookConfig.findFirst({
      where: { name },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return webhook;
  }

  async listWebhookConfigs(options: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  } = {}): Promise<{ items: WebhookConfig[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, search, isActive } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const total = await prisma.webhookConfig.count({ where });

    const webhooks = await prisma.webhookConfig.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    const items = webhooks.map(webhook => this.formatWebhookConfig(webhook));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async updateWebhookConfig(id: string, data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    const webhook = await prisma.webhookConfig.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return webhook;
  }

  async deleteWebhookConfig(id: string): Promise<void> {
    // Primeiro, verifica se há entregas pendentes
    const pendingCount = await prisma.webhookDelivery.count({
      where: {
        webhookConfigId: id,
        status: 'pending',
      },
    });

    if (pendingCount > 0) {
      throw new Error(`Cannot delete webhook with ${pendingCount} pending deliveries`);
    }

    // Deleta em transação para garantir consistência
    await prisma.$transaction([
      prisma.webhookDelivery.deleteMany({
        where: { webhookConfigId: id },
      }),
      prisma.webhookConfig.delete({
        where: { id },
      }),
    ]);
  }

  async getWebhookStats(): Promise<{
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    averageResponseTime: number;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
  }> {
    const stats = await prisma.webhookDelivery.groupBy({
      by: ['status'],
      _count: { status: true },
      _avg: { responseTime: true },
    });

    const deliveries = await prisma.webhookDelivery.findMany({
      select: {
        status: true,
        responseStatus: true,
        responseTime: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
      take: 1000, // Últimas 1000 entregas para estatísticas
    });

    const totalWebhooks = await prisma.webhookConfig.count();
    const activeWebhooks = await prisma.webhookConfig.count({ where: { isActive: true } });

    const successfulDeliveries = deliveries.filter(d => d.responseStatus && d.responseStatus >= 200 && d.responseStatus < 300).length;
    const failedDeliveries = deliveries.filter(d => d.responseStatus && (d.responseStatus < 200 || d.responseStatus >= 300)).length;
    const pendingDeliveries = deliveries.filter(d => !d.responseStatus).length;

    const totalDeliveries = successfulDeliveries + failedDeliveries + pendingDeliveries;
    const averageResponseTime = deliveries.reduce((sum, d) => sum + (d.responseTime || 0), 0) / deliveries.length || 0;

    return {
      totalWebhooks,
      activeWebhooks,
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      pendingDeliveries,
      averageResponseTime,
      lastSuccessAt: deliveries.find(d => d.responseStatus && d.responseStatus >= 200 && d.responseStatus < 300)?.deliveredAt,
      lastFailureAt: deliveries.find(d => d.responseStatus && (d.responseStatus < 200 || d.responseStatus >= 300))?.deliveredAt,
    };
  }

  async listWebhookDeliveries(options: {
    webhookConfigId?: string;
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<{ items: WebhookDelivery[]; total: number; page: number; limit: number }> {
    const { webhookConfigId, page = 1, limit = 20, status, search } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (webhookConfigId) {
      where.webhookConfigId = webhookConfigId;
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { payload: { contains: search, mode: 'insensitive' } },
        { responseBody: { contains: search, mode: 'insensitive' } },
      ];
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        webhookConfig: {
          select: { name: true, url: true },
        },
      },
    });

    const items = deliveries.map(delivery => this.formatWebhookDelivery(delivery));

    const total = await prisma.webhookDelivery.count({ where });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getWebhookDeliveryById(id: string): Promise<WebhookDelivery | null> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id },
      include: {
        webhookConfig: {
          select: { name: true, url: true },
        },
      },
    });

    return delivery;
  }

  async retryWebhookDelivery(id: string): Promise<WebhookDelivery> {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'pending',
        retryCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // Queue for delivery
    await webhookQueue.add('deliver-webhook', {
      deliveryId: id,
      webhookId: id, // Assuming webhookId is the same as deliveryId for simplicity here
      attempt: 1
    }, {
      attempts: 3, // Assuming a default retry policy
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 100,
      removeOnFail: 50
    });

    return this.getWebhookDeliveryById(id)!;
  }

  async retryFailedDeliveries(webhookConfigId?: string): Promise<{ success: number; failed: number }> {
    const result = await prisma.webhookDelivery.updateMany({
      where: {
        status: 'failed',
        ...(webhookConfigId && { webhookConfigId }),
      },
      data: {
        status: 'pending',
        retryCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return { success: result.count, failed: 0 };
  }

  async cancelPendingDeliveries(webhookConfigId?: string): Promise<{ success: number; failed: number }> {
    const result = await prisma.webhookDelivery.updateMany({
      where: {
        status: 'pending',
        ...(webhookConfigId && { webhookConfigId }),
      },
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
    });

    return { success: result.count, failed: 0 };
  }

  async markDeliveryAsDelivered(id: string, responseStatus: number, responseBody: string, responseTime: number): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'delivered',
        responseStatus,
        responseBody,
        responseTime,
        deliveredAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async markDeliveryAsFailed(id: string, error: string): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'failed',
        error,
        updatedAt: new Date(),
      },
    });
  }

  async getActiveWebhookConfigs(): Promise<WebhookConfig[]> {
    const webhooks = await prisma.webhookConfig.findMany({
      where: { isActive: true },
      include: {
        deliveries: {
          where: { status: 'pending' },
          take: 1,
        },
      },
    });

    return webhooks.map(webhook => this.formatWebhookConfig(webhook));
  }

  async createWebhookDelivery(webhookConfigId: string, payload: any, headers: Record<string, string> = {}): Promise<WebhookDelivery> {
    await prisma.webhookDelivery.create({
      data: {
        webhookConfigId,
        payload,
        headers,
        status: 'pending',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return this.getWebhookDeliveryById(id)!;
  }

  /**
   * Trigger webhook for an event
   */
  async triggerWebhook(event: WebhookEvent): Promise<void> {
    // Get all enabled webhooks that match this event
    const webhooks = await this.getWebhooksForEvent(event.eventType);

    for (const webhook of webhooks) {
      // Apply filters
      if (!this.shouldTriggerWebhook(webhook, event)) {
        continue;
      }

      // Create delivery record
      const deliveryId = await this.createDelivery(webhook.id!, event);

      // Queue for delivery
      await webhookQueue.add('deliver-webhook', {
        deliveryId,
        webhookId: webhook.id,
        attempt: 1
      }, {
        attempts: webhook.retryPolicy?.maxAttempts || 3,
        backoff: {
          type: webhook.retryPolicy?.backoffType || 'exponential',
          delay: webhook.retryPolicy?.initialDelay || 1000
        },
        removeOnComplete: 100,
        removeOnFail: 50
      });
    }
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(
    webhookId: string, 
    eventType: string, 
    payload: any
  ): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime?: number;
    error?: string;
    deliveryId: string;
  }> {
    const webhook = await this.getWebhook(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    // Create test delivery record
    const deliveryId = await this.createDelivery(webhookId, {
      eventType,
      timestamp: new Date(),
      data: payload
    });

    try {
      // Perform immediate delivery
      const result = await this.deliverWebhook(deliveryId);
      
      return {
        success: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
        deliveryId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        deliveryId
      };
    }
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhookId: string): Promise<WebhookStats> {
    const stats = await prisma.webhook_deliveries.groupBy({
      by: ['response_status'],
      where: { webhook_id: webhookId },
      _count: true
    });

    const deliveries = await prisma.webhook_deliveries.findMany({
      where: { webhook_id: webhookId },
      select: {
        response_status: true,
        delivered_at: true,
        created_at: true,
        attempts: true
      },
      orderBy: { created_at: 'desc' },
      take: 1000
    });

    const totalDeliveries = deliveries.length;
    const successfulDeliveries = deliveries.filter(d => d.response_status && d.response_status >= 200 && d.response_status < 300).length;
    const failedDeliveries = deliveries.filter(d => d.response_status && (d.response_status < 200 || d.response_status >= 300)).length;
    const pendingDeliveries = deliveries.filter(d => !d.response_status).length;

    const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;

    // Calculate consecutive failures
    let consecutiveFailures = 0;
    for (const delivery of deliveries) {
      if (delivery.response_status && (delivery.response_status < 200 || delivery.response_status >= 300)) {
        consecutiveFailures++;
      } else if (delivery.response_status && delivery.response_status >= 200 && delivery.response_status < 300) {
        break;
      }
    }

    return {
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      pendingDeliveries,
      averageResponseTime: 0, // TODO: Calculate from delivery records
      successRate: Math.round(successRate * 100) / 100,
      lastDeliveryAt: deliveries[0]?.created_at,
      lastSuccessAt: deliveries.find(d => d.response_status && d.response_status >= 200 && d.response_status < 300)?.delivered_at,
      lastFailureAt: deliveries.find(d => d.response_status && (d.response_status < 200 || d.response_status >= 300))?.delivered_at,
      consecutiveFailures
    };
  }

  /**
   * Get webhook deliveries
   */
  async getWebhookDeliveries(
    webhookId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      eventType?: string;
      startTime?: Date;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    items: WebhookDelivery[];
    pagination?: any;
  }> {
    const {
      page = 1,
      limit = 50,
      status,
      eventType,
      startTime,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    // Build where clause
    const where: any = { webhook_id: webhookId };
    
    if (status) {
      // Map status to database conditions
      switch (status) {
        case 'success':
          where.response_status = { gte: 200, lt: 300 };
          break;
        case 'failed':
          where.OR = [
            { response_status: { lt: 200 } },
            { response_status: { gte: 300 } }
          ];
          break;
        case 'pending':
          where.response_status = null;
          break;
      }
    }

    if (eventType) {
      where.event_type = eventType;
    }

    if (startTime) {
      where.created_at = { gte: startTime };
    }

    // Get deliveries
    const deliveries = await prisma.webhook_deliveries.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      ...(limit > 0 && {
        skip: (page - 1) * limit,
        take: limit
      })
    });

    const items = deliveries.map(delivery => this.formatWebhookDelivery(delivery));

    // Get pagination info if limit is specified
    let pagination;
    if (limit > 0) {
      const total = await prisma.webhook_deliveries.count({ where });
      pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      };
    }

    return { items, pagination };
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = await prisma.webhook_deliveries.findUnique({
      where: { id: deliveryId }
    });

    if (!delivery) {
      return false;
    }

    // Reset delivery status and queue for retry
    await prisma.webhook_deliveries.update({
      where: { id: deliveryId },
      data: {
        response_status: null,
        response_body: null,
        delivered_at: null
      }
    });

    // Queue for delivery
    await webhookQueue.add('deliver-webhook', {
      deliveryId,
      webhookId: delivery.webhook_id,
      attempt: delivery.attempts + 1
    });

    return true;
  }

  /**
   * Cancel pending delivery
   */
  async cancelDelivery(deliveryId: string): Promise<boolean> {
    const result = await prisma.webhook_deliveries.updateMany({
      where: {
        id: deliveryId,
        response_status: null
      },
      data: {
        response_status: 499, // Client Closed Request
        response_body: 'Delivery cancelled by user'
      }
    });

    return result.count > 0;
  }

  /**
   * Mark delivery as successful
   */
  async markDeliverySuccess(deliveryId: string): Promise<boolean> {
    const result = await prisma.webhook_deliveries.updateMany({
      where: {
        id: deliveryId,
        response_status: null
      },
      data: {
        response_status: 200,
        response_body: 'Manually marked as successful',
        delivered_at: new Date()
      }
    });

    return result.count > 0;
  }

  /**
   * Reset webhook failure count
   */
  async resetWebhookFailures(webhookId: string): Promise<void> {
    // This could involve resetting failure counters or enabling a disabled webhook
    await this.updateWebhook(webhookId, { enabled: true });
  }

  /**
   * Deliver webhook (called by worker)
   */
  async deliverWebhook(deliveryId: string): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime?: number;
    error?: string;
  }> {
    const delivery = await prisma.webhook_deliveries.findUnique({
      where: { id: deliveryId },
      include: {
        webhook_configs: true
      }
    });

    if (!delivery || !delivery.webhook_configs) {
      throw new Error(`Delivery or webhook not found: ${deliveryId}`);
    }

    const webhook = delivery.webhook_configs;
    const startTime = Date.now();

    try {
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'ChatWit-Webhook/1.0',
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Delivery': deliveryId,
        'X-Webhook-Timestamp': delivery.created_at.toISOString(),
        ...webhook.headers
      };

      // Add signature if secret is configured
      if (webhook.secret) {
        const signature = this.generateSignature(
          JSON.stringify(delivery.payload),
          webhook.secret
        );
        headers['X-Webhook-Signature'] = signature;
      }

      // Make HTTP request
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(webhook.timeout || 10000)
      });

      const responseTime = Date.now() - startTime;
      const responseBody = await response.text();

      // Update delivery record
      await prisma.webhook_deliveries.update({
        where: { id: deliveryId },
        data: {
          response_status: response.status,
          response_body: responseBody.substring(0, 10000), // Limit response body size
          delivered_at: new Date(),
          attempts: delivery.attempts + 1
        }
      });

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update delivery record with error
      await prisma.webhook_deliveries.update({
        where: { id: deliveryId },
        data: {
          response_status: 0, // Indicates network/timeout error
          response_body: errorMessage,
          attempts: delivery.attempts + 1
        }
      });

      return {
        success: false,
        responseTime,
        error: errorMessage
      };
    }
  }

  // Private helper methods
  private async getWebhooksForEvent(eventType: string): Promise<WebhookConfig[]> {
    const webhooks = await prisma.webhook_configs.findMany({
      where: {
        enabled: true,
        events: {
          has: eventType
        }
      }
    });

    return webhooks.map(webhook => this.formatWebhookConfig(webhook));
  }

  private shouldTriggerWebhook(webhook: WebhookConfig, event: WebhookEvent): boolean {
    // Apply filters
    if (webhook.filters) {
      if (webhook.filters.queueNames && event.queueName) {
        if (!webhook.filters.queueNames.includes(event.queueName)) {
          return false;
        }
      }

      // Add more filter logic as needed
    }

    return true;
  }

  private async createDelivery(webhookId: string, event: WebhookEvent): Promise<string> {
    const deliveryId = uuidv4();

    await prisma.webhook_deliveries.create({
      data: {
        id: deliveryId,
        webhook_id: webhookId,
        event_type: event.eventType,
        payload: event.data,
        attempts: 0
      }
    });

    return deliveryId;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  private async cacheWebhookConfig(webhook: any): Promise<void> {
    const config = this.formatWebhookConfig(webhook);
    await redis.setex(
      `webhook:config:${webhook.id}`,
      3600, // 1 hour
      JSON.stringify(config)
    );
  }

  private async getCachedWebhookConfig(webhookId: string): Promise<WebhookConfig | null> {
    try {
      const cached = await redis.get(`webhook:config:${webhookId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[WebhookManager] Error getting cached webhook config:', error);
      return null;
    }
  }

  private formatWebhookConfig(webhook: any): WebhookConfig {
    return {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      headers: webhook.headers,
      secret: webhook.secret,
      enabled: webhook.enabled,
      retryPolicy: webhook.retry_policy,
      filters: webhook.filters,
      timeout: webhook.timeout || 10000,
      createdAt: webhook.created_at,
      updatedAt: webhook.updated_at,
      createdBy: webhook.created_by
    };
  }

  private formatWebhookDelivery(delivery: any): WebhookDelivery {
    let status: 'pending' | 'success' | 'failed' | 'retrying' = 'pending';
    
    if (delivery.response_status !== null) {
      if (delivery.response_status >= 200 && delivery.response_status < 300) {
        status = 'success';
      } else {
        status = 'failed';
      }
    }

    return {
      id: delivery.id,
      webhookId: delivery.webhook_id,
      eventType: delivery.event_type,
      payload: delivery.payload,
      status,
      attempts: delivery.attempts,
      maxAttempts: 3, // TODO: Get from webhook config
      responseStatus: delivery.response_status,
      responseBody: delivery.response_body,
      responseTime: delivery.response_time,
      error: delivery.response_status && (delivery.response_status < 200 || delivery.response_status >= 300) 
        ? delivery.response_body 
        : undefined,
      nextRetryAt: delivery.next_retry_at,
      deliveredAt: delivery.delivered_at,
      createdAt: delivery.created_at
    };
  }
}

// Global webhook manager instance
export const webhookManager = WebhookManager.getInstance();