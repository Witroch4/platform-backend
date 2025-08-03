"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookManager = exports.WebhookManager = void 0;
const uuid_1 = require("uuid");
const crypto = __importStar(require("node:crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const redis_1 = require("../redis");
const webhook_queue_1 = require("./webhook-queue");
const defaultEvent = Object.values(client_1.WebhookEvent)[0];
const DEFAULT_WEBHOOK_TIMEOUT_MS = 10000;
class WebhookManager {
    static instance;
    constructor() {
        this.initializeEventListeners();
    }
    static getInstance() {
        if (!WebhookManager.instance) {
            WebhookManager.instance = new WebhookManager();
        }
        return WebhookManager.instance;
    }
    /**
     * Initialize event listeners for queue events
     */
    initializeEventListeners() {
        // This would be called when queues are registered
        // to set up event listeners for webhook triggers
        console.log("[WebhookManager] Event listeners initialized");
    }
    // ---------------------------------------------------------------------------
    // CRUD base (padrão camelCase) + Wrappers para compatibilidade das rotas
    // ---------------------------------------------------------------------------
    async createWebhookConfig(data) {
        const webhook = await prisma_1.prisma.webhookConfig.create({
            data: {
                name: data.name || "",
                url: data.url || "",
                headers: data.headers || {},
                events: data.events || [],
                enabled: data.enabled ?? true,
                secret: data.secret,
                retryPolicy: data.retryPolicy,
                createdBy: data.createdBy || "system",
            },
        });
        return this.formatWebhookConfig(webhook);
    }
    async getWebhookConfigById(id) {
        const webhook = await prisma_1.prisma.webhookConfig.findUnique({
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
    async getWebhookConfigByName(name) {
        const webhook = await prisma_1.prisma.webhookConfig.findFirst({
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
    async listWebhookConfigs(options = {}) {
        const { page = 1, limit = 20, search, enabled } = options;
        const skip = (page - 1) * limit;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { url: { contains: search, mode: "insensitive" } },
            ];
        }
        if (enabled !== undefined) {
            where.enabled = enabled;
        }
        const total = await prisma_1.prisma.webhookConfig.count({ where });
        const webhooks = await prisma_1.prisma.webhookConfig.findMany({
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
        const items = webhooks.map((webhook) => this.formatWebhookConfig(webhook));
        return {
            items,
            total,
            page,
            limit,
        };
    }
    async updateWebhookConfig(id, data) {
        const updateData = {
            updatedAt: new Date(),
        };
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.url !== undefined)
            updateData.url = data.url;
        if (data.events !== undefined)
            updateData.events = data.events;
        if (data.headers !== undefined)
            updateData.headers = data.headers;
        if (data.secret !== undefined)
            updateData.secret = data.secret;
        if (data.enabled !== undefined)
            updateData.enabled = data.enabled;
        if (data.retryPolicy !== undefined)
            updateData.retryPolicy = data.retryPolicy;
        if (data.createdBy !== undefined)
            updateData.createdBy = data.createdBy;
        const webhook = await prisma_1.prisma.webhookConfig.update({
            where: { id },
            data: updateData,
        });
        return this.formatWebhookConfig(webhook);
    }
    async deleteWebhookConfig(id) {
        // Verifica entregas pendentes (responseStatus null)
        const pendingCount = await prisma_1.prisma.webhookDelivery.count({
            where: {
                webhookId: id,
                responseStatus: null,
            },
        });
        if (pendingCount > 0) {
            throw new Error(`Cannot delete webhook with ${pendingCount} pending deliveries`);
        }
        // Deleta em transação
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.webhookDelivery.deleteMany({ where: { webhookId: id } }),
            prisma_1.prisma.webhookConfig.delete({ where: { id } }),
        ]);
    }
    // ---- Wrappers para compatibilidade com rotas existentes ----
    /** Compatível com rotas: obter por id */
    async getWebhookById(id) {
        return this.getWebhookConfigById(id);
    }
    /** Compatível com rotas: obter por name */
    async getWebhookByName(name) {
        return this.getWebhookConfigByName(name);
    }
    /** Compatível com rotas: criar webhook */
    async createWebhook(data) {
        return this.createWebhookConfig(data);
    }
    /** Compatível com rotas: update simples */
    async updateWebhook(id, data) {
        return this.updateWebhookConfig(id, data);
    }
    /** Compatível com rotas: delete simples */
    async deleteWebhook(id, _force = false) {
        return this.deleteWebhookConfig(id);
    }
    /** Opcional: lista com paginação genérica */
    async getAllWebhooks(options = {}) {
        const { page = 1, limit = 20, search, enabled, events, sortBy = "createdAt", sortOrder = "desc", } = options;
        const where = {};
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
            prisma_1.prisma.webhookConfig.count({ where }),
            prisma_1.prisma.webhookConfig.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
            }),
        ]);
        const items = webhooks.map((w) => this.formatWebhookConfig(w));
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
    async getWebhookStats() {
        const deliveries = (await prisma_1.prisma.webhookDelivery.findMany({
            select: {
                responseStatus: true,
                createdAt: true,
                deliveredAt: true,
            },
            orderBy: { deliveredAt: "desc" },
            take: 1000,
        }));
        const totalWebhooks = await prisma_1.prisma.webhookConfig.count();
        const activeWebhooks = await prisma_1.prisma.webhookConfig.count({ where: { enabled: true } });
        const successfulDeliveries = deliveries.filter((d) => d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300).length;
        const failedDeliveries = deliveries.filter((d) => d.responseStatus != null && (d.responseStatus < 200 || d.responseStatus >= 300)).length;
        const pendingDeliveries = deliveries.filter((d) => d.responseStatus == null).length;
        const totalDeliveries = successfulDeliveries + failedDeliveries + pendingDeliveries;
        const delivered = deliveries.filter((d) => d.deliveredAt != null && d.createdAt != null);
        const averageResponseTime = delivered.reduce((sum, d) => sum + ((d.deliveredAt?.getTime() ?? 0) - d.createdAt.getTime()), 0) /
            (delivered.length || 1);
        return {
            totalWebhooks,
            activeWebhooks,
            totalDeliveries,
            successfulDeliveries,
            failedDeliveries,
            pendingDeliveries,
            averageResponseTime,
            lastSuccessAt: deliveries.find((d) => d.responseStatus != null &&
                d.responseStatus >= 200 &&
                d.responseStatus < 300)?.deliveredAt ?? null,
            lastFailureAt: deliveries.find((d) => d.responseStatus != null &&
                (d.responseStatus < 200 || d.responseStatus >= 300))?.deliveredAt ?? null,
        };
    }
    // ---------------------------------------------------------------------------
    // Estatísticas por webhookId
    // ---------------------------------------------------------------------------
    async getWebhookStatsById(webhookId) {
        const deliveries = (await prisma_1.prisma.webhookDelivery.findMany({
            where: { webhookId },
            select: {
                responseStatus: true,
                deliveredAt: true,
                createdAt: true,
                attempts: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1000,
        }));
        const totalDeliveries = deliveries.length;
        const successfulDeliveries = deliveries.filter((d) => d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300).length;
        const failedDeliveries = deliveries.filter((d) => d.responseStatus != null && (d.responseStatus < 200 || d.responseStatus >= 300)).length;
        const pendingDeliveries = deliveries.filter((d) => d.responseStatus == null).length;
        const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;
        // Consecutivos com falha (do mais recente para trás)
        let consecutiveFailures = 0;
        for (const d of deliveries) {
            if (d.responseStatus != null && (d.responseStatus < 200 || d.responseStatus >= 300)) {
                consecutiveFailures++;
            }
            else if (d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300) {
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
            lastSuccessAt: deliveries.find((d) => d.responseStatus != null &&
                d.responseStatus >= 200 &&
                d.responseStatus < 300)?.deliveredAt || undefined,
            lastFailureAt: deliveries.find((d) => d.responseStatus != null &&
                (d.responseStatus < 200 || d.responseStatus >= 300))?.deliveredAt || undefined,
            consecutiveFailures,
        };
    }
    // ---------------------------------------------------------------------------
    // Listagem de deliveries (filtro/paginação)
    // ---------------------------------------------------------------------------
    async getWebhookDeliveries(webhookId, options = {}) {
        const { page = 1, limit = 50, status, eventType, startTime, sortBy = "createdAt", sortOrder = "desc", } = options;
        const where = { webhookId };
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
        const deliveries = await prisma_1.prisma.webhookDelivery.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            ...(limit > 0 && {
                skip: (page - 1) * limit,
                take: limit,
            }),
        });
        const items = deliveries.map((delivery) => this.formatWebhookDelivery(delivery));
        let pagination;
        if (limit > 0) {
            const total = await prisma_1.prisma.webhookDelivery.count({ where });
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
    async getWebhookDeliveryById(id) {
        const delivery = await prisma_1.prisma.webhookDelivery.findUnique({
            where: { id },
            include: {
                webhook: {
                    select: { name: true, url: true },
                },
            },
        });
        return delivery ? this.formatWebhookDelivery(delivery) : null;
    }
    async retryWebhookDelivery(id) {
        const delivery = await prisma_1.prisma.webhookDelivery.update({
            where: { id },
            data: {
                responseStatus: null,
                responseBody: null,
                attempts: { increment: 1 },
            },
        });
        await webhook_queue_1.webhookQueue.add("deliver-webhook", {
            deliveryId: id,
            webhookId: delivery.webhookId,
            attempt: delivery.attempts,
        }, {
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: 100,
            removeOnFail: 50,
        });
        return this.formatWebhookDelivery(delivery);
    }
    async retryFailedDeliveries(webhookId) {
        const result = await prisma_1.prisma.webhookDelivery.updateMany({
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
    async cancelPendingDeliveries(webhookId) {
        const result = await prisma_1.prisma.webhookDelivery.updateMany({
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
    async resetWebhookFailures(webhookId) {
        await prisma_1.prisma.webhookDelivery.updateMany({
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
    async markDeliveryAsDelivered(id, responseStatus, responseBody, _responseTime) {
        await prisma_1.prisma.webhookDelivery.update({
            where: { id },
            data: {
                responseStatus,
                responseBody,
                deliveredAt: new Date(),
                // NOTE: se houver coluna responseTime, setar aqui
            },
        });
    }
    async markDeliveryAsFailed(id, error) {
        await prisma_1.prisma.webhookDelivery.update({
            where: { id },
            data: {
                responseStatus: 0, // network/timeout error
                responseBody: error,
            },
        });
    }
    async getActiveWebhookConfigs() {
        const webhooks = await prisma_1.prisma.webhookConfig.findMany({
            where: { enabled: true },
            include: {
                deliveries: {
                    where: { responseStatus: null },
                    take: 1,
                },
            },
        });
        return webhooks.map((webhook) => this.formatWebhookConfig(webhook));
    }
    async createWebhookDelivery(webhookId, payload, headers = {}) {
        const delivery = await prisma_1.prisma.webhookDelivery.create({
            data: {
                webhookId,
                eventType: defaultEvent,
                payload,
                attempts: 0,
            },
        });
        return this.formatWebhookDelivery(delivery);
    }
    /**
     * Trigger webhook for an event
     */
    async triggerWebhook(event) {
        const webhooks = await this.getWebhooksForEvent(event.eventType);
        for (const webhook of webhooks) {
            if (!this.shouldTriggerWebhook(webhook, event))
                continue;
            const deliveryId = await this.createDelivery(webhook.id, event);
            await webhook_queue_1.webhookQueue.add("deliver-webhook", {
                deliveryId,
                webhookId: webhook.id,
                attempt: 1,
            }, {
                attempts: webhook.retryPolicy?.maxAttempts || 3,
                backoff: {
                    type: webhook.retryPolicy?.backoffType || "exponential",
                    delay: webhook.retryPolicy?.initialDelay || 1000,
                },
                removeOnComplete: 100,
                removeOnFail: 50,
            });
        }
    }
    /**
     * Test webhook delivery
     */
    async testWebhook(webhookId, eventType, payload) {
        const webhook = await this.getWebhook(webhookId);
        if (!webhook) {
            throw new Error(`Webhook not found: ${webhookId}`);
        }
        const deliveryId = await this.createDelivery(webhookId, {
            eventType: eventType,
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
        }
        catch (error) {
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
    async deliverWebhook(deliveryId) {
        const delivery = await prisma_1.prisma.webhookDelivery.findUnique({
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
            const headers = {
                "Content-Type": "application/json",
                "User-Agent": "ChatWit-Webhook/1.0",
                "X-Webhook-Event": delivery.eventType,
                "X-Webhook-Delivery": deliveryId,
                "X-Webhook-Timestamp": delivery.createdAt.toISOString(),
                ...webhook.headers,
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
            await prisma_1.prisma.webhookDelivery.update({
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
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            await prisma_1.prisma.webhookDelivery.update({
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
    async getWebhooksForEvent(eventType) {
        const webhooks = await prisma_1.prisma.webhookConfig.findMany({
            where: {
                enabled: true,
                events: { array_contains: eventType },
            },
        });
        return webhooks.map((webhook) => this.formatWebhookConfig(webhook));
    }
    shouldTriggerWebhook(webhook, event) {
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
    async createDelivery(webhookId, event) {
        const deliveryId = (0, uuid_1.v4)();
        await prisma_1.prisma.webhookDelivery.create({
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
    generateSecret() {
        return crypto.randomBytes(32).toString("hex");
    }
    generateSignature(payload, secret) {
        return crypto.createHmac("sha256", secret).update(payload).digest("hex");
    }
    async cacheWebhookConfig(webhook) {
        const config = this.formatWebhookConfig(webhook);
        await redis_1.connection.setex(`webhook:config:${webhook.id}`, 3600, // 1 hour
        JSON.stringify(config));
    }
    async getCachedWebhookConfig(webhookId) {
        try {
            const cached = await redis_1.connection.get(`webhook:config:${webhookId}`);
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            console.error("[WebhookManager] Error getting cached webhook config:", error);
            return null;
        }
    }
    /** Tornado público para compatibilidade com rotas que chamam getWebhook */
    async getWebhook(webhookId) {
        const cached = await this.getCachedWebhookConfig(webhookId);
        if (cached)
            return cached;
        const webhook = await prisma_1.prisma.webhookConfig.findUnique({ where: { id: webhookId } });
        if (!webhook)
            return null;
        await this.cacheWebhookConfig(webhook);
        return this.formatWebhookConfig(webhook);
    }
    formatWebhookConfig(webhook) {
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
    formatWebhookDelivery(delivery) {
        let status = "pending";
        if (delivery.responseStatus != null) {
            if (delivery.responseStatus >= 200 && delivery.responseStatus < 300) {
                status = "success";
            }
            else {
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
            error: delivery.responseStatus != null &&
                (delivery.responseStatus < 200 || delivery.responseStatus >= 300)
                ? delivery.responseBody
                : undefined,
            nextRetryAt: delivery.nextRetryAt ?? null,
            deliveredAt: delivery.deliveredAt ?? null,
            createdAt: delivery.createdAt,
        };
    }
}
exports.WebhookManager = WebhookManager;
// Global webhook manager instance
exports.webhookManager = WebhookManager.getInstance();
