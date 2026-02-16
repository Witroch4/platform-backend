/**
 * Utility for attaching standardized event handlers to BullMQ workers.
 * Centralizes logging patterns so all workers behave consistently.
 */

import type { Worker, Job } from "bullmq";

interface WorkerEventOptions {
    /** Worker name for log prefix */
    name: string;
    /** Whether to log completed jobs (default: true) */
    logCompleted?: boolean;
    /** Whether to log active jobs (default: false — too noisy) */
    logActive?: boolean;
}

/**
 * Attach standardized event handlers to a BullMQ worker.
 * Provides consistent logging format across all workers.
 */
export function attachStandardEventHandlers(worker: Worker, options: WorkerEventOptions): void {
    const { name, logCompleted = true, logActive = false } = options;
    const prefix = `[${name}]`;

    if (logActive) {
        worker.on("active", (job: Job) => {
            console.log(`${prefix} ▶ Job ${job.id} active`);
        });
    }

    if (logCompleted) {
        worker.on("completed", (job: Job) => {
            console.log(`${prefix} ✅ Job ${job.id} completed`);
        });
    }

    worker.on("failed", (job: Job | undefined, error: Error) => {
        console.error(`${prefix} ❌ Job ${job?.id} failed:`, {
            error: error.message,
            attempts: job?.attemptsMade,
        });
    });

    worker.on("stalled", (jobId: string) => {
        console.warn(`${prefix} ⚠️ Job ${jobId} stalled`);
    });

    worker.on("error", (error: Error) => {
        console.error(`${prefix} 💥 Worker error:`, error.message);
    });
}
