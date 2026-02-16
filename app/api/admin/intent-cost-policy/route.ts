/**
 * Intent Cost Policy Management API
 * Based on requirements 15.2, 15.3
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisInstance } from "@/lib/connections";
import { IntentCostPolicyService } from "@/lib/ai-integration/services/intent-cost-policy";
import log from "@/lib/log";

// GET /api/admin/intent-cost-policy - Get intent policies or evaluate intent cost
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const intentId = searchParams.get("intentId");
		const accountId = searchParams.get("accountId");
		const action = searchParams.get("action");

		const redis = getRedisInstance();
		const policyService = new IntentCostPolicyService(redis);

		if (action === "evaluate" && intentId && accountId) {
			// Evaluate intent cost for specific account
			const decision = await policyService.evaluateIntentCost(intentId, parseInt(accountId));

			return NextResponse.json({
				success: true,
				data: { decision },
			});
		}

		if (intentId) {
			// Get specific intent policy
			const policy = await policyService.getIntentPolicy(intentId);

			return NextResponse.json({
				success: true,
				data: { policy },
			});
		}

		// List all predefined intent categories
		const { INTENT_COST_CATEGORIES } = await import("@/lib/ai-integration/types/intent-cost-policy");

		const categories = Object.entries(INTENT_COST_CATEGORIES).map(([key, value]) => ({
			intentId: key,
			name: key.replace(/_/g, " ").toLowerCase(),
			...value,
		}));

		return NextResponse.json({
			success: true,
			data: { categories },
		});
	} catch (error) {
		log.error("Error in intent cost policy API", { error });

		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 },
		);
	}
}

// POST /api/admin/intent-cost-policy - Create or update intent policy
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const {
			intentId,
			intentName,
			costCategory,
			estimatedTokens,
			estimatedCostBrl,
			fallbackStrategy,
			budgetThresholdPercent,
			enabled,
		} = body;

		if (!intentId || !intentName || !costCategory) {
			return NextResponse.json(
				{
					success: false,
					error: "Missing required fields: intentId, intentName, costCategory",
				},
				{ status: 400 },
			);
		}

		const redis = getRedisInstance();
		const policyService = new IntentCostPolicyService(redis);

		const policy = await policyService.setIntentPolicy({
			intentId,
			intentName,
			costCategory,
			estimatedTokens: estimatedTokens || 100,
			estimatedCostBrl: estimatedCostBrl || 0.002,
			maxTokensAllowed: (estimatedTokens || 100) * 2,
			fallbackStrategy: fallbackStrategy || "template",
			budgetThresholdPercent: budgetThresholdPercent || 85,
			enabled: enabled !== false,
		});

		return NextResponse.json({
			success: true,
			data: { policy },
			message: "Intent policy created successfully",
		});
	} catch (error) {
		log.error("Error creating intent policy", { error });

		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 },
		);
	}
}

// PUT /api/admin/intent-cost-policy - Update intent policy
export async function PUT(request: NextRequest) {
	try {
		const body = await request.json();
		const { intentId, ...updates } = body;

		if (!intentId) {
			return NextResponse.json(
				{
					success: false,
					error: "intentId is required",
				},
				{ status: 400 },
			);
		}

		const redis = getRedisInstance();
		const policyService = new IntentCostPolicyService(redis);

		const policy = await policyService.updateIntentPolicy(intentId, updates);

		return NextResponse.json({
			success: true,
			data: { policy },
			message: "Intent policy updated successfully",
		});
	} catch (error) {
		log.error("Error updating intent policy", { error });

		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
