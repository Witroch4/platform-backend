import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7d";

    // Calculate date range
    const now = new Date();
    const daysBack = {
      "1d": 1,
      "7d": 7,
      "30d": 30,
      "90d": 90,
    }[range] || 7;

    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Get analytics data
    const [
      totalClassifications,
      successfulMatches,
      avgProcessingTime,
      topIntents,
      confidenceDistribution,
      dailyStats,
    ] = await Promise.all([
      // Total classifications
      prisma.llmAudit.count({
        where: {
          mode: "INTENT_CLASSIFY",
          createdAt: { gte: startDate },
        },
      }),

      // Successful matches
      prisma.intentHitLog.count({
        where: {
          chosen: true,
          createdAt: { gte: startDate },
        },
      }),

      // Average processing time (simulated)
      Promise.resolve(150), // In a real implementation, this would be calculated from LlmAudit.latencyMs

      // Top performing intents
      prisma.intent.findMany({
        select: {
          id: true,
          name: true,
          usageCount: true,
          updatedAt: true,
          hitLogs: {
            where: {
              createdAt: { gte: startDate },
            },
            select: {
              similarity: true,
              chosen: true,
            },
          },
        },
        orderBy: { usageCount: "desc" },
        take: 10,
      }),

      // Confidence distribution (simulated)
      Promise.resolve([
        { range: "90-100%", count: 45 },
        { range: "80-89%", count: 32 },
        { range: "70-79%", count: 28 },
        { range: "60-69%", count: 15 },
        { range: "50-59%", count: 8 },
        { range: "0-49%", count: 12 },
      ]),

      // Daily stats (simulated)
      Promise.resolve(
        Array.from({ length: Math.min(daysBack, 30) }, (_, i) => {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const classifications = Math.floor(Math.random() * 100) + 20;
          const matches = Math.floor(classifications * (0.6 + Math.random() * 0.3));
          
          return {
            date: date.toISOString().split('T')[0],
            classifications,
            matches,
          };
        }).reverse()
      ),
    ]);

    // Process top intents data
    const processedTopIntents = topIntents.map(intent => {
      const totalHits = intent.hitLogs.length;
      const successfulMatches = intent.hitLogs.filter(log => log.chosen).length;
      const averageConfidence = totalHits > 0 
        ? intent.hitLogs.reduce((sum, log) => sum + log.similarity, 0) / totalHits
        : 0;

      return {
        intentId: intent.id,
        intentName: intent.name,
        totalHits,
        successfulMatches,
        averageConfidence,
        lastUsed: intent.updatedAt.toISOString(),
      };
    });

    const analytics = {
      totalClassifications,
      successRate: totalClassifications > 0 ? successfulMatches / totalClassifications : 0,
      averageProcessingTime: avgProcessingTime,
      topIntents: processedTopIntents,
      confidenceDistribution,
      dailyStats,
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Error fetching intent analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}