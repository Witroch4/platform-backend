// lib/logger/index.ts
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogConfig {
	level: LogLevel;
	component?: string;
	enableDebugComponents?: string[];
	enablePerformanceLogs?: boolean;
	enableQueueHealthLogs?: boolean;
	enableResourceUsageLogs?: boolean;
	enableOpenAIRequestLogs?: boolean;
}

class Logger {
	private config: LogConfig;

	constructor(config?: Partial<LogConfig>) {
		this.config = {
			level: this.getLogLevel(),
			enableDebugComponents: this.getDebugComponents(),
			enablePerformanceLogs: process.env.ENABLE_PERFORMANCE_LOGS === "true",
			enableQueueHealthLogs: process.env.ENABLE_QUEUE_HEALTH_LOGS === "true",
			enableResourceUsageLogs: process.env.ENABLE_RESOURCE_USAGE_LOGS === "true",
			enableOpenAIRequestLogs: process.env.ENABLE_OPENAI_REQUEST_LOGS === "true",
			...config,
		};
	}

	private getLogLevel(): LogLevel {
		const level = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
		if (["DEBUG", "INFO", "WARN", "ERROR"].includes(level)) {
			return level;
		}
		// Default based on environment
		return process.env.NODE_ENV === "production" ? "INFO" : "DEBUG";
	}

	private getDebugComponents(): string[] {
		const components = process.env.DEBUG_COMPONENTS;
		return components ? components.split(",").map((c) => c.trim()) : [];
	}

	private shouldLog(level: LogLevel, component?: string): boolean {
		const levels: Record<LogLevel, number> = {
			DEBUG: 0,
			INFO: 1,
			WARN: 2,
			ERROR: 3,
		};

		// Check log level
		if (levels[level] < levels[this.config.level]) {
			return false;
		}

		// Check component-specific debug
		if (level === "DEBUG" && component) {
			return this.config.enableDebugComponents?.includes(component) ?? false;
		}

		return true;
	}

	debug(message: string, data?: any, component?: string): void {
		if (this.shouldLog("DEBUG", component)) {
			console.log(`[DEBUG${component ? ` ${component}` : ""}] ${message}`, data || "");
		}
	}

	info(message: string, data?: any, component?: string): void {
		if (this.shouldLog("INFO", component)) {
			console.log(`[INFO${component ? ` ${component}` : ""}] ${message}`, data || "");
		}
	}

	warn(message: string, data?: any, component?: string): void {
		if (this.shouldLog("WARN", component)) {
			console.warn(`[WARN${component ? ` ${component}` : ""}] ${message}`, data || "");
		}
	}

	error(message: string, data?: any, component?: string): void {
		if (this.shouldLog("ERROR", component)) {
			console.error(`[ERROR${component ? ` ${component}` : ""}] ${message}`, data || "");
		}
	}

	// Specialized logging methods
	queueHealth(queueName: string, metrics: any): void {
		if (this.config.enableQueueHealthLogs && this.shouldLog("DEBUG", "QueueMonitor")) {
			this.debug(`Health metrics collected for queue ${queueName}`, metrics, "QueueMonitor");
		}
	}

	resourceUsage(component: string, usage: any): void {
		if (this.config.enableResourceUsageLogs && this.shouldLog("DEBUG", component)) {
			this.debug("Resource usage report", usage, component);
		}
	}

	openaiRequest(requestData: any): void {
		if (this.config.enableOpenAIRequestLogs && this.shouldLog("DEBUG", "OpenAI")) {
			// Only log summarized version to reduce noise
			const summary = {
				model: requestData.model,
				messages_count: requestData.messages_count,
				has_reasoning: requestData.has_reasoning,
				has_temperature: requestData.has_temperature,
				has_top_p: requestData.has_top_p,
			};
			this.debug("OPENAI REQUEST SUMMARY", summary, "OpenAI");
		}
	}

	openaiRequestDetailed(requestData: any, component?: string): void {
		if (this.config.enableOpenAIRequestLogs && this.shouldLog("INFO", component || "OpenAI")) {
			this.info("OPENAI REQUEST DETAILED", requestData, component || "OpenAI");
		}
	}

	// Update configuration at runtime
	updateConfig(config: Partial<LogConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

// Global logger instance
export const logger = new Logger();

// Convenience functions for backward compatibility
export function logDebug(message: string, data?: any, component?: string): void {
	logger.debug(message, data, component);
}

export function logInfo(message: string, data?: any, component?: string): void {
	logger.info(message, data, component);
}

export function logWarn(message: string, data?: any, component?: string): void {
	logger.warn(message, data, component);
}

export function logError(message: string, data?: any, component?: string): void {
	logger.error(message, data, component);
}
