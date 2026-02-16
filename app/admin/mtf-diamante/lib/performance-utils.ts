// app/admin/mtf-diamante/lib/performance-utils.ts
// Performance optimization utilities for MTF Diamante hooks

import { useMemo, useCallback, useRef } from "react";
import type { SWRConfiguration } from "swr";
import { devLog } from "./cleanup-utils";

/**
 * Performance metrics tracking
 */
interface PerformanceMetrics {
	operationType: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	success: boolean;
	error?: string;
}

class PerformanceTracker {
	private metrics: PerformanceMetrics[] = [];
	private maxMetrics = 100; // Keep only last 100 metrics

	startOperation(operationType: string): string {
		const operationId = `${operationType}-${Date.now()}-${Math.random()}`;
		const metric: PerformanceMetrics = {
			operationType,
			startTime: performance.now(),
			success: false,
		};

		this.metrics.push(metric);

		// Keep only recent metrics
		if (this.metrics.length > this.maxMetrics) {
			this.metrics = this.metrics.slice(-this.maxMetrics);
		}

		return operationId;
	}

	endOperation(operationId: string, success: boolean, error?: string) {
		const metric = this.metrics.find(
			(m) => `${m.operationType}-${m.startTime}` === operationId.split("-").slice(0, -1).join("-"),
		);

		if (metric) {
			metric.endTime = performance.now();
			metric.duration = metric.endTime - metric.startTime;
			metric.success = success;
			metric.error = error;
		}
	}

	getMetrics(operationType?: string): PerformanceMetrics[] {
		return operationType ? this.metrics.filter((m) => m.operationType === operationType) : this.metrics;
	}

	getAverageTime(operationType: string): number {
		const typeMetrics = this.getMetrics(operationType).filter((m) => m.duration);
		if (typeMetrics.length === 0) return 0;

		const totalTime = typeMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
		return totalTime / typeMetrics.length;
	}

	getSuccessRate(operationType: string): number {
		const typeMetrics = this.getMetrics(operationType);
		if (typeMetrics.length === 0) return 0;

		const successCount = typeMetrics.filter((m) => m.success).length;
		return (successCount / typeMetrics.length) * 100;
	}

	logSummary() {
		if (process.env.NODE_ENV !== "development") return;

		const operations = [...new Set(this.metrics.map((m) => m.operationType))];

		devLog.group("📊 [MTF Performance Summary]");
		operations.forEach((op) => {
			const avgTime = this.getAverageTime(op);
			const successRate = this.getSuccessRate(op);
			devLog.log(`${op}: ${avgTime.toFixed(2)}ms avg, ${successRate.toFixed(1)}% success`);
		});
		devLog.groupEnd();
	}
}

// Global performance tracker instance
export const performanceTracker = new PerformanceTracker();

/**
 * Enhanced SWR configuration with performance optimizations
 */
export function createOptimizedSWRConfig(baseConfig: SWRConfiguration = {}, operationType: string): SWRConfiguration {
	return {
		// Base configuration
		...baseConfig,

		// Optimized deduplication - longer for read operations
		dedupingInterval: baseConfig.dedupingInterval ?? 5000, // 5 seconds

		// Optimized focus revalidation throttling
		focusThrottleInterval: baseConfig.focusThrottleInterval ?? 10000, // 10 seconds

		// Keep previous data for better UX
		keepPreviousData: baseConfig.keepPreviousData ?? true,

		// Optimized error retry with exponential backoff
		errorRetryCount: baseConfig.errorRetryCount ?? 3,
		errorRetryInterval: baseConfig.errorRetryInterval ?? 2000,

		// Enhanced error retry logic
		onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
			// Don't retry on 4xx errors (client errors)
			if (error.status >= 400 && error.status < 500) return;

			// Don't retry after max attempts
			if (retryCount >= 3) return;

			// Exponential backoff: 2s, 4s, 8s
			const delay = Math.min(2000 * Math.pow(2, retryCount), 8000);

			setTimeout(() => revalidate({ retryCount }), delay);
		},

		// Performance tracking
		onSuccess: (data, key, config) => {
			devLog.log(`✅ [${operationType}] Success:`, {
				key,
				dataLength: Array.isArray(data) ? data.length : "N/A",
				timestamp: new Date().toISOString(),
			});
			baseConfig.onSuccess?.(data, key, config);
		},

		onError: (error, key, config) => {
			devLog.error(`❌ [${operationType}] Error:`, { key, error });
			baseConfig.onError?.(error, key, config);
		},

		onLoadingSlow: (key, config) => {
			devLog.warn(`⏳ [${operationType}] Slow loading:`, key);
			baseConfig.onLoadingSlow?.(key, config);
		},
	};
}

/**
 * Hook for optimized SWR configuration with memoization
 */
export function useOptimizedSWRConfig(
	operationType: string,
	isPaused: boolean = false,
	customConfig: SWRConfiguration = {},
): SWRConfiguration {
	return useMemo(() => {
		const baseConfig = {
			revalidateOnFocus: !isPaused && (customConfig.revalidateOnFocus ?? true),
			revalidateOnReconnect: !isPaused && (customConfig.revalidateOnReconnect ?? true),
			refreshInterval: isPaused ? 0 : (customConfig.refreshInterval ?? 30000),
			...customConfig,
		};

		return createOptimizedSWRConfig(baseConfig, operationType);
	}, [operationType, isPaused, customConfig]);
}

/**
 * Optimized mutation function with performance tracking
 */
export function useOptimizedMutation<T>(
	operationType: string,
	mutate: (data?: T | Promise<T> | ((current?: T) => T), opts?: any) => Promise<T | undefined>,
) {
	const operationRef = useRef<string | null>(null);

	return useCallback(
		async (data: T | Promise<T> | ((current?: T) => T), opts: any = {}) => {
			operationRef.current = performanceTracker.startOperation(operationType);

			try {
				const result = await mutate(data, opts);
				performanceTracker.endOperation(operationRef.current, true);
				return result;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				performanceTracker.endOperation(operationRef.current, false, errorMessage);
				throw error;
			}
		},
		[mutate, operationType],
	);
}

/**
 * Debounced function for reducing API calls
 */
export function useDebounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
	const timeoutRef = useRef<NodeJS.Timeout>(undefined);

	return useCallback(
		(...args: Parameters<T>) => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			timeoutRef.current = setTimeout(() => {
				func(...args);
			}, delay);
		},
		[func, delay],
	) as T;
}

/**
 * Optimized cache key generator with memoization
 */
export function useCacheKey(baseKey: string, dependencies: (string | number | boolean | null | undefined)[]): string {
	return useMemo(() => {
		const validDeps = dependencies.filter((dep) => dep !== null && dep !== undefined);
		return validDeps.length > 0 ? `${baseKey}-${validDeps.join("-")}` : baseKey;
	}, [baseKey, ...dependencies]);
}

/**
 * Memory usage monitoring for development
 */
export function logMemoryUsage(context: string) {
	if (process.env.NODE_ENV === "development" && "memory" in performance) {
		const memory = (performance as any).memory;
		devLog.log(`🧠 [${context}] Memory:`, {
			used: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`,
			total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB`,
			limit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`,
		});
	}
}

/**
 * Batch operations utility for reducing API calls
 */
export class BatchProcessor<T> {
	private queue: T[] = [];
	private timeoutId: NodeJS.Timeout | null = null;
	private readonly batchSize: number;
	private readonly delay: number;
	private readonly processor: (items: T[]) => Promise<void>;

	constructor(processor: (items: T[]) => Promise<void>, batchSize: number = 10, delay: number = 100) {
		this.processor = processor;
		this.batchSize = batchSize;
		this.delay = delay;
	}

	add(item: T) {
		this.queue.push(item);

		if (this.queue.length >= this.batchSize) {
			this.flush();
		} else {
			this.scheduleFlush();
		}
	}

	private scheduleFlush() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}

		this.timeoutId = setTimeout(() => {
			this.flush();
		}, this.delay);
	}

	private async flush() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}

		if (this.queue.length === 0) return;

		const items = this.queue.splice(0, this.batchSize);

		try {
			await this.processor(items);
		} catch (error) {
			devLog.error("Batch processing error:", error);
		}
	}
}

/**
 * Performance monitoring hook
 */
export function usePerformanceMonitoring(componentName: string) {
	const renderCount = useRef(0);
	const mountTime = useRef(performance.now());

	renderCount.current++;

	// Log performance info in development
	devLog.log(`🔄 [${componentName}] Render #${renderCount.current}`);

	// Log memory usage every 10 renders
	if (renderCount.current % 10 === 0) {
		logMemoryUsage(componentName);
	}

	return {
		renderCount: renderCount.current,
		uptime: performance.now() - mountTime.current,
		logPerformance: () => performanceTracker.logSummary(),
	};
}

/**
 * Smart polling configuration based on user activity
 */
export function useSmartPolling(baseInterval: number = 30000) {
	const lastActivity = useRef(Date.now());
	const isVisible = useRef(true);

	// Update activity timestamp on user interaction
	const updateActivity = useCallback(() => {
		lastActivity.current = Date.now();
	}, []);

	// Calculate dynamic polling interval
	const getPollingInterval = useCallback(() => {
		const timeSinceActivity = Date.now() - lastActivity.current;
		const isInactive = timeSinceActivity > 5 * 60 * 1000; // 5 minutes

		if (!isVisible.current) return 0; // Stop polling when tab is hidden
		if (isInactive) return baseInterval * 2; // Slower polling when inactive

		return baseInterval;
	}, [baseInterval]);

	return {
		updateActivity,
		getPollingInterval,
		setVisible: (visible: boolean) => {
			isVisible.current = visible;
		},
	};
}
