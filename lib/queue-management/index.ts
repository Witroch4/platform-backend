/**
 * Queue Management System
 *
 * Main entry point for the BullMQ queue management system
 */

// Configuration
export { default as getQueueManagementConfig, type QueueManagementConfig } from "./config";

// Export specific constants to avoid conflicts
export {
	JOB_STATES,
	QUEUE_STATES,
	ERROR_CODES,
	HTTP_STATUS,
	// Exclude AlertSeverity and AlertStatus to avoid conflicts
} from "./constants";

// Export specific types to avoid conflicts - using type exports for isolatedModules
export type { AlertAnomaly, JobBatchResult, MetricsExportResult } from "./types";

// Services
export * from "./services";

// Cache
export * from "./cache";

// Utils
export * from "./utils";

// Integration with existing system
export * from "./integration/system-integration";

// Seeds for initial data
export * from "./seeds/initial-data";
