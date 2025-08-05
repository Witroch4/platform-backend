import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

interface DLQJob {
  id: string;
  originalQueue: string;
  jobName: string;
  data: any;
  error: string;
  failedAt: string;
  attempts: number;
  lastError: string;
  canRetry: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queue = searchParams.get("queue");

    // Generate simulated DLQ data
    const generateDLQJob = (index: number): DLQJob => {
      const queues = ["ai:incoming-message", "ai:embedding-upsert"];
      const originalQueue = queues[Math.floor(Math.random() * queues.length)];
      const jobName = originalQueue === "ai:incoming-message" ? "process-incoming-message" : "upsert-intent-embedding";
      
      const errors = [
        "Connection timeout after 10 seconds",
        "OpenAI API rate limit exceeded",
        "Invalid message format: missing required field 'content'",
        "Database connection failed: connection pool exhausted",
        "Chatwit API returned 500: Internal Server Error",
        "Embedding generation failed: model not available",
        "Authentication failed: invalid API key",
        "Validation error: similarity threshold must be between 0 and 1",
      ];

      const error = errors[Math.floor(Math.random() * errors.length)];
      const canRetry = !error.includes("Validation error") && !error.includes("Authentication failed");

      return {
        id: `dlq_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        originalQueue,
        jobName,
        data: {
          accountId: Math.floor(Math.random() * 100) + 1,
          conversationId: Math.floor(Math.random() * 1000) + 1,
          messageId: `msg_${Math.random().toString(36).substr(2, 9)}`,
          text: "Sample message that failed processing",
          channel: Math.random() > 0.5 ? "whatsapp" : "instagram",
          traceId: `trace_${Math.random().toString(36).substr(2, 9)}`,
        },
        error: `Error: ${error}`,
        failedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        attempts: Math.floor(Math.random() * 3) + 1,
        lastError: error,
        canRetry,
      };
    };

    let jobs = Array.from({ length: 15 }, (_, i) => generateDLQJob(i));

    // Apply queue filter
    if (queue && queue !== "all") {
      jobs = jobs.filter(job => job.originalQueue === queue);
    }

    // Sort by failed date (newest first)
    jobs.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error fetching DLQ jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch DLQ jobs" },
      { status: 500 }
    );
  }
}