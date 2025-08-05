/**
 * Constants for AI Integration
 * Based on requirements 13.1, 13.2
 */

export const QUEUE_NAMES = {
  AI_INCOMING_MESSAGE: 'ai:incoming-message',
  AI_EMBEDDING_UPSERT: 'ai:embedding-upsert',
} as const;

export const CHANNEL_LIMITS = {
  whatsapp: {
    body: 1024,
    header: 60,
    footer: 60,
    buttons: { min: 1, max: 3 },
    buttonTitle: 20,
    buttonId: 256,
  },
  instagram: {
    quickReply: {
      text: 1000,
      maxItems: 13, // Capar em 3 por UX
      title: 20,
      payload: 1000,
    },
    buttonTemplate: {
      text: 640,
      buttons: { min: 1, max: 3 },
      title: 20,
      requireHttps: true,
    },
  },
} as const;

export const RATE_LIMITS = {
  conversation: { limit: 8, window: 10 }, // 8/10s
  account: { limit: 80, window: 10 }, // 80/10s
  contact: { limit: 15, window: 10 }, // 15/10s
} as const;

export const REDIS_KEYS = {
  idempotency: (accountId: number, conversationId: number, messageId: string) =>
    `idem:cw:${accountId}:${conversationId}:${messageId}`,
  rateLimitConversation: (conversationId: number) => `rl:conv:${conversationId}`,
  rateLimitAccount: (accountId: number) => `rl:acc:${accountId}`,
  rateLimitContact: (contactId: number) => `rl:contact:${contactId}`,
  conversationContext: (conversationId: number) => `ctx:conv:${conversationId}`,
  embeddingCache: (textHash: string) => `emb:cache:${textHash}`,
  llmCache: (textHash: string, channel: string, accountId: number) =>
    `llm:cache:${textHash}:${channel}:${accountId}`,
  circuitBreaker: (service: string) => `cb:${service}`,
  outboundJournal: (conversationId: number, payloadHash: string) =>
    `out:${conversationId}:${payloadHash}`,
} as const;

export const TTL = {
  idempotency: 300, // 5 minutes
  rateLimitWindow: 10, // 10 seconds
  conversationContext: 900, // 15 minutes
  embeddingCache: 3600, // 1 hour
  llmCache: 1800, // 30 minutes
  outboundJournal: 60, // 1 minute
  auditData: 90 * 24 * 60 * 60, // 90 days
} as const;

export const LLM_MODELS = {
  embedding: 'text-embedding-3-small',
  generation: 'gpt-4o-mini',
} as const;

export const EMBEDDING_DIMENSIONS = 1536;

export const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

export const WEBHOOK_TIMESTAMP_WINDOW = 300; // 5 minutes

export const SCHEMA_VERSION = '1.0.0';

export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  recoveryTimeout: 30000, // 30 seconds
  monitoringWindow: 60000, // 60 seconds
} as const;

export const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelay: 1000, // 1 second
} as const;

export const PERFORMANCE_TARGETS = {
  p95LatencyMs: 2500,
  p99LatencyMs: 5000,
  coldStartP95Ms: 1000,
  webhookResponseMs: 150,
} as const;

export const BUTTON_PAYLOAD_PREFIXES = {
  intent: 'intent:',
  flow: 'flow:',
  help: 'help:',
} as const;

export const FALLBACK_MESSAGES = {
  humanHandoff: 'Acionei um atendente humano',
  llmFailure: 'Desculpe, não consegui processar sua mensagem. Um atendente irá ajudá-lo.',
  rateLimited: 'Muitas mensagens recebidas. Aguarde um momento.',
  systemError: 'Ocorreu um erro interno. Um atendente irá ajudá-lo.',
} as const;