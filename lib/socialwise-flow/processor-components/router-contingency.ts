import { getRedisInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("SocialWise-Router-Contingency");

export const ROUTER_DEADLINE_WINDOW_MS = 10 * 60 * 1000;
export const ROUTER_DEADLINE_THRESHOLD = 3;
export const ROUTER_CONTINGENCY_TTL_MS = 12 * 60 * 60 * 1000;

const DEADLINE_PREFIX = "socialwise:router:deadlines";
const CONTINGENCY_PREFIX = "socialwise:router:contingency";

const localDeadlineWindows = new Map<string, number[]>();
const localContingencies = new Map<string, number>();

export interface RouterContingencyState {
	active: boolean;
	expiresAt?: number;
}

export interface RouterDeadlineRecordResult {
	count: number;
	contingencyActivated: boolean;
	expiresAt?: number;
}

function buildScope(inboxId: string, assistantId?: string): string {
	return `${inboxId}:${assistantId || "default"}`;
}

function buildDeadlineKey(scope: string): string {
	return `${DEADLINE_PREFIX}:${scope}`;
}

function buildContingencyKey(scope: string): string {
	return `${CONTINGENCY_PREFIX}:${scope}`;
}

function pruneTimestamps(timestamps: number[], now: number): number[] {
	return timestamps.filter((timestamp) => now - timestamp <= ROUTER_DEADLINE_WINDOW_MS);
}

export async function getRouterContingencyState(
	inboxId: string,
	assistantId?: string,
): Promise<RouterContingencyState> {
	const scope = buildScope(inboxId, assistantId);
	const now = Date.now();

	const localExpiresAt = localContingencies.get(scope);
	if (typeof localExpiresAt === "number" && localExpiresAt > now) {
		return { active: true, expiresAt: localExpiresAt };
	}
	if (typeof localExpiresAt === "number") {
		localContingencies.delete(scope);
	}

	try {
		const redis = getRedisInstance?.();
		if (!redis) {
			return { active: false };
		}

		const raw = await redis.get(buildContingencyKey(scope));
		if (!raw) {
			return { active: false };
		}

		const parsed = JSON.parse(raw) as { expiresAt?: number };
		if (typeof parsed.expiresAt === "number" && parsed.expiresAt > now) {
			localContingencies.set(scope, parsed.expiresAt);
			return { active: true, expiresAt: parsed.expiresAt };
		}

		await redis.del(buildContingencyKey(scope));
		return { active: false };
	} catch (error) {
		logger.warn("Failed to read router contingency state", { error, inboxId, assistantId });
		return { active: false };
	}
}

export async function recordRouterDeadline(
	inboxId: string,
	assistantId?: string,
	fallbackConfigured = true,
): Promise<RouterDeadlineRecordResult> {
	const scope = buildScope(inboxId, assistantId);
	const now = Date.now();
	const deadlineKey = buildDeadlineKey(scope);
	const contingencyKey = buildContingencyKey(scope);

	let timestamps: number[] = [];

	const localWindow = localDeadlineWindows.get(scope);
	if (localWindow) {
		timestamps = pruneTimestamps(localWindow, now);
	}

	try {
		const redis = getRedisInstance?.();
		if (redis) {
			const cached = await redis.get(deadlineKey);
			if (cached) {
				timestamps = pruneTimestamps(JSON.parse(cached) as number[], now);
			}
		}
	} catch (error) {
		logger.warn("Failed to read router deadline window", { error, inboxId, assistantId });
	}

	timestamps.push(now);
	localDeadlineWindows.set(scope, timestamps);

	let contingencyActivated = false;
	let expiresAt: number | undefined;

	if (fallbackConfigured && timestamps.length >= ROUTER_DEADLINE_THRESHOLD) {
		contingencyActivated = true;
		expiresAt = now + ROUTER_CONTINGENCY_TTL_MS;
		localContingencies.set(scope, expiresAt);
	}

	try {
		const redis = getRedisInstance?.();
		if (redis) {
			await redis.setex(
				deadlineKey,
				Math.ceil(ROUTER_DEADLINE_WINDOW_MS / 1000),
				JSON.stringify(timestamps),
			);

			if (contingencyActivated && expiresAt) {
				await redis.setex(
					contingencyKey,
					Math.ceil(ROUTER_CONTINGENCY_TTL_MS / 1000),
					JSON.stringify({ expiresAt }),
				);
			}
		}
	} catch (error) {
		logger.warn("Failed to persist router deadline window", { error, inboxId, assistantId });
	}

	logger.warn("Router deadline recorded", {
		inboxId,
		assistantId,
		count: timestamps.length,
		contingencyActivated,
		expiresAt,
	});

	return {
		count: timestamps.length,
		contingencyActivated,
		expiresAt,
	};
}
