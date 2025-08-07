import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { FeatureFlagManager } from "@/lib/feature-flags/feature-flag-manager";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prisma = getPrismaInstance();
    const redis = getRedisInstance();
    const flagManager = FeatureFlagManager.getInstance(prisma, redis);

    // Verificar se a Flash Intent está ativa globalmente
    // Isso é determinado pela combinação de várias feature flags
    const [
      newWebhookProcessing,
      highPriorityQueue,
      lowPriorityQueue,
      unifiedLeadModel,
      intelligentCaching,
      applicationMonitoring,
    ] = await Promise.all([
      flagManager.isEnabled("NEW_WEBHOOK_PROCESSING"),
      flagManager.isEnabled("HIGH_PRIORITY_QUEUE"),
      flagManager.isEnabled("LOW_PRIORITY_QUEUE"),
      flagManager.isEnabled("UNIFIED_LEAD_MODEL"),
      flagManager.isEnabled("INTELLIGENT_CACHING"),
      flagManager.isEnabled("APPLICATION_MONITORING"),
    ]);

    // Flash Intent está ativa se todas as funcionalidades principais estão ativas
    const flashIntentGloballyEnabled = 
      newWebhookProcessing &&
      highPriorityQueue &&
      lowPriorityQueue &&
      unifiedLeadModel &&
      intelligentCaching &&
      applicationMonitoring;

    return NextResponse.json({
      enabled: flashIntentGloballyEnabled,
      components: {
        newWebhookProcessing,
        highPriorityQueue,
        lowPriorityQueue,
        unifiedLeadModel,
        intelligentCaching,
        applicationMonitoring,
      },
    });

  } catch (error) {
    console.error("Erro ao verificar status global:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}