/**
 * Feature Flag Gradual Rollout API
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisInstance } from "@/lib/connections";
import { FeatureFlagManager } from "@/lib/ai-integration/services/feature-flag-manager";
import log from "@/lib/log";

// POST /api/admin/feature-flags/rollout - Perform gradual rollout
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { flagId, targetPercentage, incrementPercentage, userId } = body;

		if (!flagId || targetPercentage === undefined || !userId) {
			return NextResponse.json(
				{
					success: false,
					error: "Missing required fields: flagId, targetPercentage, userId",
				},
				{ status: 400 },
			);
		}

		if (targetPercentage < 0 || targetPercentage > 100) {
			return NextResponse.json(
				{
					success: false,
					error: "targetPercentage must be between 0 and 100",
				},
				{ status: 400 },
			);
		}

		const redis = getRedisInstance();
		const flagManager = new FeatureFlagManager(redis);

		await flagManager.performGradualRollout(flagId, targetPercentage, incrementPercentage || 5);

		return NextResponse.json({
			success: true,
			message: "Gradual rollout performed successfully",
		});
	} catch (error) {
		log.error("Error performing gradual rollout", { error });

		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

// POST /api/admin/feature-flags/rollout/emergency-disable - Emergency kill switch
export async function DELETE(request: NextRequest) {
	try {
		const body = await request.json();
		const { flagId, reason, userId } = body;

		if (!flagId || !reason || !userId) {
			return NextResponse.json(
				{
					success: false,
					error: "Missing required fields: flagId, reason, userId",
				},
				{ status: 400 },
			);
		}

		const redis = getRedisInstance();
		const flagManager = new FeatureFlagManager(redis);

		await flagManager.emergencyDisable(flagId, reason, userId);

		return NextResponse.json({
			success: true,
			message: "Emergency kill switch activated successfully",
		});
	} catch (error) {
		log.error("Error activating emergency kill switch", { error });

		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 },
		);
	}
}
