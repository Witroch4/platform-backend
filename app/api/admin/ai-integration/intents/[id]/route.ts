import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { z } from "zod";

const updateIntentSchema = z.object({
	name: z.string().min(1, "Name is required"),
	slug: z
		.string()
		.min(1, "Slug is required")
		.regex(/^[a-z0-9-]+$/, "Invalid slug format"),
	description: z.string().optional(),
	actionType: z.enum(["TEMPLATE", "INTERACTIVE", "TEXT", "HUMAN_FALLBACK"]),
	similarityThreshold: z.number().min(0).max(1),
	isActive: z.boolean(),
	templateId: z.string().optional(),
});

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user || session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id } = await params;

		const intent = await prisma.intent.findUnique({
			where: { id },
			// Avoid selecting the unsupported "embedding" column
			select: {
				id: true,
				name: true,
				description: true,
				actionType: true,
				template: {
					select: {
						id: true,
						name: true,
						type: true,
					},
				},
				createdBy: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
				hitLogs: {
					take: 10,
					orderBy: { createdAt: "desc" },
					select: {
						id: true,
						similarity: true,
						chosen: true,
						createdAt: true,
					},
				},
			},
		});

		if (!intent) {
			return NextResponse.json({ error: "Intent not found" }, { status: 404 });
		}

		return NextResponse.json({ intent });
	} catch (error) {
		console.error("Error fetching intent:", error);
		return NextResponse.json({ error: "Failed to fetch intent" }, { status: 500 });
	}
}

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user || session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id } = await params;

		const body = await request.json();
		const validatedData = updateIntentSchema.parse(body);

		// Check if intent exists
		const existingIntent = await prisma.intent.findUnique({
			where: { id },
			select: { id: true, name: true, description: true, slug: true },
		});

		if (!existingIntent) {
			return NextResponse.json({ error: "Intent not found" }, { status: 404 });
		}

		// Check if slug is unique (excluding current intent)
		const slugConflict = await prisma.intent.findFirst({
			where: {
				slug: validatedData.slug,
				id: { not: id },
			},
			select: { id: true },
		});

		if (slugConflict) {
			return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
		}

		// Validate template exists if actionType is TEMPLATE
		if (validatedData.actionType === "TEMPLATE" && validatedData.templateId) {
			const template = await prisma.template.findUnique({
				where: { id: validatedData.templateId },
			});

			if (!template) {
				return NextResponse.json({ error: "Template not found" }, { status: 400 });
			}
		}

		const intent = await prisma.intent.update({
			where: { id },
			data: validatedData,
			select: {
				id: true,
				name: true,
				description: true,
				actionType: true,
				template: { select: { id: true, name: true, type: true } },
			},
		});

		// Queue embedding regeneration if name or description changed
		const textChanged =
			existingIntent.name !== validatedData.name || existingIntent.description !== validatedData.description;

		if (textChanged) {
			await queueEmbeddingGeneration(intent.id, validatedData.name + " " + (validatedData.description || ""));
		}

		return NextResponse.json({ intent });
	} catch (error) {
		console.error("Error updating intent:", error);

		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 });
		}

		return NextResponse.json({ error: "Failed to update intent" }, { status: 500 });
	}
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user || session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id } = await params;

		// Check if intent exists
		const existingIntent = await prisma.intent.findUnique({
			where: { id },
			select: { id: true, name: true, description: true, createdById: true },
		});

		if (!existingIntent) {
			return NextResponse.json({ error: "Intent not found" }, { status: 404 });
		}

		// Delete the intent using raw SQL to avoid vector deserialization issues
		await prisma.$executeRaw`DELETE FROM "Intent" WHERE id = ${id}`;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error deleting intent:", error);
		return NextResponse.json({ error: "Failed to delete intent" }, { status: 500 });
	}
}

async function queueEmbeddingGeneration(intentId: string, text: string) {
	try {
		console.log(`Queuing embedding regeneration for intent ${intentId} with text: ${text}`);

		// In a real implementation, this would add a job to the ai:embedding-upsert queue
		// const embeddingQueue = getQueue('ai:embedding-upsert');
		// await embeddingQueue.add('regenerate-intent-embedding', {
		//   intentId,
		//   text,
		// });
	} catch (error) {
		console.error("Error queuing embedding generation:", error);
	}
}
