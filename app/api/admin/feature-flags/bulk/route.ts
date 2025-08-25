import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode executar operações em lote." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { operation, flagIds, data } = body;

    if (!operation || !flagIds || !Array.isArray(flagIds)) {
      return NextResponse.json(
        { error: "operation e flagIds são obrigatórios" },
        { status: 400 }
      );
    }

    const prisma = getPrismaInstance();
    const results = [];
    const errors = [];

    // Get Redis instance for cache updates
    let redis;
    try {
      const { getRedisInstance } = await import("@/lib/connections");
      redis = getRedisInstance();
    } catch (redisError) {
      logger.warn("Redis not available for bulk operations", redisError);
    }

    switch (operation) {
      case "toggle":
        const { enabled } = data;
        if (enabled === undefined) {
          return NextResponse.json(
            { error: "enabled é obrigatório para operação toggle" },
            { status: 400 }
          );
        }

        for (const flagId of flagIds) {
          try {
            const flag = await prisma.featureFlag.findUnique({
              where: { id: flagId }
            });

            if (!flag) {
              errors.push({ flagId, error: "Feature flag não encontrada" });
              continue;
            }

            if (flag.systemCritical && !enabled) {
              errors.push({ flagId, error: "Não é possível desativar feature flags críticas" });
              continue;
            }

            const updatedFlag = await prisma.featureFlag.update({
              where: { id: flagId },
              data: { enabled, updatedAt: new Date() }
            });

            // Update Redis cache
            if (redis) {
              try {
                const cacheKey = `feature_flag:${updatedFlag.name}`;
                await redis.setex(cacheKey, 3600, JSON.stringify({
                  enabled: updatedFlag.enabled,
                  rolloutPercentage: updatedFlag.rolloutPercentage,
                  userSpecific: updatedFlag.userSpecific
                }));
              } catch (cacheError) {
                logger.warn("Failed to update cache for flag", { flagId, error: cacheError });
              }
            }

            results.push({
              flagId,
              success: true,
              flag: {
                id: updatedFlag.id,
                name: updatedFlag.name,
                enabled: updatedFlag.enabled
              }
            });

          } catch (error) {
            errors.push({
              flagId,
              error: error instanceof Error ? error.message : "Erro desconhecido"
            });
          }
        }
        break;

      case "update_rollout":
        const { rolloutPercentage } = data;
        if (rolloutPercentage === undefined || rolloutPercentage < 0 || rolloutPercentage > 100) {
          return NextResponse.json(
            { error: "rolloutPercentage deve estar entre 0 e 100" },
            { status: 400 }
          );
        }

        for (const flagId of flagIds) {
          try {
            const updatedFlag = await prisma.featureFlag.update({
              where: { id: flagId },
              data: { rolloutPercentage, updatedAt: new Date() }
            });

            // Update Redis cache
            if (redis) {
              try {
                const cacheKey = `feature_flag:${updatedFlag.name}`;
                await redis.setex(cacheKey, 3600, JSON.stringify({
                  enabled: updatedFlag.enabled,
                  rolloutPercentage: updatedFlag.rolloutPercentage,
                  userSpecific: updatedFlag.userSpecific
                }));
              } catch (cacheError) {
                logger.warn("Failed to update cache for flag", { flagId, error: cacheError });
              }
            }

            results.push({
              flagId,
              success: true,
              flag: {
                id: updatedFlag.id,
                name: updatedFlag.name,
                rolloutPercentage: updatedFlag.rolloutPercentage
              }
            });

          } catch (error) {
            errors.push({
              flagId,
              error: error instanceof Error ? error.message : "Erro desconhecido"
            });
          }
        }
        break;

      case "delete":
        for (const flagId of flagIds) {
          try {
            const flag = await prisma.featureFlag.findUnique({
              where: { id: flagId }
            });

            if (!flag) {
              errors.push({ flagId, error: "Feature flag não encontrada" });
              continue;
            }

            if (flag.systemCritical) {
              errors.push({ flagId, error: "Não é possível deletar feature flags críticas" });
              continue;
            }

            await prisma.featureFlag.delete({
              where: { id: flagId }
            });

            // Remove from Redis cache
            if (redis) {
              try {
                const cacheKey = `feature_flag:${flag.name}`;
                await redis.del(cacheKey);
              } catch (cacheError) {
                logger.warn("Failed to remove flag from cache", { flagId, error: cacheError });
              }
            }

            results.push({
              flagId,
              success: true,
              flag: {
                id: flag.id,
                name: flag.name
              }
            });

          } catch (error) {
            errors.push({
              flagId,
              error: error instanceof Error ? error.message : "Erro desconhecido"
            });
          }
        }
        break;

      case "bulk_user_overrides":
        const { userIds, overrideEnabled, expiresAt } = data;
        if (!userIds || !Array.isArray(userIds) || overrideEnabled === undefined) {
          return NextResponse.json(
            { error: "userIds e overrideEnabled são obrigatórios para operação bulk_user_overrides" },
            { status: 400 }
          );
        }

        for (const flagId of flagIds) {
          try {
            const flag = await prisma.featureFlag.findUnique({
              where: { id: flagId }
            });

            if (!flag) {
              errors.push({ flagId, error: "Feature flag não encontrada" });
              continue;
            }

            const overrideResults = [];
            for (const userId of userIds) {
              try {
                // Check if user exists
                const user = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { id: true, name: true, email: true }
                });

                if (!user) {
                  errors.push({ flagId, userId, error: "Usuário não encontrado" });
                  continue;
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
                    enabled: overrideEnabled,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                    updatedAt: new Date()
                  },
                  create: {
                    userId,
                    flagId,
                    enabled: overrideEnabled,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                    createdBy: session.user.id
                  }
                });

                // Update Redis cache for this user-flag combination
                if (redis) {
                  try {
                    const cacheKey = `user_flag:${userId}:${flag.name}`;
                    await redis.setex(cacheKey, 3600, JSON.stringify({
                      enabled: override.enabled,
                      expiresAt: override.expiresAt?.toISOString() || null
                    }));
                  } catch (cacheError) {
                    logger.warn("Failed to update user flag cache", { userId, flagId, error: cacheError });
                  }
                }

                overrideResults.push({
                  userId,
                  success: true,
                  override: {
                    id: override.id,
                    enabled: override.enabled,
                    expiresAt: override.expiresAt?.toISOString() || null
                  }
                });

              } catch (userError) {
                errors.push({
                  flagId,
                  userId,
                  error: userError instanceof Error ? userError.message : "Erro desconhecido"
                });
              }
            }

            results.push({
              flagId,
              success: true,
              flag: {
                id: flag.id,
                name: flag.name
              },
              userOverrides: overrideResults
            });

          } catch (error) {
            errors.push({
              flagId,
              error: error instanceof Error ? error.message : "Erro desconhecido"
            });
          }
        }
        break;

      default:
        return NextResponse.json(
          { error: "Operação não suportada" },
          { status: 400 }
        );
    }

    logger.info("Bulk operation completed", {
      userId: session.user.id,
      operation,
      totalFlags: flagIds.length,
      successful: results.length,
      errors: errors.length
    });

    return NextResponse.json({
      operation,
      results,
      errors,
      summary: {
        total: flagIds.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    logger.error("Error executing bulk operation", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}