import { getRedisInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";
import type { AssistantConfig } from "./assistant-config";

const logger = createLogger("SocialWise-AssistantConfig-Cache");

const ASSISTANT_CONFIG_CACHE_TTL_SECONDS = 48 * 60 * 60;
const ASSISTANT_CONFIG_CACHE_PREFIX = "socialwise:assistant-config";
const ASSISTANT_CONFIG_VERSION_KEY = `${ASSISTANT_CONFIG_CACHE_PREFIX}:version`;
const VERSION_PATTERN = /^v[\w.-]+$/;

const localCache = new Map<string, { value: AssistantConfig; expiresAt: number }>();
let localVersion = "v1";

async function readVersion(): Promise<string> {
	try {
		const redis = getRedisInstance?.();
		if (redis) {
			const version = await redis.get(ASSISTANT_CONFIG_VERSION_KEY);
			if (typeof version === "string") {
				const normalizedVersion = version.trim();
				if (normalizedVersion.length > 0 && VERSION_PATTERN.test(normalizedVersion)) {
					localVersion = normalizedVersion;
					return normalizedVersion;
				}
			}
		}
	} catch (error) {
		logger.warn("Failed to read assistant config cache version from Redis", { error });
	}

	return localVersion;
}

function buildScopedCacheKey(version: string, cacheKey: string): string {
	return `${ASSISTANT_CONFIG_CACHE_PREFIX}:${version}:${cacheKey}`;
}

export async function getAssistantConfigurationCache(cacheKey: string): Promise<AssistantConfig | null> {
	const version = await readVersion();
	const scopedKey = buildScopedCacheKey(version, cacheKey);
	const localEntry = localCache.get(scopedKey);

	if (localEntry && localEntry.expiresAt > Date.now()) {
		return localEntry.value;
	}

	if (localEntry) {
		localCache.delete(scopedKey);
	}

	try {
		const redis = getRedisInstance?.();
		if (!redis) {
			return null;
		}

		const cached = await redis.get(scopedKey);
		if (!cached) {
			return null;
		}

		const value = JSON.parse(cached) as AssistantConfig;
		localCache.set(scopedKey, {
			value,
			expiresAt: Date.now() + ASSISTANT_CONFIG_CACHE_TTL_SECONDS * 1000,
		});
		return value;
	} catch (error) {
		logger.warn("Failed to read assistant config cache", { error, cacheKey });
		return null;
	}
}

export async function setAssistantConfigurationCache(cacheKey: string, value: AssistantConfig): Promise<void> {
	const version = await readVersion();
	const scopedKey = buildScopedCacheKey(version, cacheKey);
	const expiresAt = Date.now() + ASSISTANT_CONFIG_CACHE_TTL_SECONDS * 1000;

	localCache.set(scopedKey, { value, expiresAt });

	try {
		const redis = getRedisInstance?.();
		if (!redis) {
			return;
		}

		await redis.setex(scopedKey, ASSISTANT_CONFIG_CACHE_TTL_SECONDS, JSON.stringify(value));
	} catch (error) {
		logger.warn("Failed to persist assistant config cache", { error, cacheKey });
	}
}

export async function invalidateAssistantConfigurationCache(reason?: string): Promise<void> {
	const version = `v${Date.now()}`;
	localVersion = version;
	localCache.clear();

	try {
		const redis = getRedisInstance?.();
		if (redis) {
			await redis.set(ASSISTANT_CONFIG_VERSION_KEY, version);
		}
	} catch (error) {
		logger.warn("Failed to invalidate assistant config cache in Redis", { error, reason });
	}

	logger.info("Assistant configuration cache invalidated", { reason, version });
}
