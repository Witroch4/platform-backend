import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { QueueManagerService } from "@/lib/queue-management/services/queue-manager.service";

export async function GET(request: NextRequest) {
  try {
    // Verificação de autenticação e autorização
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode acessar." },
        { status: 403 }
      );
    }

    const queueManager = QueueManagerService.getInstance();
    const queuesHealth = await queueManager.getAllQueuesHealth();

    // Transformar os dados para o formato esperado pelo frontend
    const queuesStatus = Object.entries(queuesHealth).map(([name, health]) => ({
      name,
      status: health.isPaused ? "paused" : (health.isHealthy ? "active" : "error"),
      waiting: health.waiting || 0,
      active: health.active || 0,
      completed: health.completed || 0,
      failed: health.failed || 0,
      delayed: health.delayed || 0,
    }));

    return NextResponse.json(queuesStatus);
  } catch (error) {
    console.error("Erro ao buscar status das filas:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}