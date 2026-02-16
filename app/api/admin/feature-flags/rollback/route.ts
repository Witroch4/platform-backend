import { NextRequest, NextResponse } from "next/server";
import { RollbackManager } from "@/lib/feature-flags/rollback-manager";
import { getRedisInstance, getPrismaInstance } from "@/lib/connections";

export async function GET(request: NextRequest) {
	try {
		const prisma = getPrismaInstance();
		const redis = getRedisInstance();
		const rollbackManager = RollbackManager.getInstance(prisma, redis);

		const plans = await rollbackManager.getAllRollbackPlans();
		const executions = await rollbackManager.getRollbackExecutions(20);

		return NextResponse.json({
			plans,
			executions,
		});
	} catch (error: unknown) {
		console.error("[Rollback API] Error getting rollback data:", error);
		return NextResponse.json({ error: "Failed to get rollback data" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { type, flagNames, reason, executedBy } = body;

		if (!flagNames || !Array.isArray(flagNames) || flagNames.length === 0) {
			return NextResponse.json({ error: "Flag names array is required" }, { status: 400 });
		}

		const prisma = getPrismaInstance();
		const redis = getRedisInstance();
		const rollbackManager = RollbackManager.getInstance(prisma, redis);

		if (type === "emergency") {
			// Emergency rollback
			const execution = await rollbackManager.emergencyRollback(
				flagNames,
				reason || "Emergency rollback via API",
				executedBy || "admin-api",
			);

			return NextResponse.json({
				success: true,
				message: "Emergency rollback executed",
				execution,
			});
		} else {
			// Create rollback plan
			const plan = await rollbackManager.createRollbackPlan(
				"API Rollback Plan",
				reason || "Rollback plan created via API",
				flagNames,
				executedBy || "admin-api",
			);

			// Execute the plan
			const execution = await rollbackManager.executeRollbackPlan(
				plan.id,
				executedBy || "admin-api",
				reason || "Rollback executed via API",
			);

			return NextResponse.json({
				success: true,
				message: "Rollback plan created and executed",
				plan,
				execution,
			});
		}
	} catch (error: unknown) {
		console.error("[Rollback API] Error executing rollback:", error);
		return NextResponse.json({ error: "Failed to execute rollback" }, { status: 500 });
	}
}

export async function PUT(request: NextRequest) {
	try {
		const body = await request.json();
		const { planId, executedBy, reason } = body;

		if (!planId) {
			return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
		}

		const prisma = getPrismaInstance();
		const redis = getRedisInstance();
		const rollbackManager = RollbackManager.getInstance(prisma, redis);

		const execution = await rollbackManager.executeRollbackPlan(
			planId,
			executedBy || "admin-api",
			reason || "Rollback plan executed via API",
		);

		return NextResponse.json({
			success: true,
			message: "Rollback plan executed",
			execution,
		});
	} catch (error: unknown) {
		console.error("[Rollback API] Error executing rollback plan:", error);
		return NextResponse.json({ error: "Failed to execute rollback plan" }, { status: 500 });
	}
}
