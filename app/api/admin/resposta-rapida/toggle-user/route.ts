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

    const { userId, enabled } = await request.json();

    if (!userId || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "userId e enabled são obrigatórios" },
        { status: 400 }
      );
    }

    const prisma = getPrismaInstance();
    const redis = getRedisInstance();
    const flagManager = FeatureFlagManager.getInstance(prisma, redis);

    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Criar ou atualizar feature flags específicas do usuário
    const userFlagPrefix = `USER_${userId}_FLASH_INTENT`;
    
    if (enabled) {
      // Ativar todas as funcionalidades de resposta rápida para este usuário
      await Promise.all([
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_WEBHOOK`,
          true,
          100,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_HIGH_PRIORITY_QUEUE`,
          true,
          100,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_LOW_PRIORITY_QUEUE`,
          true,
          100,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_UNIFIED_MODEL`,
          true,
          100,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_CACHING`,
          true,
          100,
          { userId },
          session.user.id || "admin"
        ),
      ]);

      console.log(`[Flash Intent] Ativada para usuário ${user.email} (${userId})`);
    } else {
      // Desativar todas as funcionalidades de resposta rápida para este usuário
      await Promise.all([
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_WEBHOOK`,
          false,
          0,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_HIGH_PRIORITY_QUEUE`,
          false,
          0,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_LOW_PRIORITY_QUEUE`,
          false,
          0,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_UNIFIED_MODEL`,
          false,
          0,
          { userId },
          session.user.id || "admin"
        ),
        flagManager.setFeatureFlag(
          `${userFlagPrefix}_CACHING`,
          false,
          0,
          { userId },
          session.user.id || "admin"
        ),
      ]);

      console.log(`[Flash Intent] Desativada para usuário ${user.email} (${userId})`);
    }

    // Log da ação para auditoria
    try {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id || "unknown",
          action: enabled ? "ENABLE_FLASH_INTENT" : "DISABLE_FLASH_INTENT",
          resourceType: "USER_FLASH_INTENT",
          resourceId: userId,
          details: {
            targetUser: {
              id: user.id,
              name: user.name,
              email: user.email,
            },
            enabled,
            timestamp: new Date().toISOString(),
          },
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      });
    } catch (auditError) {
      console.warn("Erro ao criar log de auditoria:", auditError);
      // Não falhar a operação por causa do log
    }

    return NextResponse.json({
      success: true,
      message: enabled 
        ? `Flash Intent ativada para ${user.name || user.email}`
        : `Flash Intent desativada para ${user.name || user.email}`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        flashIntentEnabled: enabled,
      },
    });

  } catch (error) {
    console.error("Erro ao alterar Flash Intent do usuário:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}