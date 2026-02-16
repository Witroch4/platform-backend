import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { z } from "zod";

const testIntentSchema = z.object({
	text: z.string().min(1, "Text is required"),
	accountId: z.string().optional(),
});

type IntentCandidate = {
	name: string;
	similarity: number;
	threshold: number;
};

interface TestResult {
	intent?: {
		id: string;
		name: string;
		slug: string;
		actionType: string;
	} | null;
	score: number;
	candidates: IntentCandidate[];
	classification: "MATCHED" | "NO_MATCH";
	processingTime: number;
}

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user || session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { text, accountId } = testIntentSchema.parse(body);

		const startTime = Date.now();

		// Get active intents
		const intents = await prisma.intent.findMany({
			where: {
				isActive: true,
				...(accountId && { accountId }),
			},
			select: {
				id: true,
				name: true,
				slug: true,
				actionType: true,
				similarityThreshold: true,
			},
		});

		if (intents.length === 0) {
			return NextResponse.json({
				intent: null,
				score: 0,
				candidates: [],
				classification: "NO_MATCH",
				processingTime: Date.now() - startTime,
			});
		}

		// Simulate intent classification
		// In a real implementation, this would:
		// 1. Generate embedding for the input text
		// 2. Perform vector similarity search against intent embeddings
		// 3. Return ranked candidates with similarity scores

		const candidates = intents
			.map(
				(intent: (typeof intents)[0]): IntentCandidate => ({
					name: intent.name,
					similarity: Math.random(), // Simulated similarity score
					threshold: intent.similarityThreshold,
				}),
			)
			.sort((a: IntentCandidate, b: IntentCandidate) => b.similarity - a.similarity);

		const topCandidate = candidates[0];
		const isMatch = topCandidate && topCandidate.similarity >= topCandidate.threshold;

		let matchedIntent = null;
		if (isMatch) {
			const intent = intents.find((i: (typeof intents)[0]) => i.name === topCandidate.name);
			if (intent) {
				matchedIntent = {
					id: intent.id,
					name: intent.name,
					slug: intent.slug,
					actionType: intent.actionType,
				};
			}
		}

		const result: TestResult = {
			intent: matchedIntent,
			score: topCandidate?.similarity || 0,
			candidates,
			classification: isMatch ? "MATCHED" : "NO_MATCH",
			processingTime: Date.now() - startTime,
		};

		return NextResponse.json(result);
	} catch (error) {
		console.error("Error testing intent classification:", error);

		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 });
		}

		return NextResponse.json({ error: "Failed to test intent classification" }, { status: 500 });
	}
}
