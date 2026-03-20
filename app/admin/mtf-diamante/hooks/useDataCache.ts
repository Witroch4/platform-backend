"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // Time to live in milliseconds
}

interface CacheOptions {
	ttl?: number; // Default 10 minutes for better persistence
	key: string;
}

// Global cache store to prevent multiple simultaneous requests
const globalCache = new Map<string, any>();
const pendingRequests = new Map<string, Promise<any>>();

export function useDataCache<T>(fetchFn: () => Promise<T>, options: CacheOptions) {
	const { ttl = 10 * 60 * 1000, key } = options; // 10 minutes default for better UX
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const mountedRef = useRef(true);

	// Check if cached data is still valid
	const isCacheValid = useCallback((entry: CacheEntry<T>): boolean => {
		return Date.now() - entry.timestamp < entry.ttl;
	}, []);

	// Get data from cache (localStorage + memory)
	const getCachedData = useCallback((): T | null => {
		// First check memory cache
		const memoryData = globalCache.get(key);
		if (memoryData && isCacheValid(memoryData)) {
			return memoryData.data;
		}

		// Then check localStorage
		try {
			const cached = localStorage.getItem(`mtf-cache-${key}`);
			if (!cached) return null;

			const entry: CacheEntry<T> = JSON.parse(cached);
			if (isCacheValid(entry)) {
				// Update memory cache
				globalCache.set(key, entry);
				return entry.data;
			}
		} catch {
			return null;
		}

		return null;
	}, [key, isCacheValid]);

	// Set data to cache (both localStorage and memory)
	const setCachedData = useCallback(
		(newData: T) => {
			try {
				const entry: CacheEntry<T> = {
					data: newData,
					timestamp: Date.now(),
					ttl,
				};

				// Update both caches
				globalCache.set(key, entry);
				localStorage.setItem(`mtf-cache-${key}`, JSON.stringify(entry));
			} catch (error) {
				console.warn("Failed to cache data:", error);
			}
		},
		[key, ttl],
	);

	// Fetch data with cache and deduplication
	const fetchData = useCallback(
		async (forceRefresh = false) => {
			// Try to get from cache first if not forcing refresh
			if (!forceRefresh) {
				const cachedData = getCachedData();
				if (cachedData) {
					if (mountedRef.current) {
						setData(cachedData);
						setLoading(false);
						setError(null);
					}
					return cachedData;
				}
			}

			// Check if there's already a pending request for this key
			const pendingKey = `${key}-${forceRefresh ? "force" : "normal"}`;
			if (pendingRequests.has(pendingKey)) {
				try {
					const result = await pendingRequests.get(pendingKey);
					if (mountedRef.current) {
						setData(result);
						setLoading(false);
						setError(null);
					}
					return result;
				} catch (err) {
					if (mountedRef.current) {
						const errorMessage = err instanceof Error ? err.message : "Erro ao carregar dados";
						setError(errorMessage);
						setLoading(false);
					}
					throw err;
				}
			}

			if (mountedRef.current) {
				setLoading(true);
				setError(null);
			}

			// Create and store the promise
			const fetchPromise = fetchFn()
				.then((freshData) => {
					setCachedData(freshData);
					pendingRequests.delete(pendingKey);
					return freshData;
				})
				.catch((err) => {
					pendingRequests.delete(pendingKey);
					throw err;
				});

			pendingRequests.set(pendingKey, fetchPromise);

			try {
				const freshData = await fetchPromise;
				if (mountedRef.current) {
					setData(freshData);
				}
				return freshData;
			} catch (err) {
				if (mountedRef.current) {
					const errorMessage = err instanceof Error ? err.message : "Erro ao carregar dados";
					setError(errorMessage);
				}
				throw err;
			} finally {
				if (mountedRef.current) {
					setLoading(false);
				}
			}
		},
		[fetchFn, getCachedData, setCachedData, key],
	);

	// Invalidate cache
	const invalidateCache = useCallback(() => {
		try {
			globalCache.delete(key);
			localStorage.removeItem(`mtf-cache-${key}`);
		} catch (error) {
			console.warn("Failed to invalidate cache:", error);
		}
	}, [key]);

	// Refresh data (force fetch)
	const refresh = useCallback(() => {
		return fetchData(true);
	}, [fetchData]);

	// Initial load
	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	return {
		data,
		loading,
		error,
		refresh,
		invalidateCache,
		fetchData,
	};
}

// Hook específico para variáveis MTF
export function useMtfVariaveis() {
	return useDataCache(
		async () => {
			const response = await fetch("/api/admin/mtf-diamante/variaveis");
			if (!response.ok) throw new Error("Erro ao carregar variáveis");
			const data = await response.json();
			return data.data ?? [];
		},
		{ key: "mtf-variaveis", ttl: 5 * 60 * 1000 }, // 5 minutes
	);
}

// Hook específico para lotes MTF
export function useMtfLotes() {
	return useDataCache(
		async () => {
			const response = await fetch("/api/admin/mtf-diamante/lotes");
			if (!response.ok) throw new Error("Erro ao carregar lotes");
			const data = await response.json();
			return data.data ?? data.lotes ?? [];
		},
		{ key: "mtf-lotes", ttl: 5 * 60 * 1000 }, // 5 minutes
	);
}

// Hook específico para caixas MTF
export function useMtfCaixas() {
	return useDataCache(
		async () => {
			const response = await fetch("/api/admin/mtf-diamante/dialogflow/caixas");
			if (!response.ok) throw new Error("Erro ao carregar caixas");
			const data = await response.json();
			return data.caixas ?? [];
		},
		{ key: "mtf-caixas", ttl: 3 * 60 * 1000 }, // 3 minutes
	);
}
