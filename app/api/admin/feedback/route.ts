import { NextRequest, NextResponse } from "next/server";
import { FeedbackCollector, getFeedbackCollector } from "@/lib/feedback/feedback-collector";
import { getRedisInstance, getPrismaInstance } from "@/lib/connections";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const limit = parseInt(searchParams.get("limit") || "50");
		const offset = parseInt(searchParams.get("offset") || "0");
		const type = searchParams.get("type") as any;
		const severity = searchParams.get("severity") as any;
		const status = searchParams.get("status") as any;
		const category = searchParams.get("category");

		const prisma = getPrismaInstance();
		const redis = getRedisInstance();
		const feedbackCollector = getFeedbackCollector(prisma, redis);

		const feedback = await feedbackCollector.getAllFeedback(limit, offset, {
			type: type || undefined,
			severity: severity || undefined,
			status: status || undefined,
			category: category || undefined,
		});

		const metrics = await feedbackCollector.getFeedbackMetrics();

		return NextResponse.json({
			feedback,
			metrics,
			pagination: {
				limit,
				offset,
				total: metrics.totalFeedback,
			},
		});
	} catch (error) {
		console.error("[Feedback API] Error getting feedback:", error);
		return NextResponse.json({ error: "Failed to get feedback" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const {
			userId,
			type,
			category,
			title,
			description,
			severity = "MEDIUM",
			metadata,
			systemContext,
			userEmail,
		} = body;

		if (!userId || !type || !category || !title || !description) {
			return NextResponse.json(
				{ error: "userId, type, category, title, and description are required" },
				{ status: 400 },
			);
		}

		const prisma = getPrismaInstance();
		const redis = getRedisInstance();
		const feedbackCollector = getFeedbackCollector(prisma, redis);

		const feedback = await feedbackCollector.submitFeedback(
			userId,
			type,
			category,
			title,
			description,
			severity,
			metadata,
			systemContext,
			userEmail,
		);

		return NextResponse.json(feedback);
	} catch (error) {
		console.error("[Feedback API] Error submitting feedback:", error);
		return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
	}
}
