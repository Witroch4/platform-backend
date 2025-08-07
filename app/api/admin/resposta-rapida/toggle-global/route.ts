import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { FeatureFlagManager } from "@/lib/feature-flags/feature-flag-manager";

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { enabled } = await request.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled é obrigatório e deve ser boolean" },
        { status: 400 }
      );
    }

    const prisma = getPrismaInstance();
    const redis = getRedisInstance();
    const flagManager = FeatureFlagManager.getInstance(prisma, redis);

    // Lista de todas as feature flags que compõem a Flash Intent
    const flashIntentFlags = [
      "NEW_WEBHOOK_PROCESSING",
      "HIGH_PRIORITY_QUEUE", 
      "LOW_PRIORITY_QUEUE",
      "UNIFIED_LEAD_MODEL",
      "INTELLIGENT_CACHING",
      "APPLICATION_MONITORING",
      "UNIFIED_PAYLOAD_EXTRACTION",
    ];

    if (enabled) {
      // Ativar todas as funcionalidades de resposta rápida globalmente
      console.log("[Flash Intent] Ativando globalmente todas as funcionalidades de resposta rápida...");
      
      await Promise.all(
        flashIntentFlags.map(flagName =>
          flagManager.setFeatureFlag(
            flagName,
            true,
            100, // 100% rollout
            {},
            session.user.id || "admin"
          )
        )
      );

      // Ativar flag específica para Flash Intent global
      await flagManager.setFeatureFlag(
        "FLASH_INTENT_GLOBAL",
        true,
        100,
        {
          activatedBy: session.user.id,
          activatedAt: new Date().toISOString(),
        },
        session.user.id || "admin"
      );

      console.log("[Flash Intent] Ativação global concluída com sucesso");
    } else {
      // Desativar todas as funcionalidades de resposta rápida globalmente
      console.log("[Flash Intent] Desativando globalmente todas as funcionalidades de resposta rápida...");
      
      await Promise.all(
        flashIntentFlags.map(flagName =>
          flagManager.setFeatureFlag(
            flagName,
            false,
            0, // 0% rollout
            {},
            session.user.id || "admin"
          )
        )
      );

      // Desativar flag específica para Flash Intent global
      await flagManager.setFeatureFlag(
        "FLASH_INTENT_GLOBAL",
        false,
        0,
        {
          deactivatedBy: session.user.id,
          deactivatedAt: new Date().toISOString(),
        },
        session.user.id || "admin"
      );

      console.log("[Flash Intent] Desativação global concluída com sucesso");
    }

    // Log da ação para auditoria
    try {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id || "unknown",
          action: enabled ? "ENABLE_FLASH_INTENT_GLOBAL" : "DISABLE_FLASH_INTENT_GLOBAL",
          resourceType: "FLASH_INTENT_GLOBAL",
          resourceId: "global",
          details: {
            enabled,
            flags: flashIntentFlags,
            timestamp: new Date().toISOString(),
            adminUser: {
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
            },
          },
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      });
    } catch (auditError) {
      console.warn("Erro ao criar log de auditoria:", auditError);
      // Não falhar a operação por causa do log
    }

    // Invalidar cache do Redis para forçar recarregamento das flags
    try {
      const keys = await redis.keys("feature_flag:*");
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (cacheError) {
      console.warn("Erro ao limpar cache de feature flags:", cacheError);
    }

    return NextResponse.json({
      success: true,
      message: enabled 
        ? "Flash Intent ativada globalmente - todas as respostas rápidas estão funcionando"
        : "Flash Intent desativada globalmente - sistema voltou ao modo padrão",
      globalFlashIntentEnabled: enabled,
      affectedFlags: flashIntentFlags,
    });

  } catch (error) {
    console.error("Erro ao alterar Flash Intent global:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}