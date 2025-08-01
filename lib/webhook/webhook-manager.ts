import { prisma } from '../prisma';
import { connection as redis } from '../redis';
import type { WebhookConfig, WebhookDelivery } from '@prisma/client';

export interface CreateWebhookDTO {
  accountId: string;
  url: string;
  httpMethod?: string;
  headers?: Record<string, string>;
  events?: string[];
  requestTimeout?: number;
  enabled?: boolean;
}

export interface UpdateWebhookDTO {
  url?: string;
  httpMethod?: string;
  headers?: Record<string, string>;
  events?: string[];
  requestTimeout?: number;
  enabled?: boolean;
}

/** Create a new webhook configuration */
export async function createWebhook(
  data: CreateWebhookDTO
): Promise<WebhookConfig> {
  return prisma.webhookConfig.create({
    data: {
      accountId: data.accountId,
      url: data.url,
      httpMethod: data.httpMethod ?? 'POST',
      headers: data.headers ?? {},
      events: data.events ?? [],
      requestTimeout: data.requestTimeout ?? 10000,
      enabled: data.enabled ?? true,
    },
  });
}

/** Fetch a single webhook configuration by id */
export async function getWebhook(id: string): Promise<WebhookConfig | null> {
  return prisma.webhookConfig.findUnique({ where: { id } });
}

/** List webhook configurations for an account */
export async function listWebhooks(accountId: string): Promise<WebhookConfig[]> {
  return prisma.webhookConfig.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Update a webhook configuration */
export async function updateWebhook(
  id: string,
  data: UpdateWebhookDTO
): Promise<WebhookConfig> {
  return prisma.webhookConfig.update({
    where: { id },
    data: {
      url: data.url,
      httpMethod: data.httpMethod,
      headers: data.headers,
      events: data.events,
      requestTimeout: data.requestTimeout,
      enabled: data.enabled,
    },
  });
}

/** Delete a webhook configuration */
export async function deleteWebhook(id: string): Promise<void> {
  await prisma.webhookConfig.delete({ where: { id } });
}

export interface LogDeliveryDTO {
  webhookConfigId: string;
  responseStatus: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
}

/** Store webhook delivery result */
export async function logWebhookDelivery(
  data: LogDeliveryDTO
): Promise<WebhookDelivery> {
  return prisma.webhookDelivery.create({
    data: {
      webhookConfigId: data.webhookConfigId,
      responseStatus: data.responseStatus,
      responseBody: data.responseBody ?? '',
      responseHeaders: data.responseHeaders ?? {},
    },
  });
}

/** Aggregate delivery statistics for a webhook */
export async function getWebhookStats(webhookConfigId: string) {
  return prisma.webhookDelivery.aggregate({
    where: { webhookConfigId },
    _count: true,
    _min: { responseStatus: true, createdAt: true },
    _max: { responseStatus: true, createdAt: true },
  });
}

/** Queue webhook payload for asynchronous processing */
export async function queueWebhookPayload(id: string, payload: unknown) {
  await redis.rpush(`webhook:${id}`, JSON.stringify(payload));
}
