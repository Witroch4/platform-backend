import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

interface QueueInfo {
  name: string;
  displayName: string;
  status: "active" | "paused" | "failed";
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
  processingRate: number;
  avgProcessingTime: number;
  lastProcessed?: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // In a real implementation, this would connect to BullMQ and get actual queue stats
    // For now, we'll return simulated data
    const queues: QueueInfo[] = [
      {
        name: "ai:incoming-message",
        displayName: "AI Incoming Messages",
        status: "active",
        waiting: 12,
        active: 3,
        completed: 1247,
        failed: 8,
        delayed: 2,
        isPaused: false,
        processingRate: 45,
        avgProcessingTime: 1250,
        lastProcessed: new Date(Date.now() - 30000).toISOString(),
      },
      {
        name: "ai:embedding-upsert",
        displayName: "AI Embedding Upsert",
        status: "active",
        waiting: 5,
        active: 1,
        completed: 342,
        failed: 2,
        delayed: 0,
        isPaused: false,
        processingRate: 12,
        avgProcessingTime: 3200,
        lastProcessed: new Date(Date.now() - 120000).toISOString(),
      },
    ];

    // Simulate some dynamic data
    queues.forEach(queue => {
      queue.waiting = Math.floor(Math.random() * 20);
      queue.active = Math.floor(Math.random() * 5);
      queue.processingRate = Math.floor(Math.random() * 60) + 10;
    });

    return NextResponse.json({ queues });
  } catch (error) {
    console.error("Error fetching queues:", error);
    return NextResponse.json(
      { error: "Failed to fetch queues" },
      { status: 500 }
    );
  }
}