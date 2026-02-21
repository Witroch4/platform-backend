/**
 * webhook.worker.ts — LEGACY STUB
 *
 * [CLEANUP 2026-02-21] This file was the original "God Object" (600+ lines).
 * All its responsibilities have been moved:
 *
 *   - Worker definitions → worker/registry.ts (single source of truth)
 *   - Worker instantiation → worker/init.ts (registry-driven loop)
 *   - Event handlers → worker/utils/worker-events.ts (attachStandardEventHandlers)
 *   - Cron jobs → worker/cron-jobs.ts (initCronJobs)
 *   - Processors → worker/WebhookWorkerTasks/*.task.ts (unchanged)
 *   - Instagram config → worker/config/instagram-translation-worker.config.ts (unchanged)
 *
 * This file is kept temporarily for any lingering imports.
 * It can be deleted once all references are removed.
 */

// Re-export config for any legacy consumers
export { getCurrentWorkerConfig as instagramWorkerConfig } from "./config/instagram-translation-worker.config";
