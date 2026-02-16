/**
 * Utility functions for working with the extended Feature Flag schema
 * Demonstrates usage of the new columns and tables with the singleton connection
 */

import { getPrismaInstance } from "../connections";
import type { FeatureFlag, UserFeatureFlagOverride, FeatureFlagMetrics } from "@prisma/client";

const prisma = getPrismaInstance();

export interface CreateFeatureFlagData {
	name: string;
	description: string;
	enabled?: boolean;
	rolloutPercentage?: number;
	category?: string;
	userSpecific?: boolean;
	systemCritical?: boolean;
	metadata?: Record<string, any>;
	createdBy: string;
}

export interface CreateUserOverrideData {
	userId: string;
	flagId: string;
	enabled: boolean;
	expiresAt?: Date;
	createdBy: string;
}

export interface UpdateMetricsData {
	flagId: string;
	evaluations: number;
	enabledCount: number;
	disabledCount: number;
	averageLatencyMs?: number;
	lastEvaluatedAt?: Date;
	date: Date;
}

/**
 * Create a new feature flag with extended schema support
 */
export async function createFeatureFlag(data: CreateFeatureFlagData): Promise<FeatureFlag> {
	return await prisma.featureFlag.create({
		data: {
			name: data.name,
			description: data.description,
			enabled: data.enabled ?? false,
			rolloutPercentage: data.rolloutPercentage ?? 0,
			category: data.category ?? "system",
			userSpecific: data.userSpecific ?? false,
			systemCritical: data.systemCritical ?? false,
			metadata: data.metadata ?? {},
			conditions: {},
			createdBy: data.createdBy,
		},
	});
}

/**
 * Create a user-specific feature flag override
 */
export async function createUserOverride(data: CreateUserOverrideData): Promise<UserFeatureFlagOverride> {
	return await prisma.userFeatureFlagOverride.create({
		data: {
			userId: data.userId,
			flagId: data.flagId,
			enabled: data.enabled,
			expiresAt: data.expiresAt,
			createdBy: data.createdBy,
		},
	});
}

/**
 * Update or create feature flag metrics for a specific date
 */
export async function upsertFeatureFlagMetrics(data: UpdateMetricsData): Promise<FeatureFlagMetrics> {
	return await prisma.featureFlagMetrics.upsert({
		where: {
			flagId_date: {
				flagId: data.flagId,
				date: data.date,
			},
		},
		update: {
			evaluations: data.evaluations,
			enabledCount: data.enabledCount,
			disabledCount: data.disabledCount,
			averageLatencyMs: data.averageLatencyMs ?? 0,
			lastEvaluatedAt: data.lastEvaluatedAt,
		},
		create: {
			flagId: data.flagId,
			evaluations: data.evaluations,
			enabledCount: data.enabledCount,
			disabledCount: data.disabledCount,
			averageLatencyMs: data.averageLatencyMs ?? 0,
			lastEvaluatedAt: data.lastEvaluatedAt,
			date: data.date,
		},
	});
}

/**
 * Get feature flag with all related data
 */
export async function getFeatureFlagWithRelations(flagId: string) {
	return await prisma.featureFlag.findUnique({
		where: { id: flagId },
		include: {
			userOverrides: {
				include: {
					user: {
						select: { id: true, name: true, email: true },
					},
					creator: {
						select: { id: true, name: true, email: true },
					},
				},
			},
			metrics: {
				orderBy: { date: "desc" },
				take: 30, // Last 30 days
			},
		},
	});
}

/**
 * Get user-specific overrides for a user
 */
export async function getUserFeatureFlagOverrides(userId: string) {
	return await prisma.userFeatureFlagOverride.findMany({
		where: {
			userId,
			OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
		},
		include: {
			flag: {
				select: {
					id: true,
					name: true,
					description: true,
					category: true,
					systemCritical: true,
				},
			},
		},
	});
}

/**
 * Get feature flags by category
 */
export async function getFeatureFlagsByCategory(category: string) {
	return await prisma.featureFlag.findMany({
		where: { category },
		include: {
			_count: {
				select: {
					userOverrides: true,
					metrics: true,
				},
			},
		},
		orderBy: [{ systemCritical: "desc" }, { name: "asc" }],
	});
}

/**
 * Get system critical feature flags
 */
export async function getSystemCriticalFlags() {
	return await prisma.featureFlag.findMany({
		where: { systemCritical: true },
		include: {
			userOverrides: {
				where: {
					OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
				},
			},
			metrics: {
				orderBy: { date: "desc" },
				take: 7, // Last 7 days for critical flags
			},
		},
	});
}

/**
 * Clean up expired user overrides
 */
export async function cleanupExpiredOverrides(): Promise<number> {
	const result = await prisma.userFeatureFlagOverride.deleteMany({
		where: {
			expiresAt: {
				lt: new Date(),
			},
		},
	});

	return result.count;
}
