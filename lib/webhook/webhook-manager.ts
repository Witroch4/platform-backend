import { v4 as uuidv4 } from "uuid";
import * as crypto from "node:crypto";
import { Prisma, WebhookEvent } from "@prisma/client";
import { prisma } from "../prisma";
import { connection as redis } from "../redis";
import { webhookQueue } from "./webhook-queue";
import { paginateArray, applySorting, applyFilters } from "../utils/api-helpers";

const defaultEvent = Object.values(WebhookEvent)[0] as WebhookEvent;
const DEFAULT_WEBHOOK_TIMEOUT_MS = 10000;

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
    backoffType: "fixed" | "exponential";
    initialDelay: number;
    maxDelay: number;
  };
  filters?: {
    queueNames?: string[];
    jobTypes?: string[];
    severityLevels?: string[];
  };
  timeout?: number;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  status: "pending" | "success" | "failed" | "retrying";
  attempts: number;
  maxAttempts: number;
  responseStatus?: number | null;
  responseBody?: string | null;
  responseTime?: number | null;
  error?: string;
  nextRetryAt?: Date | null;
  deliveredAt?: Date | null;
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

export interface WebhookEventPayload {
  eventType: WebhookEvent;
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
    if (!WebhookManager.instance) {
      WebhookManager.instance = new WebhookManager();
    }
    return WebhookManager.instance;
  }

  /**
   * Initialize event listeners for queue events
   */
  private initializeEventListeners(): void {
    // This would be called when queues are registered
    // to set up event listeners for webhook triggers
    console.log("[WebhookManager] Event listeners initialized");
  }

  // ---------------------------------------------------------------------------
  // CRUD base (padrão camelCase) + Wrappers para compatibilidade das rotas
  // ---------------------------------------------------------------------------

  async createWebhookConfig(data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    const webhook = await prisma.webhookConfig.create({
      data: {
        name: data.name || "",
        url: data.url || "",
        headers: (data.headers as any) || {},
        events: (data.events as any) || [],
        enabled: data.enabled ?? true,
        secret: data.secret,
        retryPolicy: data.retryPolicy as any,
        createdBy: data.createdBy || "system",
      },
    });

    return this.formatWebhookConfig(webhook);
  }

  async getWebhookConfigById(id: string): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhookConfig.findUnique({
      where: { id },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    return webhook ? this.formatWebhookConfig(webhook) : null;
  }

  async getWebhookConfigByName(name: string): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhookConfig.findFirst({
      where: { name },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    return webhook ? this.formatWebhookConfig(webhook) : null;
  }

  async listWebhookConfigs(
    options: {
      page?: number;
      limit?: number;
      search?: string;
      enabled?: boolean;
    } = {},
  ): Promise<{ items: WebhookConfig[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, search, enabled } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { url: { contains: search, mode: "insensitive" } },
      ];
    }
    if (enabled !== undefined) {
      where.enabled = enabled;
    }

    const total = await prisma.webhookConfig.count({ where });

    const webhooks = await prisma.webhookConfig.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    const items = webhooks.map((webhook: any) => this.formatWebhookConfig(webhook));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async updateWebhookConfig(id: string, data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    const updateData: Prisma.WebhookConfigUpdateInput = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.url !== undefined) updateData.url = data.url;
    if (data.events !== undefined) updateData.events = data.events as any;
    if (data.headers !== undefined) updateData.headers = data.headers as any;
    if (data.secret !== undefined) updateData.secret = data.secret;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.retryPolicy !== undefined) updateData.retryPolicy = data.retryPolicy as any;
    if (data.createdBy !== undefined) updateData.createdBy = data.createdBy;

    const webhook = await prisma.webhookConfig.update({
      where: { id },
      data: updateData,
    });

    return this.formatWebhookConfig(webhook);
  }

  async deleteWebhookConfig(id: string): Promise<void> {
    // Verifica entregas pendentes (responseStatus null)
    const pendingCount = await prisma.webhookDelivery.count({
      where: {
        webhookId: id,
        responseStatus: null,
      },
    });

    if (pendingCount > 0) {
      throw new Error(`Cannot delete webhook with ${pendingCount} pending deliveries`);
    }

    // Deleta em transação
    await prisma.$transaction([
      prisma.webhookDelivery.deleteMany({ where: { webhookId: id } }),
      prisma.webhookConfig.delete({ where: { id } }),
    ]);
  }

  // ---- Wrappers para compatibilidade com rotas existentes ----

  /** Compatível com rotas: obter por id */
  async getWebhookById(id: string): Promise<WebhookConfig | null> {
    return this.getWebhookConfigById(id);
  }

  /** Compatível com rotas: obter por name */
  async getWebhookByName(name: string): Promise<WebhookConfig | null> {
    return this.getWebhookConfigByName(name);
  }

  /** Compatível com rotas: criar webhook */
  async createWebhook(data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    return this.createWebhookConfig(data);
  }

  /** Compatível com rotas: update simples */
  async updateWebhook(id: string, data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    return this.updateWebhookConfig(id, data);
  }

  /** Compatível com rotas: delete simples */
  async deleteWebhook(id: string, _force = false): Promise<void> {
    return this.deleteWebhookConfig(id);
  }

  /** Opcional: lista com paginação genérica */
  async getAllWebhooks(options: {
    page?: number;
    limit?: number;
    search?: string;
    enabled?: boolean;
    events?: string[];
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}): Promise<{ items: WebhookConfig[]; pagination: any }> {
    const {
      page = 1,
      limit = 20,
      search,
      enabled,
      events,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { url: { contains: search, mode: "insensitive" } },
      ];
    }
    if (enabled !== undefined) {
      where.enabled = enabled;
    }
    if (events && events.length > 0) {
      where.events = { array_contains: events };
    }

    const [total, webhooks] = await Promise.all([
      prisma.webhookConfig.count({ where }),
      prisma.webhookConfig.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const items = webhooks.map((w: any) => this.formatWebhookConfig(w));
    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };

    return { items, pagination };
  }

  // ---------------------------------------------------------------------------
  // Estatísticas (geral)
  // ---------------------------------------------------------------------------
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
    const deliveries = (await prisma.webhookDelivery.findMany({
      select: {
        responseStatus: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: "desc" },
      take: 1000,
    })) as WebhookDelivery[];

    const totalWebhooks = await prisma.webhookConfig.count();
    const activeWebhooks = await prisma.webhookConfig.count({ where: { enabled: true } });

    const successfulDeliveries = deliveries.filter(
      (d: WebhookDelivery) =>
        d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300,
    ).length;
    const failedDeliveries = deliveries.filter(
      (d: WebhookDelivery) =>
        d.responseStatus != null && (d.responseStatus < 200 || d.responseStatus >= 300),
    ).length;
    const pendingDeliveries = deliveries.filter((d: WebhookDelivery) => d.responseStatus == null).length;

    const totalDeliveries = successfulDeliveries + failedDeliveries + pendingDeliveries;
    const delivered = deliveries.filter(
      (d: WebhookDelivery) => d.deliveredAt != null && d.createdAt != null,
    );
    const averageResponseTime =
      delivered.reduce(
        (sum: number, d: WebhookDelivery) =>
          sum + ((d.deliveredAt?.getTime() ?? 0) - d.createdAt.getTime()),
        0,
      ) /
        (delivered.length || 1);

    return {
      totalWebhooks,
      activeWebhooks,
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      pendingDeliveries,
      averageResponseTime,
      lastSuccessAt: deliveries.find(
        (d) =>
          d.responseStatus != null &&
          d.responseStatus >= 200 &&
          d.responseStatus < 300,
      )?.deliveredAt ?? undefined,
      lastFailureAt: deliveries.find(
        (d) =>
          d.responseStatus != null &&
          (d.responseStatus < 200 || d.responseStatus >= 300),
      )?.deliveredAt ?? undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Estatísticas por webhookId
  // ---------------------------------------------------------------------------
  async getWebhookStatsById(webhookId: string): Promise<WebhookStats> {
    const deliveries = (await prisma.webhookDelivery.findMany({
      where: { webhookId },
      select: {
        responseStatus: true,
        deliveredAt: true,
        createdAt: true,
        attempts: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    })) as WebhookDelivery[];

    const totalDeliveries = deliveries.length;
    const successfulDeliveries = deliveries.filter(
      (d: WebhookDelivery) =>
        d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300,
    ).length;
    const failedDeliveries = deliveries.filter(
      (d: WebhookDelivery) =>
        d.responseStatus != null && (d.responseStatus < 200 || d.responseStatus >= 300),
    ).length;
    const pendingDeliveries = deliveries.filter((d: WebhookDelivery) => d.responseStatus == null).length;

    const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;

    // Consecutivos com falha (do mais recente para trás)
    let consecutiveFailures = 0;
    for (const d of deliveries) {
      if (d.responseStatus != null && (d.responseStatus < 200 || d.responseStatus >= 300)) {
        consecutiveFailures++;
      } else if (d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300) {
        break;
      }
    }

    return {
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      pendingDeliveries,
      averageResponseTime: 0, // Pode ser calculado se gravar / medir consistentemente
      successRate: Math.round(successRate * 100) / 100,
      lastDeliveryAt: deliveries[0]?.createdAt,
      lastSuccessAt: deliveries.find(
        (d) =>
          d.responseStatus != null &&
          d.responseStatus >= 200 &&
          d.responseStatus < 300,
      )?.deliveredAt,
      lastFailureAt: deliveries.find(
        (d) =>
          d.responseStatus != null &&
          (d.responseStatus < 200 || d.responseStatus >= 300),
      )?.deliveredAt,
      consecutiveFailures,
    };
  }

  // ---------------------------------------------------------------------------
  // Listagem de deliveries (filtro/paginação)
  // ---------------------------------------------------------------------------
  async getWebhookDeliveries(
    webhookId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      eventType?: string;
      startTime?: Date;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    } = {},
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
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const where: any = { webhookId };

    if (status) {
      switch (status) {
        case "success":
          where.responseStatus = { gte: 200, lt: 300 };
          break;
        case "failed":
          where.OR = [{ responseStatus: { lt: 200 } }, { responseStatus: { gte: 300 } }];
          break;
        case "pending":
          where.responseStatus = null;
          break;
      }
    }

    if (eventType) {
      where.eventType = eventType;
    }

    if (startTime) {
      where.createdAt = { gte: startTime };
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      ...(limit > 0 && {
        skip: (page - 1) * limit,
        take: limit,
      }),
    });

    const items = deliveries.map((delivery: any) => this.formatWebhookDelivery(delivery));

    let pagination;
    if (limit > 0) {
      const total = await prisma.webhookDelivery.count({ where });
      pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      };
    }

    return { items, pagination };
  }

  // ---------------------------------------------------------------------------
  // Operações sobre deliveries
  // ---------------------------------------------------------------------------
  async getWebhookDeliveryById(id: string): Promise<WebhookDelivery | null> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id },
      include: {
        webhook: {
          select: { name: true, url: true },
        },
      },
    });

    return delivery ? this.formatWebhookDelivery(delivery as any) : null;
  }

  async retryWebhookDelivery(id: string): Promise<WebhookDelivery> {
    const delivery = await prisma.webhookDelivery.update({
      where: { id },
      data: {
        responseStatus: null,
        responseBody: null,
        attempts: { increment: 1 },
      },
    });

    await webhookQueue.add(
      "deliver-webhook",
      {
        deliveryId: id,
        webhookId: delivery.webhookId,
        attempt: delivery.attempts,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return this.formatWebhookDelivery(delivery as any);
  }

  async retryFailedDeliveries(webhookId?: string): Promise<{ success: number; failed: number }> {
    const result = await prisma.webhookDelivery.updateMany({
      where: {
        ...(webhookId && { webhookId }),
        NOT: { responseStatus: null },
        OR: [{ responseStatus: { lt: 200 } }, { responseStatus: { gte: 300 } }],
      },
      data: {
        responseStatus: null,
        deliveredAt: null,
      },
    });

    return { success: result.count, failed: 0 };
  }

  async cancelPendingDeliveries(webhookId?: string): Promise<{ success: number; failed: number }> {
    const result = await prisma.webhookDelivery.updateMany({
      where: {
        responseStatus: null,
        ...(webhookId && { webhookId }),
      },
      data: {
        responseStatus: 499, // Client Closed Request
        responseBody: "Delivery cancelled",
      },
    });

    return { success: result.count, failed: 0 };
  }

  async resetWebhookFailures(webhookId: string): Promise<void> {
    await prisma.webhookDelivery.updateMany({
      where: {
        webhookId,
        NOT: { responseStatus: null },
      },
      data: {
        responseStatus: null,
        deliveredAt: null,
      },
    });
  }

  async markDeliveryAsDelivered(
    id: string,
    responseStatus: number,
    responseBody: string,
    _responseTime: number,
  ): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        responseStatus,
        responseBody,
        deliveredAt: new Date(),
        // NOTE: se houver coluna responseTime, setar aqui
      },
    });
  }

  async markDeliveryAsFailed(id: string, error: string): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        responseStatus: 0, // network/timeout error
        responseBody: error,
      },
    });
  }

  async getActiveWebhookConfigs(): Promise<WebhookConfig[]> {
    const webhooks = await prisma.webhookConfig.findMany({
      where: { enabled: true },
      include: {
        deliveries: {
          where: { responseStatus: null },
          take: 1,
        },
      },
    });

    return webhooks.map((webhook: any) => this.formatWebhookConfig(webhook));
  }

  async createWebhookDelivery(
    webhookId: string,
    payload: any,
    headers: Record<string, string> = {},
  ): Promise<WebhookDelivery> {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId,
        eventType: defaultEvent,
        payload,
        attempts: 0,
      },
    });

    return this.formatWebhookDelivery(delivery as any);
  }

  /**
   * Trigger webhook for an event
   */
  async triggerWebhook(event: WebhookEventPayload): Promise<void> {
    const webhooks = await this.getWebhooksForEvent(event.eventType);

    for (const webhook of webhooks) {
      if (!this.shouldTriggerWebhook(webhook, event)) continue;

      const deliveryId = await this.createDelivery(webhook.id!, event);

      await webhookQueue.add(
        "deliver-webhook",
        {
          deliveryId,
          webhookId: webhook.id,
          attempt: 1,
        },
        {
          attempts: webhook.retryPolicy?.maxAttempts || 3,
          backoff: {
            type: webhook.retryPolicy?.backoffType || "exponential",
            delay: webhook.retryPolicy?.initialDelay || 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    }
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(
    webhookId: string,
    eventType: string,
    payload: any,
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

    const deliveryId = await this.createDelivery(webhookId, {
      eventType: eventType as WebhookEvent,
      timestamp: new Date(),
      data: payload,
    });

    try {
      const result = await this.deliverWebhook(deliveryId);
      return {
        success: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
        deliveryId,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        deliveryId,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Entrega (worker)
  // ---------------------------------------------------------------------------
  async deliverWebhook(deliveryId: string): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime?: number;
    error?: string;
  }> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        webhook: true,
      },
    });

    if (!delivery || !delivery.webhook) {
      throw new Error(`Delivery or webhook not found: ${deliveryId}`);
    }

    const webhook = delivery.webhook;
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "ChatWit-Webhook/1.0",
        "X-Webhook-Event": delivery.eventType,
        "X-Webhook-Delivery": deliveryId,
        "X-Webhook-Timestamp": delivery.createdAt.toISOString(),
        ...(webhook.headers as any),
      };

      if (webhook.secret) {
        const signature = this.generateSignature(JSON.stringify(delivery.payload), webhook.secret);
        headers["X-Webhook-Signature"] = signature;
      }

      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(DEFAULT_WEBHOOK_TIMEOUT_MS),
      });

      const responseTime = Date.now() - startTime;
      const responseBody = await response.text();

      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          responseStatus: response.status,
          responseBody: responseBody.substring(0, 10000),
          deliveredAt: new Date(),
          attempts: delivery.attempts + 1,
          // NOTE: se houver coluna responseTime, setar aqui
        },
      });

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          responseStatus: 0,
          responseBody: errorMessage,
          attempts: delivery.attempts + 1,
        },
      });

      return {
        success: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async getWebhooksForEvent(eventType: string): Promise<WebhookConfig[]> {
    const webhooks = await prisma.webhookConfig.findMany({
      where: {
        enabled: true,
        events: { array_contains: eventType },
      },
    });

    return webhooks.map((webhook: any) => this.formatWebhookConfig(webhook));
  }

  private shouldTriggerWebhook(webhook: WebhookConfig, event: WebhookEventPayload): boolean {
    if (webhook.filters) {
      if (webhook.filters.queueNames && event.queueName) {
        if (!webhook.filters.queueNames.includes(event.queueName)) {
          return false;
        }
      }
      // outros filtros se necessário
    }
    return true;
  }

  private async createDelivery(webhookId: string, event: WebhookEventPayload): Promise<string> {
    const deliveryId = uuidv4();

    await prisma.webhookDelivery.create({
      data: {
        id: deliveryId,
        webhookId,
        eventType: event.eventType,
        payload: event.data,
        attempts: 0,
      },
    });

    return deliveryId;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  private async cacheWebhookConfig(webhook: any): Promise<void> {
    const config = this.formatWebhookConfig(webhook);
    await redis.setex(
      `webhook:config:${webhook.id}`,
      3600, // 1 hour
      JSON.stringify(config),
    );
  }

  private async getCachedWebhookConfig(webhookId: string): Promise<WebhookConfig | null> {
    try {
      const cached = await redis.get(`webhook:config:${webhookId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error: unknown) {
      console.error("[WebhookManager] Error getting cached webhook config:", error);
      return null;
    }
  }

  /** Tornado público para compatibilidade com rotas que chamam getWebhook */
  public async getWebhook(webhookId: string): Promise<WebhookConfig | null> {
    const cached = await this.getCachedWebhookConfig(webhookId);
    if (cached) return cached;

    const webhook = await prisma.webhookConfig.findUnique({ where: { id: webhookId } });
    if (!webhook) return null;

    await this.cacheWebhookConfig(webhook);
    return this.formatWebhookConfig(webhook);
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
      retryPolicy: webhook.retryPolicy,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
      createdBy: webhook.createdBy,
    };
  }

  private formatWebhookDelivery(delivery: any): WebhookDelivery {
    let status: "pending" | "success" | "failed" | "retrying" = "pending";

    if (delivery.responseStatus != null) {
      if (delivery.responseStatus >= 200 && delivery.responseStatus < 300) {
        status = "success";
      } else {
        status = "failed";
      }
    }

    return {
      id: delivery.id,
      webhookId: delivery.webhookId,
      eventType: delivery.eventType,
      payload: delivery.payload,
      status,
      attempts: delivery.attempts,
      maxAttempts: 3, // TODO: ler do retryPolicy do webhook, se necessário
      responseStatus: delivery.responseStatus ?? null,
      responseBody: delivery.responseBody ?? null,
      responseTime: delivery.responseTime ?? null,
      error:
        delivery.responseStatus != null &&
        (delivery.responseStatus < 200 || delivery.responseStatus >= 300)
          ? delivery.responseBody
          : undefined,
      nextRetryAt: delivery.nextRetryAt ?? null,
      deliveredAt: delivery.deliveredAt ?? null,
      createdAt: delivery.createdAt,
    };
  }
}

// Global webhook manager instance
export const webhookManager = WebhookManager.getInstance();
