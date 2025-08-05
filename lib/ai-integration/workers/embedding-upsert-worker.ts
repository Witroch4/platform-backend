/**
 * Embedding Upsert Worker
 * Requirements: 8.1, 8.2
 */

import { Worker, Job } from "bullmq";
import { QUEUE_NAMES, embeddingUpsertWorkerOptions } from "../queues/config";
import { EmbeddingUpsertJobData, JobResult } from "../types/job-data";
import { aiLogger as logger } from "../utils/logger";
import { addToDLQ } from "../queues/dlq";
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();

// Worker instance
let embeddingUpsertWorker: Worker<EmbeddingUpsertJobData, JobResult> | null =
  null;

/**
 * Process embedding upsert job
 */
async function processEmbeddingUpsert(
  job: Job<EmbeddingUpsertJobData>
): Promise<JobResult> {
  const startTime = Date.now();
  const { data } = job;

  logger.info("🔄 Processing embedding upsert job", {
    jobId: job.id,
    traceId: data.traceId,
    stage: "queue",
    metadata: {
      intentId: data.intentId,
      operation: data.operation,
    },
  });

  try {
    // Create distributed tracing span
    const span = createTraceSpan("embedding-upsert-processing", {
      traceId: data.traceId,
      intentId: data.intentId,
      operation: data.operation,
    });

    let result: JobResult;

    try {
      switch (data.operation) {
        case "create":
          result = await createIntentEmbedding(data, span);
          break;
        case "update":
          result = await updateIntentEmbedding(data, span);
          break;
        case "delete":
          result = await deleteIntentEmbedding(data, span);
          break;
        default:
          throw new Error(`Unknown operation: ${data.operation}`);
      }

      span.setStatus({ code: "OK" });
      span.end();

      const processingTime = Date.now() - startTime;

      logger.info("✅ Embedding upsert job completed", {
        jobId: job.id,
        traceId: data.traceId,
        stage: "queue",
        metadata: {
          intentId: data.intentId,
          operation: data.operation,
          success: result.success,
          processingTimeMs: processingTime,
        },
      });

      return {
        ...result,
        metrics: {
          ...result.metrics,
          processingTimeMs: processingTime,
        },
      };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: "ERROR", message: (error as Error).message });
      span.end();
      throw error;
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("❌ Embedding upsert job failed", {
      jobId: job.id,
      traceId: data.traceId,
      stage: "queue",
      error: (error as Error).message,
      metadata: {
        intentId: data.intentId,
        operation: data.operation,
        processingTimeMs: processingTime,
      },
    });

    // Determine if this should be retried or sent to DLQ
    const shouldRetry = shouldRetryJob(error as Error, job.attemptsMade);

    if (!shouldRetry) {
      // Send to DLQ
      await addToDLQ(job, (error as Error).message, "embedding-upsert");
    }

    throw error;
  }
}

/**
 * Create intent embedding
 */
async function createIntentEmbedding(
  data: EmbeddingUpsertJobData,
  span: any
): Promise<JobResult> {
  span.addEvent("create-embedding-started");

  try {
    // Generate embedding using OpenAI
    const embedding = await generateEmbedding(data.text);
    span.addEvent("embedding-generated", { dimensions: embedding.length });

    // Save to database

    const intent = await prisma.intent.create({
      data: {
        id: data.intentId,
        name: data.intentName,
        description: data.description,
        actionType: "TEMPLATE", // Default action type
        similarityThreshold: 0.8, // Default threshold
        slug: data.intentName.toLowerCase().replace(/\s+/g, "-"), // Generate slug from name
        createdById: "system", // Default system user - should be adjusted based on context
      },
    });

    span.addEvent("intent-created", { intentId: intent.id });

    logger.info("✅ Intent embedding created", {
      traceId: data.traceId,
      stage: "queue",
      metadata: {
        intentId: data.intentId,
        intentName: data.intentName,
      },
    });

    return {
      success: true,
      result: {
        intentId: intent.id,
        operation: "create",
        embeddingDimensions: embedding.length,
      },
    };
  } catch (error) {
    span.recordException(error as Error);
    throw new Error(
      `Failed to create intent embedding: ${(error as Error).message}`
    );
  }
}

/**
 * Update intent embedding
 */
async function updateIntentEmbedding(
  data: EmbeddingUpsertJobData,
  span: any
): Promise<JobResult> {
  span.addEvent("update-embedding-started");

  try {
    // Generate new embedding
    const embedding = await generateEmbedding(data.text);
    span.addEvent("embedding-generated", { dimensions: embedding.length });

    // Update in database

    const intent = await prisma.intent.update({
      where: { id: data.intentId },
      data: {
        name: data.intentName,
        description: data.description,
        updatedAt: new Date(),
      },
    });

    span.addEvent("intent-updated", { intentId: intent.id });

    logger.info("✅ Intent embedding updated", {
      traceId: data.traceId,
      stage: "queue",
      metadata: {
        intentId: data.intentId,
        intentName: data.intentName,
      },
    });

    return {
      success: true,
      result: {
        intentId: intent.id,
        operation: "update",
        embeddingDimensions: embedding.length,
      },
    };
  } catch (error) {
    span.recordException(error as Error);
    throw new Error(
      `Failed to update intent embedding: ${(error as Error).message}`
    );
  }
} /*
 *
 * Delete intent embedding
 */
async function deleteIntentEmbedding(
  data: EmbeddingUpsertJobData,
  span: any
): Promise<JobResult> {
  span.addEvent("delete-embedding-started");

  try {
    // Delete from database

    await prisma.intent.delete({
      where: { id: data.intentId },
    });

    span.addEvent("intent-deleted", { intentId: data.intentId });

    logger.info("✅ Intent embedding deleted", {
      traceId: data.traceId,
      stage: "queue",
      metadata: {
        intentId: data.intentId,
      },
    });

    return {
      success: true,
      result: {
        intentId: data.intentId,
        operation: "delete",
      },
    };
  } catch (error) {
    span.recordException(error as Error);
    throw new Error(
      `Failed to delete intent embedding: ${(error as Error).message}`
    );
  }
}

/**
 * Generate embedding using OpenAI (placeholder)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // TODO: Implement actual OpenAI embedding generation
  // For now, return a mock embedding vector

  logger.debug("Generating embedding for text", {
    metadata: { textLength: text.length },
  });

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Return mock 1536-dimensional embedding (text-embedding-3-small size)
  const embedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);

  return embedding;
}

/**
 * Determine if job should be retried
 */
function shouldRetryJob(error: Error, attemptsMade: number): boolean {
  const errorMessage = error.message.toLowerCase();

  // Don't retry client errors (4xx)
  if (
    errorMessage.includes("400") ||
    errorMessage.includes("401") ||
    errorMessage.includes("403") ||
    errorMessage.includes("404")
  ) {
    return false;
  }

  // Don't retry database constraint violations
  if (
    errorMessage.includes("unique constraint") ||
    errorMessage.includes("foreign key constraint")
  ) {
    return false;
  }

  // Don't retry if max attempts reached
  if (attemptsMade >= 3) {
    return false;
  }

  // Retry server errors and timeouts
  return true;
}

/**
 * Create distributed tracing span (placeholder)
 */
function createTraceSpan(name: string, attributes: Record<string, any>) {
  // TODO: Implement proper distributed tracing (OpenTelemetry)
  // For now, return a mock span
  return {
    addEvent: (name: string, attributes?: Record<string, any>) => {
      logger.debug(`Trace event: ${name}`, attributes);
    },
    recordException: (error: Error) => {
      logger.error("Trace exception recorded", { error: error.message });
    },
    setStatus: (status: { code: string; message?: string }) => {
      logger.debug("Trace status set", { metadata: status });
    },
    end: () => {
      logger.debug("Trace span ended");
    },
  };
}

/**
 * Initialize Embedding Upsert Worker
 */
export function initializeEmbeddingUpsertWorker(): Worker<
  EmbeddingUpsertJobData,
  JobResult
> {
  if (embeddingUpsertWorker) {
    return embeddingUpsertWorker;
  }

  embeddingUpsertWorker = new Worker<EmbeddingUpsertJobData, JobResult>(
    QUEUE_NAMES.AI_EMBEDDING_UPSERT,
    processEmbeddingUpsert,
    embeddingUpsertWorkerOptions
  );

  // Setup event listeners
  embeddingUpsertWorker.on("completed", (job, result) => {
    logger.info("✅ Embedding upsert worker job completed", {
      jobId: job.id,
      traceId: job.data.traceId,
      stage: "queue",
      metadata: {
        intentId: job.data.intentId,
        operation: job.data.operation,
        success: result.success,
      },
    });
  });

  embeddingUpsertWorker.on("failed", (job, err) => {
    logger.error("❌ Embedding upsert worker job failed", {
      jobId: job?.id,
      traceId: job?.data?.traceId,
      stage: "queue",
      error: err.message,
      metadata: {
        intentId: job?.data?.intentId,
        operation: job?.data?.operation,
        attempts: job?.attemptsMade,
      },
    });
  });

  embeddingUpsertWorker.on("stalled", (jobId) => {
    logger.warn("⚠️ Embedding upsert worker job stalled", { jobId });
  });

  embeddingUpsertWorker.on("error", (err) => {
    logger.error("❌ Embedding upsert worker error", { error: err.message });
  });

  logger.info("🚀 Embedding Upsert Worker initialized", {
    stage: "queue",
    metadata: {
      queueName: QUEUE_NAMES.AI_EMBEDDING_UPSERT,
      concurrency: embeddingUpsertWorkerOptions.concurrency,
    },
  });

  return embeddingUpsertWorker;
}

/**
 * Get Embedding Upsert Worker instance
 */
export function getEmbeddingUpsertWorker(): Worker<
  EmbeddingUpsertJobData,
  JobResult
> | null {
  return embeddingUpsertWorker;
}

/**
 * Close Embedding Upsert Worker
 */
export async function closeEmbeddingUpsertWorker(): Promise<void> {
  if (embeddingUpsertWorker) {
    await embeddingUpsertWorker.close();
    embeddingUpsertWorker = null;
    logger.info("🔌 Embedding Upsert Worker closed");
  }
}
