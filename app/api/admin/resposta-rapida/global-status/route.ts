import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { FeatureFlagManager } from "@/lib/feature-flags/feature-flag-manager";
import { isFlashIntentGloballyEnabledFallback } from "@/lib/resposta-rapida/fallback-feature-flags";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
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
        flagManager.isEnabled("NEW_WEBHOOK_PROCESSING").catch(() => false),
        flagManager.isEnabled("HIGH_PRIORITY_QUEUE").catch(() => false),
        flagManager.isEnabled("LOW_PRIORITY_QUEUE").catch(() => false),
        flagManager.isEnabled("UNIFIED_LEAD_MODEL").catch(() => false),
        flagManager.isEnabled("INTELLIGENT_CACHING").catch(() => false),
        flagManager.isEnabled("APPLICATION_MONITORING").catch(() => false),
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
      console.error("Erro ao verificar status global com FeatureFlagManager, usando fallback:", error);
      
      // Usar sistema de fallback
      const fallbackEnabled = isFlashIntentGloballyEnabledFallback();
      
      return NextResponse.json({
        enabled: fallbackEnabled,
        components: {
          newWebhookProcessing: false,
          highPriorityQueue: false,
          lowPriorityQueue: false,
          unifiedLeadModel: false,
          intelligentCaching: false,
          applicationMonitoring: false,
        },
      });
    }

  } catch (error) {
    console.error("Erro ao verificar status global:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}