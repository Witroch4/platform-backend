import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode acessar overrides." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const flagId = searchParams.get("flagId");
    const userId = searchParams.get("userId");

    const prisma = getPrismaInstance();
    
    const whereClause: any = {};
    if (flagId) whereClause.flagId = flagId;
    if (userId) whereClause.userId = userId;

    const overrides = await prisma.userFeatureFlagOverride.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        flag: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({
      overrides: overrides.map(override => ({
        id: override.id,
        userId: override.userId,
        flagId: override.flagId,
        enabled: override.enabled,
        expiresAt: override.expiresAt?.toISOString() || null,
        createdAt: override.createdAt.toISOString(),
        updatedAt: override.updatedAt.toISOString(),
        user: override.user,
        flag: override.flag
      }))
    });

  } catch (error) {
    logger.error("Error retrieving user overrides", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode criar overrides." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { flagId, userId, enabled, expiresAt } = body;

    if (!flagId || !userId || enabled === undefined) {
      return NextResponse.json(
        { error: "flagId, userId e enabled são obrigatórios" },
        { status: 400 }
      );
    }

    const prisma = getPrismaInstance();
    
    // Check if flag and user exist
    const [flag, user] = await Promise.all([
      prisma.featureFlag.findUnique({ where: { id: flagId } }),
      prisma.user.findUnique({ where: { id: userId } })
    ]);

    if (!flag) {
      return NextResponse.json(
        { error: "Feature flag não encontrada" },
        { status: 404 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Create or update override
    const override = await prisma.userFeatureFlagOverride.upsert({
      where: {
        userId_flagId: {
          userId,
          flagId
        }
      },
      update: {
        enabled,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        updatedAt: new Date()
      },
      create: {
        userId,
        flagId,
        enabled,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: session.user.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        flag: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      }
    });

    // Update Redis cache for this user-flag combination
    try {
      const { getRedisInstance } = await import("@/lib/connections");
      const redis = getRedisInstance();
      
      const cacheKey = `user_flag:${userId}:${flag.name}`;
      await redis.setex(cacheKey, 3600, JSON.stringify({
        enabled: override.enabled,
        expiresAt: override.expiresAt?.toISOString() || null
      }));

      logger.info("User flag override cache updated", {
        userId,
        flagId,
        flagName: flag.name,
        enabled: override.enabled
      });
    } catch (redisError) {
      logger.warn("Failed to update Redis cache for user flag override", {
        userId,
        flagId,
        error: redisError instanceof Error ? redisError.message : "Unknown error"
      });
    }

    logger.info("User flag override created/updated successfully", {
      adminUserId: session.user.id,
      userId,
      flagId,
      enabled: override.enabled
    });

    return NextResponse.json({
      override: {
        id: override.id,
        userId: override.userId,
        flagId: override.flagId,
        enabled: override.enabled,
        expiresAt: override.expiresAt?.toISOString() || null,
        createdAt: override.createdAt.toISOString(),
        updatedAt: override.updatedAt.toISOString(),
        user: override.user,
        flag: override.flag
      }
    });

  } catch (error) {
    logger.error("Error creating user override", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}