import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ queueName: string; action: string }> }
): Promise<NextResponse> {
  let queueName: string = '';
  let action: string = '';
  
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    queueName = resolvedParams.queueName;
    action = resolvedParams.action;

    // Validate queue name
    const validQueues = ["ai:incoming-message", "ai:embedding-upsert"];
    if (!validQueues.includes(queueName)) {
      return NextResponse.json({ error: "Invalid queue name" }, { status: 400 });
    }

    // Validate action
    const validActions = ["pause", "resume", "clean"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // In a real implementation, this would interact with BullMQ
    console.log(`Performing ${action} on queue ${queueName}`);

    // Simulate the action
    switch (action) {
      case "pause":
        console.log(`Pausing queue ${queueName}`);
        // await queue.pause();
        break;
      case "resume":
        console.log(`Resuming queue ${queueName}`);
        // await queue.resume();
        break;
      case "clean":
        console.log(`Cleaning queue ${queueName}`);
        // await queue.clean(0, 'completed');
        // await queue.clean(0, 'failed');
        break;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Queue ${queueName} ${action} completed successfully` 
    });
  } catch (error) {
    console.error(`Error performing ${action || 'unknown action'} on queue ${queueName || 'unknown queue'}:`, error);
    return NextResponse.json(
      { error: `Failed to ${action || 'perform action on'} queue` },
      { status: 500 }
    );
  }
}