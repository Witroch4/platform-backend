import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../redis';
import { webhookQueue } from './webhook-queue';
import { paginateArray, applySorting, applyFilters } from '../utils/api-helpers';

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

  /**
   * Create a new webhook configuration
   */
  async createWebhook(config: Omit<WebhookConfig, 'id'>): Promise<WebhookConfig> {
    const webhookId = uuidv4();
    
    // Generate secret if not provided
    const secret = config.secret || this.generateSecret();
    
    const webhook = await prisma.webhook_configs.create({
      data: {
        id: webhookId,
        name: config.name,
        url: config.url,
        events: config.events,
        headers: config.headers || {},
        secret,
        enabled: config.enabled,
        retry_policy: config.retryPolicy || {
          maxAttempts: 3,
          backoffType: 'exponential',
          initialDelay: 1000,
          maxDelay: 30000
        },
        created_by: config.createdBy || 'system'
      }
    });

    // Cache webhook configuration
    await this.cacheWebhookConfig(webhook);

    return this.formatWebhookConfig(webhook);
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(webhookId: string): Promise<WebhookConfig | null> {
    // Try cache first
    const cached = await this.getCachedWebhookConfig(webhookId);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const webhook = await prisma.webhook_configs.findUnique({
      where: { id: webhookId }
    });

    if (!webhook) {
      return null;
    }

    const config = this.formatWebhookConfig(webhook);
    await this.cacheWebhookConfig(webhook);
    
    return config;
  }

  /**
   * Get webhook by name
   */
  async getWebhookByName(name: string): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhook_configs.findFirst({
      where: { name }
    });

    return webhook ? this.formatWebhookConfig(webhook) : null;
  }

  /**
   * Get all webhooks with filtering and pagination
   */
  async getAllWebhooks(options: {
    page?: number;
    limit?: number;
    search?: string;
    enabled?: boolean;
    events?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    items: WebhookConfig[];
    pagination: any;
  }> {
    const {
      page = 1,
      limit = 20,
      search,
      enabled,
      events,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (enabled !== undefined) {
      where.enabled = enabled;
    }

    if (events && events.length > 0) {
      where.events = {
        hasSome: events
      };
    }

    // Get total count
    const total = await prisma.webhook_configs.count({ where });

    // Get webhooks with pagination
    const webhooks = await prisma.webhook_configs.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit
    });

    const items = webhooks.map(webhook => this.formatWebhookConfig(webhook));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    webhookId: string, 
    updates: Partial<Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<WebhookConfig> {
    const webhook = await prisma.webhook_configs.update({
      where: { id: webhookId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.url && { url: updates.url }),
        ...(updates.events && { events: updates.events }),
        ...(updates.headers && { headers: updates.headers }),
        ...(updates.secret && { secret: updates.secret }),
        ...(updates.enabled !== undefined && { enabled: updates.enabled }),
        ...(updates.retryPolicy && { retry_policy: updates.retryPolicy }),
        ...(updates.timeout && { timeout: updates.timeout }),
        updated_at: new Date()
      }
    });

    // Update cache
    await this.cacheWebhookConfig(webhook);

    return this.formatWebhookConfig(webhook);
  }

  /**
   * Delete webhook configuration
   */
  async deleteWebhook(webhookId: string, force: boolean = false): Promise<void> {
    if (!force) {
      // Check for pending deliveries
      const pendingCount = await prisma.webhook_deliveries.count({
        where: {
          webhook_id: webhookId,
          response_status: null
        }
      });

      if (pendingCount > 0) {
        throw new Error(`Cannot delete webhook with ${pendingCount} pending deliveries`);
      }
    }

    // Delete webhook and all related deliveries
    await prisma.$transaction([
      prisma.webhook_deliveries.deleteMany({
        where: { webhook_id: webhookId }
      }),
      prisma.webhook_configs.delete({
        where: { id: webhookId }
      })
    ]);

    // Remove from cache
    await redis.del(`webhook:config:${webhookId}`);
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