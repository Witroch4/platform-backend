import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

interface Job {
  id: string;
  name: string;
  queueName: string;
  status: "waiting" | "active" | "completed" | "failed" | "delayed";
  data: any;
  progress: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedAt?: string;
  finishedAt?: string;
  error?: string;
  returnValue?: any;
  delay?: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "all";
    const queue = searchParams.get("queue") || "all";

    const pageSize = 20;

    // Generate simulated job data
    const generateJob = (index: number): Job => {
      const statuses: Job["status"][] = ["waiting", "active", "completed", "failed", "delayed"];
      const jobStatus = statuses[Math.floor(Math.random() * statuses.length)];
      const queueNames = ["ai:incoming-message", "ai:embedding-upsert"];
      const queueName = queueNames[Math.floor(Math.random() * queueNames.length)];
      
      const createdAt = new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000);
      const processedAt = jobStatus !== "waiting" ? new Date(createdAt.getTime() + Math.random() * 60000) : undefined;
      const finishedAt = ["completed", "failed"].includes(jobStatus) ? new Date((processedAt?.getTime() || createdAt.getTime()) + Math.random() * 30000) : undefined;

      return {
        id: `job_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        name: queueName === "ai:incoming-message" ? "process-incoming-message" : "upsert-intent-embedding",
        queueName,
        status: jobStatus,
        data: {
          accountId: Math.floor(Math.random() * 100) + 1,
          conversationId: Math.floor(Math.random() * 1000) + 1,
          messageId: `msg_${Math.random().toString(36).substr(2, 9)}`,
          text: "Sample message text for processing",
          channel: Math.random() > 0.5 ? "whatsapp" : "instagram",
          traceId: `trace_${Math.random().toString(36).substr(2, 9)}`,
        },
        progress: jobStatus === "active" ? Math.floor(Math.random() * 100) : jobStatus === "completed" ? 100 : 0,
        attempts: Math.floor(Math.random() * 3) + 1,
        maxAttempts: 3,
        createdAt: createdAt.toISOString(),
        processedAt: processedAt?.toISOString(),
        finishedAt: finishedAt?.toISOString(),
        error: jobStatus === "failed" ? "Sample error: Connection timeout after 10 seconds" : undefined,
        returnValue: jobStatus === "completed" ? { success: true, processed: true } : undefined,
        delay: jobStatus === "delayed" ? Math.floor(Math.random() * 30000) : undefined,
      };
    };

    // Generate jobs
    let allJobs = Array.from({ length: 100 }, (_, i) => generateJob(i));

    // Apply filters
    if (search) {
      allJobs = allJobs.filter(job => 
        job.id.toLowerCase().includes(search.toLowerCase()) ||
        job.name.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(job.data).toLowerCase().includes(search.toLowerCase())
      );
    }

    if (status !== "all") {
      allJobs = allJobs.filter(job => job.status === status);
    }

    if (queue !== "all") {
      allJobs = allJobs.filter(job => job.queueName === queue);
    }

    // Sort by creation date (newest first)
    allJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
    const totalJobs = allJobs.length;
    const totalPages = Math.ceil(totalJobs / pageSize);
    const startIndex = (page - 1) * pageSize;
    const jobs = allJobs.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      jobs,
      totalJobs,
      totalPages,
      currentPage: page,
      pageSize,
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}