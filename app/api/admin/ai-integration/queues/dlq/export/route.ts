import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // In a real implementation, this would fetch all DLQ jobs from the database
    // For now, we'll generate sample export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: session.user.email,
      totalJobs: 15,
      jobs: Array.from({ length: 15 }, (_, i) => ({
        id: `dlq_export_${i}`,
        originalQueue: i % 2 === 0 ? "ai:incoming-message" : "ai:embedding-upsert",
        jobName: i % 2 === 0 ? "process-incoming-message" : "upsert-intent-embedding",
        data: {
          accountId: Math.floor(Math.random() * 100) + 1,
          conversationId: Math.floor(Math.random() * 1000) + 1,
          messageId: `msg_export_${i}`,
          text: `Sample message ${i} that failed processing`,
          channel: Math.random() > 0.5 ? "whatsapp" : "instagram",
          traceId: `trace_export_${i}`,
        },
        error: `Sample error ${i}: Connection timeout`,
        failedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        attempts: Math.floor(Math.random() * 3) + 1,
        lastError: `Sample error ${i}: Connection timeout`,
        canRetry: Math.random() > 0.3,
      })),
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="dlq-export-${new Date().toISOString().split('T')[0]}.json"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error exporting DLQ data:", error);
    return NextResponse.json(
      { error: "Failed to export DLQ data" },
      { status: 500 }
    );
  }
}