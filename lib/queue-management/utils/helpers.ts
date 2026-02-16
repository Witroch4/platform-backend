/**
 * Queue Management Helpers
 */

import { JobState, QueueState } from "../constants";

/**
 * Validate job state
 */
export function isValidJobState(state: string): state is JobState {
	return ["waiting", "active", "completed", "failed", "delayed", "paused"].includes(state);
}

/**
 * Validate queue status
 */
export function isValidQueueStatus(status: string): status is QueueState {
	return ["healthy", "warning", "critical"].includes(status);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
	return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
	return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") return obj;
	if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
	if (obj instanceof Array) return obj.map((item) => deepClone(item)) as unknown as T;
	if (typeof obj === "object") {
		const clonedObj = {} as T;
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				clonedObj[key] = deepClone(obj[key]);
			}
		}
		return clonedObj;
	}
	return obj;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxAttempts: number = 3,
	baseDelay: number = 1000,
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			if (attempt === maxAttempts) {
				throw lastError;
			}

			const delay = baseDelay * Math.pow(2, attempt - 1);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout;

	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	};
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
	let inThrottle: boolean;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}
