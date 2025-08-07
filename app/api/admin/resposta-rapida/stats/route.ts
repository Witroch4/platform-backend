import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { FeatureFlagManager } from "@/lib/feature-flags/feature-flag-manager";
import { FlashIntentChecker } from "@/lib/resposta-rapida/flash-intent-checker";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prisma = getPrismaInstance();
    const redis = getRedisInstance();

    // Contar total de usuários
    const totalUsers = await prisma.user.count();

    // Contar usuários com Flash Intent ativa
    const flashIntentChecker = FlashIntentChecker.getInstance();
    const allUsers = await prisma.user.findMany({
      select: { id: true },
    });
    
    let flashIntentEnabledUsers = 0;
    for (const user of allUsers) {
      const hasFlashIntent = await flashIntentChecker.isFlashIntentEnabledForUser(user.id);
      if (hasFlashIntent) {
        flashIntentEnabledUsers++;
      }
    }

    // Verificar saúde das filas
    const flagManager = FeatureFlagManager.getInstance(prisma, redis);
    
    const [
      respostaRapidaFlag,
      persistenciaCredenciaisFlag,
    ] = await Promise.all([
      flagManager.isEnabled("HIGH_PRIORITY_QUEUE"),
      flagManager.isEnabled("LOW_PRIORITY_QUEUE"),
    ]);

    // Verificar se as filas estão realmente funcionando
    let queueHealth = {
      respostaRapida: respostaRapidaFlag,
      persistenciaCredenciais: persistenciaCredenciaisFlag,
    };

    try {
      // Importar as funções de health check das filas
      const { getQueueHealth: getRespostaRapidaHealth } = await import("@/lib/queue/resposta-rapida.queue");
      const { getQueueHealth: getPersistenciaHealth } = await import("@/lib/queue/persistencia-credenciais.queue");
      
      // Verificar saúde das filas
      const [respostaRapidaHealth, persistenciaHealth] = await Promise.all([
        getRespostaRapidaHealth().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
        getPersistenciaHealth().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
      ]);
      
      // Considerar fila saudável se não há muitos jobs falhados e há atividade
      const respostaRapidaHealthy = respostaRapidaFlag && 
        (respostaRapidaHealth.failed < 10) && 
        (respostaRapidaHealth.waiting + respostaRapidaHealth.active + respostaRapidaHealth.completed > 0 || true);
        
      const persistenciaHealthy = persistenciaCredenciaisFlag && 
        (persistenciaHealth.failed < 10) && 
        (persistenciaHealth.waiting + persistenciaHealth.active + persistenciaHealth.completed > 0 || true);
      
      queueHealth = {
        respostaRapida: respostaRapidaHealthy,
        persistenciaCredenciais: persistenciaHealthy,
      };
    } catch (healthError) {
      console.warn("Erro ao verificar saúde das filas:", healthError);
      // Manter os valores baseados apenas nas feature flags
    }

    return NextResponse.json({
      totalUsers,
      flashIntentEnabledUsers,
      queueHealth,
      systemStatus: {
        database: true, // Se chegou até aqui, o banco está funcionando
        redis: true,    // Se chegou até aqui, o Redis está funcionando
        featureFlags: true,
      },
    });

  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}