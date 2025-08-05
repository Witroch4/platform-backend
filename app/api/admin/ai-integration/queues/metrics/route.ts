import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

interface QueueMetrics {
  queueName: string;
  displayName: string;
  totalJobs: number;
  successRate: number;
  avgProcessingTime: number;
  throughput: number;
  errorRate: number;
  peakHours: string[];
  trends: {
    period: string;
    jobs: number;
    success: number;
    avgTime: number;
  }[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "24h";
    const queue = searchParams.get("queue") || "all";

    // Generate simulated metrics data
    const generateMetrics = (queueName: string, displayName: string): QueueMetrics => {
      const totalJobs = Math.floor(Math.random() * 1000) + 500;
      const successRate = 0.85 + Math.random() * 0.1; // 85-95%
      const avgProcessingTime = Math.floor(Math.random() * 2000) + 500; // 500-2500ms
      const throughput = Math.floor(Math.random() * 50) + 10; // 10-60 jobs/min
      const errorRate = 1 - successRate;

      // Generate trend data
      const periods = {
        "1h": 12, // 5-minute intervals
        "24h": 24, // hourly intervals
        "7d": 7, // daily intervals
        "30d": 30, // daily intervals
      }[range] || 24;

      const trends = Array.from({ length: periods }, (_, i) => {
        const jobs = Math.floor(Math.random() * 100) + 20;
        const success = Math.floor(jobs * successRate);
        const avgTime = avgProcessingTime + (Math.random() - 0.5) * 500;

        let period: string;
        if (range === "1h") {
          const time = new Date(Date.now() - (periods - i) * 5 * 60 * 1000);
          period = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (range === "24h") {
          const time = new Date(Date.now() - (periods - i) * 60 * 60 * 1000);
          period = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          const date = new Date(Date.now() - (periods - i) * 24 * 60 * 60 * 1000);
          period = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        return {
          period,
          jobs,
          success,
          avgTime: Math.round(avgTime),
        };
      });

      return {
        queueName,
        displayName,
        totalJobs,
        successRate,
        avgProcessingTime,
        throughput,
        errorRate,
        peakHours: ["09:00", "14:00", "16:00"], // Simulated peak hours
        trends,
      };
    };

    let metrics: QueueMetrics[] = [];

    if (queue === "all") {
      metrics = [
        generateMetrics("ai:incoming-message", "AI Incoming Messages"),
        generateMetrics("ai:embedding-upsert", "AI Embedding Upsert"),
      ];
    } else {
      const displayNames = {
        "ai:incoming-message": "AI Incoming Messages",
        "ai:embedding-upsert": "AI Embedding Upsert",
      };
      const displayName = displayNames[queue as keyof typeof displayNames];
      if (displayName) {
        metrics = [generateMetrics(queue, displayName)];
      }
    }

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("Error fetching queue metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue metrics" },
      { status: 500 }
    );
  }
}