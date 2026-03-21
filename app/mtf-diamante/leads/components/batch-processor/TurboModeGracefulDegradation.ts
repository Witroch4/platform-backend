/**
 * TURBO Mode Graceful Degradation System
 * Implements graceful degradation when TURBO mode is unavailable
 * Based on requirement 3.6
 */

import { createLogger } from "@/lib/utils/logger";
import type { ExtendedLead } from "../../types";
import type { TurboModeConfig } from "./useTurboMode";
import type { ParallelProcessingResult } from "./TurboModePDFProcessor";
import type { SystemResources, ThrottlingStrategy } from "./TurboModeResourceMonitor";

const logger = createLogger("TurboModeGracefulDegradation");

export interface DegradationLevel {
	level: "optimal" | "reduced" | "minimal" | "emergency" | "disabled";
	description: string;
	maxParallelProcesses: number;
	batchSize: number;
	delayBetweenBatches: number;
	enabledFeatures: {
		parallelPDF: boolean;
		parallelImages: boolean;
		resourceMonitoring: boolean;
		progressTracking: boolean;
		errorRecovery: boolean;
	};
}

export interface DegradationTrigger {
	type: "resource_exhaustion" | "error_rate" | "system_instability" | "manual" | "feature_flag";
	severity: "low" | "medium" | "high" | "critical";
	message: string;
	timestamp: Date;
	autoRecover: boolean;
	recoveryConditions?: string[];
}

export interface DegradationOptions {
	enableAutoRecovery?: boolean;
	recoveryCheckInterval?: number;
	errorThreshold?: number;
	resourceThreshold?: number;
	onDegradationChange?: (level: DegradationLevel, trigger: DegradationTrigger) => void;
	onRecoveryAttempt?: (success: boolean, level: DegradationLevel) => void;
}

export class TurboModeGracefulDegradation {
	private currentLevel: DegradationLevel;
	private degradationHistory: Array<{ level: DegradationLevel; trigger: DegradationTrigger }> = [];
	private enableAutoRecovery: boolean;
	private recoveryCheckInterval: number;
	private errorThreshold: number;
	private resourceThreshold: number;
	private onDegradationChange?: (level: DegradationLevel, trigger: DegradationTrigger) => void;
	private onRecoveryAttempt?: (success: boolean, level: DegradationLevel) => void;

	private recoveryTimer: NodeJS.Timeout | null = null;
	private errorCount: number = 0;
	private lastErrorTime: Date | null = null;
	private systemStable: boolean = true;

	// Predefined degradation levels
	private readonly degradationLevels: Record<DegradationLevel["level"], DegradationLevel> = {
		optimal: {
			level: "optimal",
			description: "TURBO mode funcionando com capacidade máxima",
			maxParallelProcesses: 10,
			batchSize: 10,
			delayBetweenBatches: 500,
			enabledFeatures: {
				parallelPDF: true,
				parallelImages: true,
				resourceMonitoring: true,
				progressTracking: true,
				errorRecovery: true,
			},
		},
		reduced: {
			level: "reduced",
			description: "TURBO mode com capacidade reduzida devido a limitações de recursos",
			maxParallelProcesses: 5,
			batchSize: 5,
			delayBetweenBatches: 1000,
			enabledFeatures: {
				parallelPDF: true,
				parallelImages: true,
				resourceMonitoring: true,
				progressTracking: true,
				errorRecovery: true,
			},
		},
		minimal: {
			level: "minimal",
			description: "TURBO mode funcionando com capacidade mínima",
			maxParallelProcesses: 2,
			batchSize: 2,
			delayBetweenBatches: 2000,
			enabledFeatures: {
				parallelPDF: true,
				parallelImages: false,
				resourceMonitoring: true,
				progressTracking: true,
				errorRecovery: true,
			},
		},
		emergency: {
			level: "emergency",
			description: "Modo de emergência - processamento sequencial apenas",
			maxParallelProcesses: 1,
			batchSize: 1,
			delayBetweenBatches: 5000,
			enabledFeatures: {
				parallelPDF: false,
				parallelImages: false,
				resourceMonitoring: true,
				progressTracking: false,
				errorRecovery: true,
			},
		},
		disabled: {
			level: "disabled",
			description: "TURBO mode desabilitado - processamento padrão apenas",
			maxParallelProcesses: 1,
			batchSize: 1,
			delayBetweenBatches: 1000,
			enabledFeatures: {
				parallelPDF: false,
				parallelImages: false,
				resourceMonitoring: false,
				progressTracking: false,
				errorRecovery: false,
			},
		},
	};

	constructor(options: DegradationOptions = {}) {
		this.enableAutoRecovery = options.enableAutoRecovery ?? true;
		this.recoveryCheckInterval = options.recoveryCheckInterval || 30000; // 30 seconds
		this.errorThreshold = options.errorThreshold || 5;
		this.resourceThreshold = options.resourceThreshold || 85;
		this.onDegradationChange = options.onDegradationChange;
		this.onRecoveryAttempt = options.onRecoveryAttempt;

		// Start with optimal level
		this.currentLevel = this.degradationLevels.optimal;

		logger.info("Graceful degradation system initialized", {
			enableAutoRecovery: this.enableAutoRecovery,
			recoveryCheckInterval: this.recoveryCheckInterval,
			errorThreshold: this.errorThreshold,
			resourceThreshold: this.resourceThreshold,
		});

		// Start recovery monitoring if enabled
		if (this.enableAutoRecovery) {
			this.startRecoveryMonitoring();
		}
	}

	/**
	 * Trigger degradation based on system conditions
	 */
	public triggerDegradation(trigger: DegradationTrigger): DegradationLevel {
		const newLevel = this.calculateDegradationLevel(trigger);

		if (newLevel.level !== this.currentLevel.level) {
			const previousLevel = this.currentLevel;
			this.currentLevel = newLevel;

			// Record in history
			this.degradationHistory.push({ level: newLevel, trigger });

			// Keep only last 50 entries
			if (this.degradationHistory.length > 50) {
				this.degradationHistory = this.degradationHistory.slice(-50);
			}

			logger.warn("TURBO mode degradation triggered", {
				previousLevel: previousLevel.level,
				newLevel: newLevel.level,
				trigger: trigger.type,
				severity: trigger.severity,
				message: trigger.message,
			});

			// Notify about degradation change
			if (this.onDegradationChange) {
				this.onDegradationChange(newLevel, trigger);
			}

			// Start recovery monitoring if not already running
			if (this.enableAutoRecovery && !this.recoveryTimer) {
				this.startRecoveryMonitoring();
			}
		}

		return this.currentLevel;
	}

	/**
	 * Calculate appropriate degradation level based on trigger
	 */
	private calculateDegradationLevel(trigger: DegradationTrigger): DegradationLevel {
		switch (trigger.type) {
			case "resource_exhaustion":
				switch (trigger.severity) {
					case "low":
						return this.degradationLevels.reduced;
					case "medium":
						return this.degradationLevels.minimal;
					case "high":
					case "critical":
						return this.degradationLevels.emergency;
				}
				break;

			case "error_rate":
				switch (trigger.severity) {
					case "low":
						return this.degradationLevels.reduced;
					case "medium":
						return this.degradationLevels.minimal;
					case "high":
						return this.degradationLevels.emergency;
					case "critical":
						return this.degradationLevels.disabled;
				}
				break;

			case "system_instability":
				switch (trigger.severity) {
					case "low":
					case "medium":
						return this.degradationLevels.minimal;
					case "high":
						return this.degradationLevels.emergency;
					case "critical":
						return this.degradationLevels.disabled;
				}
				break;

			case "manual":
				// Manual triggers can specify any level
				return this.currentLevel;

			case "feature_flag":
				return this.degradationLevels.disabled;
		}

		return this.degradationLevels.reduced;
	}

	/**
	 * Handle resource exhaustion
	 */
	public handleResourceExhaustion(resources: SystemResources): DegradationLevel {
		let severity: DegradationTrigger["severity"] = "low";
		const issues: string[] = [];

		// Check memory
		if (resources.memory.percentage >= 95) {
			severity = "critical";
			issues.push(`Memória crítica: ${Math.round(resources.memory.percentage)}%`);
		} else if (resources.memory.percentage >= this.resourceThreshold) {
			severity = "high";
			issues.push(`Memória alta: ${Math.round(resources.memory.percentage)}%`);
		}

		// Check CPU
		if (resources.cpu.usage >= 95) {
			severity = "critical";
			issues.push(`CPU crítica: ${Math.round(resources.cpu.usage)}%`);
		} else if (resources.cpu.usage >= this.resourceThreshold) {
			severity = severity === "critical" ? "critical" : "high";
			issues.push(`CPU alta: ${Math.round(resources.cpu.usage)}%`);
		}

		// Check active processes
		if (resources.activeProcesses.percentage >= 95) {
			severity = "critical";
			issues.push(`Processos críticos: ${resources.activeProcesses.count}/${resources.activeProcesses.maxAllowed}`);
		}

		const trigger: DegradationTrigger = {
			type: "resource_exhaustion",
			severity,
			message: `Recursos do sistema esgotados: ${issues.join(", ")}`,
			timestamp: new Date(),
			autoRecover: true,
			recoveryConditions: ["Uso de memória < 70%", "Uso de CPU < 70%", "Processos ativos < 70%"],
		};

		return this.triggerDegradation(trigger);
	}

	/**
	 * Handle high error rate
	 */
	public handleHighErrorRate(errorCount: number, timeWindow: number): DegradationLevel {
		this.errorCount = errorCount;
		this.lastErrorTime = new Date();

		const errorRate = errorCount / (timeWindow / 1000); // errors per second
		let severity: DegradationTrigger["severity"] = "low";

		if (errorRate >= 2) {
			severity = "critical";
		} else if (errorRate >= 1) {
			severity = "high";
		} else if (errorRate >= 0.5) {
			severity = "medium";
		}

		const trigger: DegradationTrigger = {
			type: "error_rate",
			severity,
			message: `Taxa de erro alta: ${errorCount} erros em ${Math.round(timeWindow / 1000)}s (${errorRate.toFixed(2)}/s)`,
			timestamp: new Date(),
			autoRecover: true,
			recoveryConditions: ["Taxa de erro < 0.1/s por 5 minutos", "Sistema estável por 10 minutos"],
		};

		return this.triggerDegradation(trigger);
	}

	/**
	 * Handle system instability
	 */
	public handleSystemInstability(
		reason: string,
		severity: DegradationTrigger["severity"] = "medium",
	): DegradationLevel {
		this.systemStable = false;

		const trigger: DegradationTrigger = {
			type: "system_instability",
			severity,
			message: `Instabilidade do sistema detectada: ${reason}`,
			timestamp: new Date(),
			autoRecover: true,
			recoveryConditions: ["Sistema estável por 15 minutos", "Sem erros críticos por 10 minutos"],
		};

		return this.triggerDegradation(trigger);
	}

	/**
	 * Manually set degradation level
	 */
	public setDegradationLevel(level: DegradationLevel["level"], reason: string = "Manual override"): DegradationLevel {
		const trigger: DegradationTrigger = {
			type: "manual",
			severity: "medium",
			message: reason,
			timestamp: new Date(),
			autoRecover: false,
		};

		this.currentLevel = this.degradationLevels[level];
		this.degradationHistory.push({ level: this.currentLevel, trigger });

		logger.info("Manual degradation level set", {
			level,
			reason,
		});

		if (this.onDegradationChange) {
			this.onDegradationChange(this.currentLevel, trigger);
		}

		return this.currentLevel;
	}

	/**
	 * Disable TURBO mode completely
	 */
	public disableTurboMode(reason: string = "Feature flag disabled"): DegradationLevel {
		const trigger: DegradationTrigger = {
			type: "feature_flag",
			severity: "high",
			message: reason,
			timestamp: new Date(),
			autoRecover: false,
		};

		return this.triggerDegradation(trigger);
	}

	/**
	 * Start recovery monitoring
	 */
	private startRecoveryMonitoring(): void {
		if (this.recoveryTimer) {
			return;
		}

		logger.info("Starting recovery monitoring", {
			interval: this.recoveryCheckInterval,
		});

		this.recoveryTimer = setInterval(() => {
			this.checkRecoveryConditions();
		}, this.recoveryCheckInterval);
	}

	/**
	 * Stop recovery monitoring
	 */
	private stopRecoveryMonitoring(): void {
		if (this.recoveryTimer) {
			clearInterval(this.recoveryTimer);
			this.recoveryTimer = null;
			logger.info("Recovery monitoring stopped");
		}
	}

	/**
	 * Check if system can recover to a higher level
	 */
	private async checkRecoveryConditions(): Promise<void> {
		if (this.currentLevel.level === "optimal") {
			this.stopRecoveryMonitoring();
			return;
		}

		try {
			const canRecover = await this.evaluateRecoveryConditions();

			if (canRecover) {
				const nextLevel = this.getNextRecoveryLevel();

				if (nextLevel && nextLevel.level !== this.currentLevel.level) {
					logger.info("Attempting recovery to higher level", {
						currentLevel: this.currentLevel.level,
						targetLevel: nextLevel.level,
					});

					this.currentLevel = nextLevel;

					const recoveryTrigger: DegradationTrigger = {
						type: "manual",
						severity: "low",
						message: "Automatic recovery - system conditions improved",
						timestamp: new Date(),
						autoRecover: true,
					};

					this.degradationHistory.push({ level: nextLevel, trigger: recoveryTrigger });

					if (this.onRecoveryAttempt) {
						this.onRecoveryAttempt(true, nextLevel);
					}

					if (this.onDegradationChange) {
						this.onDegradationChange(nextLevel, recoveryTrigger);
					}

					logger.info("Recovery successful", {
						newLevel: nextLevel.level,
					});
				}
			}
		} catch (error) {
			logger.error("Error during recovery check", { error });

			if (this.onRecoveryAttempt) {
				this.onRecoveryAttempt(false, this.currentLevel);
			}
		}
	}

	/**
	 * Evaluate if recovery conditions are met
	 */
	private async evaluateRecoveryConditions(): Promise<boolean> {
		// Check error rate
		const now = Date.now();
		const fiveMinutesAgo = now - 5 * 60 * 1000;

		if (this.lastErrorTime && this.lastErrorTime.getTime() > fiveMinutesAgo) {
			// Recent errors, not ready for recovery
			return false;
		}

		// Check system stability
		if (!this.systemStable) {
			// System marked as unstable
			return false;
		}

		// Additional checks could be added here:
		// - Resource usage checks
		// - Network connectivity checks
		// - Database health checks
		// - etc.

		return true;
	}

	/**
	 * Get the next level for recovery
	 */
	private getNextRecoveryLevel(): DegradationLevel | null {
		const levelOrder: DegradationLevel["level"][] = ["disabled", "emergency", "minimal", "reduced", "optimal"];
		const currentIndex = levelOrder.indexOf(this.currentLevel.level);

		if (currentIndex < levelOrder.length - 1) {
			const nextLevelName = levelOrder[currentIndex + 1];
			return this.degradationLevels[nextLevelName];
		}

		return null;
	}

	/**
	 * Process leads with current degradation level
	 */
	public async processLeadsWithDegradation(
		leads: ExtendedLead[],
		processingFunction: (leads: ExtendedLead[], config: TurboModeConfig) => Promise<ParallelProcessingResult[]>,
		accountId: number = 1,
	): Promise<ParallelProcessingResult[]> {
		const config: TurboModeConfig = {
			maxParallelLeads: this.currentLevel.maxParallelProcesses,
			fallbackOnError: this.currentLevel.enabledFeatures.errorRecovery,
			resourceThreshold: this.resourceThreshold,
		};

		logger.info("Processing leads with degradation level", {
			level: this.currentLevel.level,
			leadCount: leads.length,
			config,
		});

		try {
			// Split leads into batches based on current level
			const batches = this.createBatches(leads, this.currentLevel.batchSize);
			const allResults: ParallelProcessingResult[] = [];

			for (let i = 0; i < batches.length; i++) {
				const batch = batches[i];

				logger.debug("Processing degraded batch", {
					batchIndex: i + 1,
					totalBatches: batches.length,
					batchSize: batch.length,
					level: this.currentLevel.level,
				});

				const batchResults = await processingFunction(batch, config);
				allResults.push(...batchResults);

				// Apply delay between batches
				if (i < batches.length - 1) {
					await this.delay(this.currentLevel.delayBetweenBatches);
				}
			}

			return allResults;
		} catch (error) {
			logger.error("Error processing leads with degradation", {
				level: this.currentLevel.level,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			// Trigger further degradation on error
			this.handleSystemInstability(
				`Processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
				"high",
			);

			throw error;
		}
	}

	/**
	 * Create batches based on current degradation level
	 */
	private createBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}
		return batches;
	}

	/**
	 * Utility delay function
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Public getters
	 */
	public getCurrentLevel(): DegradationLevel {
		return { ...this.currentLevel };
	}

	public getDegradationHistory(): Array<{ level: DegradationLevel; trigger: DegradationTrigger }> {
		return [...this.degradationHistory];
	}

	public isTurboModeAvailable(): boolean {
		return (
			this.currentLevel.level !== "disabled" &&
			(this.currentLevel.enabledFeatures.parallelPDF || this.currentLevel.enabledFeatures.parallelImages)
		);
	}

	public getAvailableFeatures(): DegradationLevel["enabledFeatures"] {
		return { ...this.currentLevel.enabledFeatures };
	}

	public getRecommendedConfig(accountId: number = 1): TurboModeConfig {
		return {
			maxParallelLeads: this.currentLevel.maxParallelProcesses,
			fallbackOnError: this.currentLevel.enabledFeatures.errorRecovery,
			resourceThreshold: this.resourceThreshold,
		};
	}

	/**
	 * Mark system as stable (for recovery)
	 */
	public markSystemStable(): void {
		this.systemStable = true;
		logger.info("System marked as stable");
	}

	/**
	 * Reset error count (for recovery)
	 */
	public resetErrorCount(): void {
		this.errorCount = 0;
		this.lastErrorTime = null;
		logger.info("Error count reset");
	}

	/**
	 * Cleanup
	 */
	public destroy(): void {
		this.stopRecoveryMonitoring();
		logger.info("Graceful degradation system destroyed");
	}
}
