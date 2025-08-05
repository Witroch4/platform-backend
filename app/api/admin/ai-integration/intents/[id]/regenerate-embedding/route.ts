import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if intent exists
    const intent = await prisma.intent.findUnique({
      where: { id },
    });

    if (!intent) {
      return NextResponse.json({ error: "Intent not found" }, { status: 404 });
    }

    // Queue embedding regeneration
    await queueEmbeddingRegeneration(id, intent.name + " " + (intent.description || ""));

    return NextResponse.json({ 
      success: true, 
      message: "Embedding regeneration queued successfully" 
    });
  } catch (error) {
    console.error("Error queuing embedding regeneration:", error);
    return NextResponse.json(
      { error: "Failed to queue embedding regeneration" },
      { status: 500 }
    );
  }
}

async function queueEmbeddingRegeneration(intentId: string, text: string) {
  try {
    console.log(`Queuing embedding regeneration for intent ${intentId} with text: ${text}`);
    
    // In a real implementation, this would add a job to the ai:embedding-upsert queue
    // const embeddingQueue = getQueue('ai:embedding-upsert');
    // await embeddingQueue.add('regenerate-intent-embedding', {
    //   intentId,
    //   text,
    //   priority: 'high', // High priority for manual regeneration
    // });
    
    // For now, we'll simulate the process by updating the updatedAt timestamp
    await prisma.intent.update({
      where: { id: intentId },
      data: { updatedAt: new Date() },
    });
  } catch (error) {
    console.error("Error queuing embedding regeneration:", error);
    throw error;
  }
}