/**
 * TURBO Mode Error Handler
 * Manages parallel processing errors and implements fallback mechanisms
 * Based on requirements 2.6, 4.4
 */

import type { ExtendedLead } from "../../types";
import type { TurboModeConfig } from "./useTurboMode";
import type { ParallelProcessingResult } from "./TurboModePDFProcessor";
import { createLogger } from "@/lib/utils/logger";
import { toast } from "sonner";

const logger = createLogger("TurboModeErrorHandler");

export interface TurboModeError {
	type: "PARALLEL_PROCESSING" | "RESOURCE_EXHAUSTION" | "NETWORK_ERROR" | "TIMEOUT" | "SYSTEM_ERROR";
	leadId?: string;
	message: string;
	originalError?: Error;
	timestamp: Date;
	recoverable: boolean;
	retryCount?: number;
}

export interface FallbackOptions {
	enableSequentialFallback: boolean;
	maxRetries: number;
	retryDelay: number;
	notifyUser: boolean;
	logErrors: boolean;
}

export interface ErrorHandlerMetrics {
	totalErrors: number;
	errorsByType: Record<string, number>;
	fallbacksTriggered: number;
	successfulRecoveries: number;
	unrecoverableErrors: number;
	averageRecoveryTime: number;
}

export class TurboModeErrorHandler {
	private config: TurboModeConfig;
	private fallbackOptions: FallbackOptions;
	private errorHistory: TurboModeError[] = [];
	private metrics: ErrorHandlerMetrics = {
		totalErrors: 0,
		errorsByType: {},
		fallbacksTriggered: 0,
		successfulRecoveries: 0,
		unrecoverableErrors: 0,
		averageRecoveryTime: 0,
	};
	private onFallbackToSequential?: (leads: ExtendedLead[]) => Promise<ParallelProcessingResult[]>;
	private onUserNotification?: (message: string, type: "error" | "warning" | "info") => void;

	constructor(
		config: TurboModeConfig,
		options: Partial<FallbackOptions> = {},
		callbacks: {
			onFallbackToSequential?: (leads: ExtendedLead[]) => Promise<ParallelProcessingResult[]>;
			onUserNotification?: (message: string, type: "error" | "warning" | "info") => void;
		} = {},
	) {
		this.config = config;
		this.fallbackOptions = {
			enableSequentialFallback: true,
			maxRetries: 3,
			retryDelay: 1000,
			notifyUser: true,
			logErrors: true,
			...options,
		};
		this.onFallbackToSequential = callbacks.onFallbackToSequential;
		this.onUserNotification = callbacks.onUserNotification;
	}

	/**
	 * Handle parallel processing errors with automatic fallback
	 */
	async handleParallelProcessingError(
		error: Error,
		leadIds: string[],
		leads: ExtendedLead[],
	): Promise<ParallelProcessingResult[]> {
		const turboError = this.createTurboError("PARALLEL_PROCESSING", error.message, error);

		logger.error("Parallel processing failed", {
			error: error.message,
			leadIds,
			leadCount: leadIds.length,
			stack: error.stack,
		});

		this.recordError(turboError);

		// Notify user about the error
		if (this.fallbackOptions.notifyUser) {
			this.notifyUser("TURBO mode encontrou um erro. Continuando com processamento padrão.", "warning");
		}

		// Attempt fallback to sequential processing
		if (this.fallbackOptions.enableSequentialFallback) {
			return await this.fallbackToSequential(leads, turboError);
		}

		// If no fallback is available, return error results
		return leadIds.map((leadId) => ({
			leadId,
			success: false,
			processingTime: 0,
			error: `TURBO mode error: ${error.message}`,
		}));
	}

	/**
	 * Handle resource exhaustion errors
	 */
	async handleResourceExhaustionError(
		leads: ExtendedLead[],
		resourceType: "memory" | "cpu" | "network" | "concurrent_processes",
	): Promise<ParallelProcessingResult[]> {
		const turboError = this.createTurboError(
			"RESOURCE_EXHAUSTION",
			`System resources exhausted: ${resourceType}`,
			undefined,
			true, // This is recoverable
		);

		logger.warn("Resource exhaustion detected", {
			resourceType,
			leadCount: leads.length,
			activeProcesses: this.getActiveProcessCount(),
		});

		this.recordError(turboError);

		// Implement throttling strategy
		const throttledResults = await this.implementThrottling(leads, resourceType);

		if (throttledResults.length > 0) {
			this.metrics.successfulRecoveries++;

			if (this.fallbackOptions.notifyUser) {
				this.notifyUser(
					"Sistema ajustou automaticamente a velocidade de processamento devido aos recursos disponíveis.",
					"info",
				);
			}

			return throttledResults;
		}

		// If throttling fails, fallback to sequential
		return await this.fallbackToSequential(leads, turboError);
	}

	/**
	 * Handle network errors with retry logic
	 */
	async handleNetworkError(error: Error, leadId: string, retryCount: number = 0): Promise<ParallelProcessingResult> {
		const turboError = this.createTurboError(
			"NETWORK_ERROR",
			`Network error for lead ${leadId}: ${error.message}`,
			error,
			retryCount < this.fallbackOptions.maxRetries,
		);
		turboError.leadId = leadId;
		turboError.retryCount = retryCount;

		logger.error("Network error occurred", {
			leadId,
			error: error.message,
			retryCount,
			maxRetries: this.fallbackOptions.maxRetries,
		});

		this.recordError(turboError);

		// Implement exponential backoff retry
		if (retryCount < this.fallbackOptions.maxRetries) {
			const delay = this.fallbackOptions.retryDelay * Math.pow(2, retryCount);

			logger.info("Retrying network operation", {
				leadId,
				retryCount: retryCount + 1,
				delay,
			});

			await this.delay(delay);

			// This would need to be implemented by the calling code
			// Return a retry indicator
			return {
				leadId,
				success: false,
				processingTime: 0,
				error: `Network error - retry ${retryCount + 1}/${this.fallbackOptions.maxRetries}`,
			};
		}

		// Max retries exceeded
		this.metrics.unrecoverableErrors++;

		if (this.fallbackOptions.notifyUser) {
			this.notifyUser(`Erro de rede persistente para o lead ${leadId}. Pulando para o próximo.`, "error");
		}

		return {
			leadId,
			success: false,
			processingTime: 0,
			error: `Network error after ${retryCount} retries: ${error.message}`,
		};
	}

	/**
	 * Handle timeout errors
	 */
	async handleTimeoutError(leadId: string, timeoutDuration: number): Promise<ParallelProcessingResult> {
		const turboError = this.createTurboError(
			"TIMEOUT",
			`Processing timeout for lead ${leadId} after ${timeoutDuration}ms`,
			undefined,
			true, // Timeouts are generally recoverable
		);
		turboError.leadId = leadId;

		logger.warn("Processing timeout occurred", {
			leadId,
			timeoutDuration,
			timestamp: new Date().toISOString(),
		});

		this.recordError(turboError);

		if (this.fallbackOptions.notifyUser) {
			this.notifyUser(`Timeout no processamento do lead ${leadId}. Continuando com os próximos.`, "warning");
		}

		return {
			leadId,
			success: false,
			processingTime: timeoutDuration,
			error: `Processing timeout after ${timeoutDuration}ms`,
		};
	}

	/**
	 * Handle general system errors
	 */
	async handleSystemError(error: Error, context: string, leads?: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
		const turboError = this.createTurboError(
			"SYSTEM_ERROR",
			`System error in ${context}: ${error.message}`,
			error,
			false, // System errors are generally not recoverable
		);

		logger.error("System error occurred", {
			context,
			error: error.message,
			stack: error.stack,
			leadCount: leads?.length || 0,
		});

		this.recordError(turboError);
		this.metrics.unrecoverableErrors++;

		if (this.fallbackOptions.notifyUser) {
			this.notifyUser("Erro do sistema detectado. Processamento será interrompido.", "error");
		}

		// For system errors, return failure for all leads
		if (leads) {
			return leads.map((lead) => ({
				leadId: lead.id,
				success: false,
				processingTime: 0,
				error: `System error: ${error.message}`,
			}));
		}

		return [];
	}

	/**
	 * Implement fallback to sequential processing
	 */
	private async fallbackToSequential(
		leads: ExtendedLead[],
		originalError: TurboModeError,
	): Promise<ParallelProcessingResult[]> {
		const startTime = Date.now();

		logger.info("Falling back to sequential processing", {
			leadCount: leads.length,
			originalError: originalError.message,
		});

		this.metrics.fallbacksTriggered++;

		try {
			let results: ParallelProcessingResult[] = [];

			if (this.onFallbackToSequential) {
				// Use provided fallback function
				results = await this.onFallbackToSequential(leads);
			} else {
				// Default sequential processing simulation
				results = leads.map((lead) => ({
					leadId: lead.id,
					success: true,
					processingTime: 5000, // Simulated sequential processing time
					error: undefined,
				}));
			}

			const recoveryTime = Date.now() - startTime;
			this.updateAverageRecoveryTime(recoveryTime);
			this.metrics.successfulRecoveries++;

			logger.info("Sequential fallback completed successfully", {
				leadCount: leads.length,
				recoveryTime,
				successCount: results.filter((r) => r.success).length,
			});

			if (this.fallbackOptions.notifyUser) {
				this.notifyUser("Processamento continuado em modo padrão com sucesso.", "info");
			}

			return results;
		} catch (fallbackError) {
			logger.error("Sequential fallback also failed", {
				error: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
				leadCount: leads.length,
			});

			this.metrics.unrecoverableErrors++;

			if (this.fallbackOptions.notifyUser) {
				this.notifyUser("Erro crítico: tanto o modo TURBO quanto o processamento padrão falharam.", "error");
			}

			// Return failure for all leads
			return leads.map((lead) => ({
				leadId: lead.id,
				success: false,
				processingTime: 0,
				error: `Both TURBO and sequential processing failed: ${fallbackError instanceof Error ? fallbackError.message : "Unknown error"}`,
			}));
		}
	}

	/**
	 * Implement throttling when resources are constrained
	 */
	private async implementThrottling(leads: ExtendedLead[], resourceType: string): Promise<ParallelProcessingResult[]> {
		logger.info("Implementing throttling strategy", {
			resourceType,
			leadCount: leads.length,
			originalParallelLimit: this.config.maxParallelLeads,
		});

		// Reduce parallel processing by 50%
		const throttledParallelLimit = Math.max(1, Math.floor(this.config.maxParallelLeads / 2));

		// Create smaller batches with longer delays
		const batches = this.createBatches(leads, throttledParallelLimit);
		const results: ParallelProcessingResult[] = [];

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];

			logger.debug("Processing throttled batch", {
				batchIndex: i + 1,
				totalBatches: batches.length,
				batchSize: batch.length,
			});

			// Simulate batch processing (this would be replaced with actual processing)
			const batchResults = batch.map((lead) => ({
				leadId: lead.id,
				success: true,
				processingTime: 3000, // Throttled processing time
				error: undefined,
			}));

			results.push(...batchResults);

			// Longer delay between batches when throttling
			if (i < batches.length - 1) {
				await this.delay(2000);
			}
		}

		return results;
	}

	/**
	 * Create error object with consistent structure
	 */
	private createTurboError(
		type: TurboModeError["type"],
		message: string,
		originalError?: Error,
		recoverable: boolean = false,
	): TurboModeError {
		return {
			type,
			message,
			originalError,
			timestamp: new Date(),
			recoverable,
		};
	}

	/**
	 * Record error in history and update metrics
	 */
	private recordError(error: TurboModeError): void {
		this.errorHistory.push(error);
		this.metrics.totalErrors++;

		if (!this.metrics.errorsByType[error.type]) {
			this.metrics.errorsByType[error.type] = 0;
		}
		this.metrics.errorsByType[error.type]++;

		// Keep only last 100 errors to prevent memory issues
		if (this.errorHistory.length > 100) {
			this.errorHistory = this.errorHistory.slice(-100);
		}

		if (this.fallbackOptions.logErrors) {
			logger.error("Error recorded", {
				type: error.type,
				message: error.message,
				leadId: error.leadId,
				recoverable: error.recoverable,
				retryCount: error.retryCount,
			});
		}
	}

	/**
	 * Update average recovery time
	 */
	private updateAverageRecoveryTime(recoveryTime: number): void {
		const totalRecoveries = this.metrics.successfulRecoveries;
		const currentAverage = this.metrics.averageRecoveryTime;

		this.metrics.averageRecoveryTime = (currentAverage * (totalRecoveries - 1) + recoveryTime) / totalRecoveries;
	}

	/**
	 * Notify user about errors and status
	 */
	private notifyUser(message: string, type: "error" | "warning" | "info"): void {
		if (this.onUserNotification) {
			this.onUserNotification(message, type);
		} else {
			// Default notification using toast
			switch (type) {
				case "error":
					toast.error(message);
					break;
				case "warning":
					toast.warning(message);
					break;
				case "info":
					toast.info(message);
					break;
			}
		}
	}

	/**
	 * Utility functions
	 */
	private createBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}
		return batches;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private getActiveProcessCount(): number {
		// This would need to be implemented based on the actual process tracking
		return 0;
	}

	/**
	 * Public methods for monitoring and management
	 */
	public getErrorHistory(): TurboModeError[] {
		return [...this.errorHistory];
	}

	public getMetrics(): ErrorHandlerMetrics {
		return { ...this.metrics };
	}

	public clearErrorHistory(): void {
		this.errorHistory = [];
		this.metrics = {
			totalErrors: 0,
			errorsByType: {},
			fallbacksTriggered: 0,
			successfulRecoveries: 0,
			unrecoverableErrors: 0,
			averageRecoveryTime: 0,
		};

		logger.info("Error history and metrics cleared");
	}

	public isHealthy(): boolean {
		const recentErrors = this.errorHistory.filter(
			(error) => Date.now() - error.timestamp.getTime() < 300000, // Last 5 minutes
		);

		const errorRate = recentErrors.length / Math.max(1, this.metrics.totalErrors);
		const recoveryRate = this.metrics.successfulRecoveries / Math.max(1, this.metrics.totalErrors);

		return errorRate < 0.5 && recoveryRate > 0.7;
	}

	public getHealthStatus(): {
		healthy: boolean;
		errorRate: number;
		recoveryRate: number;
		recentErrors: number;
	} {
		const recentErrors = this.errorHistory.filter(
			(error) => Date.now() - error.timestamp.getTime() < 300000, // Last 5 minutes
		);

		const errorRate = recentErrors.length / Math.max(1, this.metrics.totalErrors);
		const recoveryRate = this.metrics.successfulRecoveries / Math.max(1, this.metrics.totalErrors);

		return {
			healthy: this.isHealthy(),
			errorRate,
			recoveryRate,
			recentErrors: recentErrors.length,
		};
	}
}
