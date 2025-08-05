import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { z } from "zod";

const createIntentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  description: z.string().optional(),
  actionType: z.enum(["TEMPLATE", "INTERACTIVE", "TEXT", "HUMAN_FALLBACK"]),
  similarityThreshold: z.number().min(0).max(1),
  isActive: z.boolean().default(true),
  templateId: z.string().optional(),
  accountId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const intents = await prisma.intent.findMany({
      where: accountId ? { accountId } : {},
      include: {
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
      },
      orderBy: [
        { isActive: "desc" },
        { usageCount: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ intents });
  } catch (error) {
    console.error("Error fetching intents:", error);
    return NextResponse.json(
      { error: "Failed to fetch intents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createIntentSchema.parse(body);

    // Check if slug is unique
    const existingIntent = await prisma.intent.findUnique({
      where: { slug: validatedData.slug },
    });

    if (existingIntent) {
      return NextResponse.json(
        { error: "Slug already exists" },
        { status: 400 }
      );
    }

    // Validate template exists if actionType is TEMPLATE
    if (validatedData.actionType === "TEMPLATE" && validatedData.templateId) {
      const template = await prisma.template.findUnique({
        where: { id: validatedData.templateId },
      });

      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 400 }
        );
      }
    }

    const intent = await prisma.intent.create({
      data: {
        ...validatedData,
        createdById: session.user.id,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    // Queue embedding generation
    await queueEmbeddingGeneration(intent.id, validatedData.name + " " + (validatedData.description || ""));

    return NextResponse.json({ intent }, { status: 201 });
  } catch (error) {
    console.error("Error creating intent:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create intent" },
      { status: 500 }
    );
  }
}

async function queueEmbeddingGeneration(intentId: string, text: string) {
  try {
    // This would queue the embedding generation job
    // For now, we'll just log it
    console.log(`Queuing embedding generation for intent ${intentId} with text: ${text}`);
    
    // In a real implementation, this would add a job to the ai:embedding-upsert queue
    // const embeddingQueue = getQueue('ai:embedding-upsert');
    // await embeddingQueue.add('generate-intent-embedding', {
    //   intentId,
    //   text,
    // });
  } catch (error) {
    console.error("Error queuing embedding generation:", error);
  }
}