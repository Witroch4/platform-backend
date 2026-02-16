/**
 * Log Aggregation and Search Utilities
 * Based on requirements 6.3, 14.1, 14.2
 */

import { LogEntry, LogContext, LogLevel } from "./logger";

export interface LogSearchQuery {
	traceId?: string;
	accountId?: number;
	conversationId?: number;
	messageId?: string;
	stage?: LogContext["stage"];
	channel?: LogContext["channel"];
	level?: LogLevel;
	startTime?: Date;
	endTime?: Date;
	message?: string;
	limit?: number;
	offset?: number;
}

export interface LogSearchResult {
	logs: LogEntry[];
	total: number;
	hasMore: boolean;
}

export interface LogAggregation {
	field: keyof LogContext | "level";
	counts: Record<string, number>;
}

export class LogAggregator {
	private logs: LogEntry[] = [];
	private maxLogs: number;

	constructor(maxLogs: number = 10000) {
		this.maxLogs = maxLogs;
	}

	// Add log entry to in-memory store
	addLog(log: LogEntry): void {
		this.logs.push(log);

		// Keep only the most recent logs
		if (this.logs.length > this.maxLogs) {
			this.logs = this.logs.slice(-this.maxLogs);
		}
	}

	// Search logs based on query
	search(query: LogSearchQuery): LogSearchResult {
		let filteredLogs = this.logs;

		// Apply filters
		if (query.traceId) {
			filteredLogs = filteredLogs.filter((log) => log.context.traceId === query.traceId);
		}

		if (query.accountId) {
			filteredLogs = filteredLogs.filter((log) => log.context.accountId === query.accountId);
		}

		if (query.conversationId) {
			filteredLogs = filteredLogs.filter((log) => log.context.conversationId === query.conversationId);
		}

		if (query.messageId) {
			filteredLogs = filteredLogs.filter((log) => log.context.messageId === query.messageId);
		}

		if (query.stage) {
			filteredLogs = filteredLogs.filter((log) => log.context.stage === query.stage);
		}

		if (query.channel) {
			filteredLogs = filteredLogs.filter((log) => log.context.channel === query.channel);
		}

		if (query.level) {
			filteredLogs = filteredLogs.filter((log) => log.level === query.level);
		}

		if (query.startTime) {
			filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) >= query.startTime!);
		}

		if (query.endTime) {
			filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) <= query.endTime!);
		}

		if (query.message) {
			const searchTerm = query.message.toLowerCase();
			filteredLogs = filteredLogs.filter((log) => log.message.toLowerCase().includes(searchTerm));
		}

		// Sort by timestamp (newest first)
		filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

		const total = filteredLogs.length;
		const offset = query.offset || 0;
		const limit = query.limit || 100;

		const paginatedLogs = filteredLogs.slice(offset, offset + limit);
		const hasMore = offset + limit < total;

		return {
			logs: paginatedLogs,
			total,
			hasMore,
		};
	}

	// Get aggregated counts by field
	aggregate(field: keyof LogContext | "level", query?: Partial<LogSearchQuery>): LogAggregation {
		let logs = this.logs;

		// Apply basic filters if provided
		if (query) {
			const searchResult = this.search(query as LogSearchQuery);
			logs = searchResult.logs;
		}

		const counts: Record<string, number> = {};

		logs.forEach((log) => {
			let value: string;

			if (field === "level") {
				value = log.level;
			} else {
				value = String(log.context[field] || "unknown");
			}

			counts[value] = (counts[value] || 0) + 1;
		});

		return { field, counts };
	}

	// Get error rate by time window
	getErrorRate(windowMinutes: number = 5): number {
		const now = new Date();
		const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

		const recentLogs = this.logs.filter((log) => new Date(log.timestamp) >= windowStart);

		if (recentLogs.length === 0) return 0;

		const errorLogs = recentLogs.filter((log) => log.level === "error");
		return errorLogs.length / recentLogs.length;
	}

	// Get average processing time by stage
	getAverageProcessingTime(stage: LogContext["stage"], windowMinutes: number = 60): number {
		const now = new Date();
		const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

		const stageLogs = this.logs.filter(
			(log) =>
				log.context.stage === stage && log.context.duration !== undefined && new Date(log.timestamp) >= windowStart,
		);

		if (stageLogs.length === 0) return 0;

		const totalDuration = stageLogs.reduce((sum, log) => sum + (log.context.duration || 0), 0);
		return totalDuration / stageLogs.length;
	}

	// Get logs by trace ID (for distributed tracing)
	getTraceLog(traceId: string): LogEntry[] {
		return this.logs
			.filter((log) => log.context.traceId === traceId)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
	}

	// Clear old logs
	clearOldLogs(olderThanHours: number = 24): number {
		const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
		const initialCount = this.logs.length;

		this.logs = this.logs.filter((log) => new Date(log.timestamp) >= cutoff);

		return initialCount - this.logs.length;
	}

	// Export logs for external systems
	exportLogs(query?: LogSearchQuery): string {
		const result = query ? this.search(query) : { logs: this.logs };
		return result.logs.map((log) => JSON.stringify(log)).join("\n");
	}

	// Get current stats
	getStats(): {
		totalLogs: number;
		errorRate: number;
		logsByLevel: Record<LogLevel, number>;
		logsByStage: Record<string, number>;
	} {
		const logsByLevel: Record<LogLevel, number> = {
			debug: 0,
			info: 0,
			warn: 0,
			error: 0,
		};

		const logsByStage: Record<string, number> = {};

		this.logs.forEach((log) => {
			logsByLevel[log.level]++;
			const stage = log.context.stage || "unknown";
			logsByStage[stage] = (logsByStage[stage] || 0) + 1;
		});

		return {
			totalLogs: this.logs.length,
			errorRate: this.getErrorRate(5),
			logsByLevel,
			logsByStage,
		};
	}
}

// Global log aggregator instance
export const logAggregator = new LogAggregator(parseInt(process.env.MAX_LOGS_IN_MEMORY || "10000"));

// Hook into the logger to automatically aggregate logs
export function enableLogAggregation(): void {
	const originalConsoleLog = console.log;
	const originalConsoleError = console.error;
	const originalConsoleWarn = console.warn;
	const originalConsoleDebug = console.debug;

	const interceptLog = (originalMethod: typeof console.log) => {
		return (...args: any[]) => {
			// Try to parse structured log
			if (args.length === 1 && typeof args[0] === "string") {
				try {
					const logEntry = JSON.parse(args[0]) as LogEntry;
					if (logEntry.context && logEntry.service === "chatwit-ai-integration") {
						logAggregator.addLog(logEntry);
					}
				} catch {
					// Not a structured log, ignore
				}
			}

			originalMethod.apply(console, args);
		};
	};

	console.log = interceptLog(originalConsoleLog);
	console.error = interceptLog(originalConsoleError);
	console.warn = interceptLog(originalConsoleWarn);
	console.debug = interceptLog(originalConsoleDebug);
}

export default LogAggregator;
