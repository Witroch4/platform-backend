import { Worker, Job } from "bullmq";
import { getRedisInstance } from "../../lib/connections";
import {
  RESPOSTA_RAPIDA_QUEUE_NAME,
  RespostaRapidaJobData,
  handleJobFailure,
} from "../../lib/queue/resposta-rapida.queue";
import { recordWorkerMetrics } from "../../lib/monitoring/application-performance-monitor";

import { IntentProcessor } from "../processors/intent.processor";
import { ButtonProcessor } from "../processors/button.processor";
import { WorkerResponse } from "../types/types";

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

const intentProcessor = new IntentProcessor();
const buttonProcessor = new ButtonProcessor();

// ============================================================================
// TASK PROCESSING FUNCTION (for Parent Worker delegation)
// ============================================================================

/**
 * Process Resposta Rapida task - extracted logic for Parent Worker delegation
 * This function contains the core processing logic that was previously in the worker
 */
export async function processRespostaRapidaTask(
  job: Job<RespostaRapidaJobData>
): Promise<any> {
  const { data } = job.data;
  const startTime = Date.now();

  console.log(`[Resposta Rapida Task] Processing job: ${job.name}`, {
    correlationId: data.correlationId,
    interactionType: data.interactionType,
    jobId: job.id,
  });

  try {
    let result: WorkerResponse;

    // Route to appropriate processor based on interaction type
    if (data.interactionType === "intent") {
      if (!data.intentName) {
        throw new Error("Intent name is required for intent processing");
      }
      result = await intentProcessor.processIntent(
        data.intentName,
        data.inboxId,
        data.credentials,
        data.contactPhone,
        data.wamid,
        data.correlationId
      );
    } else if (data.interactionType === "button_reply") {
      if (!data.buttonId) {
        throw new Error("Button ID is required for button processing");
      }
      result = await buttonProcessor.processButtonClick(
        data.buttonId,
        data.inboxId,
        data.credentials,
        data.contactPhone,
        data.wamid,
        data.correlationId
      );
    } else {
      throw new Error(`Unknown interaction type: ${data.interactionType}`);
    }

    const processingTime = Date.now() - startTime;
    recordWorkerMetrics({
      jobId: job.id || "unknown",
      jobType: job.name,
      processingTime,
      queueWaitTime: 0,
      timestamp: new Date(),
      success: result.success,
      error: result.error,
      correlationId: data.correlationId,
      retryCount: job.attemptsMade || 0,
    });

    if (!result.success) {
      throw new Error(
        result.error || "Processing failed without error message"
      );
    }

    console.log(
      `[Resposta Rapida Task] Job ${job.name} completed successfully`,
      {
        correlationId: data.correlationId,
        jobId: job.id,
        processingTime,
      }
    );

    return result;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(`[Resposta Rapida Task] Job ${job.name} failed`, {
      correlationId: data.correlationId,
      jobId: job.id,
      error: errorMessage,
      processingTime,
    });

    recordWorkerMetrics({
      jobId: job.id || "unknown",
      jobType: job.name,
      processingTime,
      queueWaitTime: 0,
      timestamp: new Date(),
      success: false,
      error: errorMessage,
      correlationId: data.correlationId,
      retryCount: job.attemptsMade || 0,
    });

    await handleJobFailure(job, error as Error);

    throw error;
  }
}

// ============================================================================
// STANDALONE WORKER (for backward compatibility)
// ============================================================================

// Create the high priority worker
export const respostaRapidaWorker = new Worker<RespostaRapidaJobData>(
  RESPOSTA_RAPIDA_QUEUE_NAME,
  processRespostaRapidaTask,
  {
    connection: getRedisInstance(),
    concurrency: 100, // Ajuste conforme necessário
    limiter: {
      max: 1000,
      duration: 1000, // 1000 jobs por segundo
    },
  }
);

console.log("[Resposta Rapida Worker] Worker started successfully");
