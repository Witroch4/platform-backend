/**
 * Budget Check API
 * Based on requirements 15.1, 15.3
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisInstance } from "@/lib/connections";
import { BudgetGuardService } from "@/lib/ai-integration/services/budget-guard";
import log from "@/lib/log";

// POST /api/admin/budget/check - Check budget violation for account
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { accountId } = body;

		if (!accountId) {
			return NextResponse.json(
				{
					success: false,
					error: "accountId is required",
				},
				{ status: 400 },
			);
		}

		const redis = getRedisInstance();
		const budgetGuard = new BudgetGuardService(redis);

		const violation = await budgetGuard.checkBudgetViolation(accountId);
		const allowance = await budgetGuard.isAccountAllowed(accountId);

		return NextResponse.json({
			success: true,
			data: {
				violation,
				allowance,
			},
		});
	} catch (error) {
		log.error("Error checking budget violation", { error });

		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 },
		);
	}
}

// GET /api/admin/budget/check/batch - Check multiple accounts
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const accountIdsParam = searchParams.get("accountIds");

		if (!accountIdsParam) {
			return NextResponse.json(
				{
					success: false,
					error: "accountIds parameter is required (comma-separated)",
				},
				{ status: 400 },
			);
		}

		const accountIds = accountIdsParam.split(",").map((id) => parseInt(id.trim()));

		if (accountIds.some((id) => isNaN(id))) {
			return NextResponse.json(
				{
					success: false,
					error: "All accountIds must be valid numbers",
				},
				{ status: 400 },
			);
		}

		const redis = getRedisInstance();
		const budgetGuard = new BudgetGuardService(redis);

		const results = await Promise.all(
			accountIds.map(async (accountId) => {
				try {
					const violation = await budgetGuard.checkBudgetViolation(accountId);
					const allowance = await budgetGuard.isAccountAllowed(accountId);

					return {
						accountId,
						violation,
						allowance,
						error: null,
					};
				} catch (error) {
					log.error("Error checking budget for account", { accountId, error });
					return {
						accountId,
						violation: null,
						allowance: { allowed: true, reason: "Check failed - allowing requests" },
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			}),
		);

		return NextResponse.json({
			success: true,
			data: { results },
		});
	} catch (error) {
		log.error("Error in batch budget check", { error });

		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 },
		);
	}
}
