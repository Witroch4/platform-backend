/**
 * BullMQ Queue Configuration
 * Requirements: 7.1, 7.2, 7.3
 */

import { QueueOptions, WorkerOptions, JobsOptions } from "bullmq";

// Queue Names (BullMQ doesn't allow : in queue names)
export const QUEUE_NAMES = {
  AI_INCOMING_MESSAGE: "ai-incoming-message",
  AI_EMBEDDING_UPSERT: "ai-embedding-upsert",
} as const;

// Redis connection for BullMQ
export const getQueueRedisConnection = () => {
  // Check if we're using test Redis
  const useTestRedis = process.env.USE_TEST_REDIS === "true";

  if (useTestRedis) {
    console.log("🔗 Using Test Redis for BullMQ queues on port 6380");
    return {
      host: "localhost",
      port: 6380,
      password: undefined,
      db: 15, // Use same test database as other test Redis connections
    };
  }

  // Use the same configuration as the main Redis connection
  const isProduction = process.env.NODE_ENV === "production";
  const isDocker = process.env.RUN_IN_DOCKER === "true" || isProduction;

  const defaultHost = isDocker ? "redis" : "localhost";
  const redisHost = process.env.REDIS_HOST || defaultHost;
  const redisPort = parseInt(process.env.REDIS_PORT || "6379");
  const redisPassword = process.env.REDIS_PASSWORD;

  return {
    host: redisHost,
    port: redisPort,
    password: redisPassword || undefined,
    db: 0,
  };
};

// Base queue options
export const baseQueueOptions: QueueOptions = {
  connection: getQueueRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3, // Maximum retry attempts
    backoff: {
      type: "exponential",
      delay: 1000, // Start with 1s delay
    },
  },
};

// AI Message Queue specific options
export const aiMessageQueueOptions: QueueOptions = {
  ...baseQueueOptions,
  defaultJobOptions: {
    ...baseQueueOptions.defaultJobOptions,
    priority: 0, // Normal priority by default
    delay: 0, // No delay by default
  },
};

// Embedding Upsert Queue specific options
export const embeddingUpsertQueueOptions: QueueOptions = {
  ...baseQueueOptions,
  defaultJobOptions: {
    ...baseQueueOptions.defaultJobOptions,
    priority: -10, // Lower priority than message processing
    delay: 0,
  },
};

// Worker options
export const baseWorkerOptions: WorkerOptions = {
  connection: getQueueRedisConnection(),
  concurrency: 10, // Process 10 jobs concurrently
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

// AI Message Worker specific options
export const aiMessageWorkerOptions: WorkerOptions = {
  ...baseWorkerOptions,
  concurrency: 10,
  limiter: {
    max: 100, // Max 100 jobs
    duration: 60000, // Per minute
  },
};

// Embedding Upsert Worker specific options
export const embeddingUpsertWorkerOptions: WorkerOptions = {
  ...baseWorkerOptions,
  concurrency: 5, // Lower concurrency for embedding operations
  limiter: {
    max: 50, // Max 50 jobs
    duration: 60000, // Per minute
  },
};

// Job options for different priorities
export const JOB_PRIORITIES = {
  HIGH: 10, // Button clicks, quick replies
  NORMAL: 0, // Regular messages
  LOW: -10, // Background tasks
} as const;

// Retry policies by error type
export const RETRY_POLICIES = {
  // 5xx errors - retry with exponential backoff
  SERVER_ERROR: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 1000, // 1s, 2s, 4s
    },
  },
  // 429 rate limit - retry with longer delays
  RATE_LIMITED: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 5000, // 5s, 10s, 20s
    },
  },
  // 4xx client errors - no retry (send to DLQ immediately)
  CLIENT_ERROR: {
    attempts: 1,
    backoff: {
      type: "fixed" as const,
      delay: 0,
    },
  },
} as const;

// Dead Letter Queue configuration
export const DLQ_OPTIONS = {
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  maxSize: 1000, // Maximum number of items in DLQ
} as const;

// Queue monitoring configuration
export const MONITORING_CONFIG = {
  metricsInterval: 30000, // Collect metrics every 30 seconds
  alertThresholds: {
    queueSize: 100, // Alert if queue size > 100
    failureRate: 0.05, // Alert if failure rate > 5%
    avgProcessingTime: 5000, // Alert if avg processing time > 5s
  },
} as const;
