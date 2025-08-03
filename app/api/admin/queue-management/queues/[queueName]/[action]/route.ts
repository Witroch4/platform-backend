import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { QueueManagerService } from "@/lib/queue-management/services/queue-manager.service";
import { AuditLogService } from "@/lib/services/audit-log.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ queueName: string; action: string }> }
) {
  try {
    // Verificação de autenticação e autorização
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode executar ações nas filas." },
        { status: 403 }
      );
    }

    const { queueName, action } = await params;
    const queueManager = QueueManagerService.getInstance();
    const auditLog = AuditLogService.getInstance();

    let result;
    let auditAction = "";
    let auditDetails = {};

    switch (action) {
      case "pause":
        result = await queueManager.pauseQueue(queueName);
        auditAction = "QUEUE_PAUSED";
        auditDetails = { queueName };
        break;

      case "resume":
        result = await queueManager.resumeQueue(queueName);
        auditAction = "QUEUE_RESUMED";
        auditDetails = { queueName };
        break;

      case "retry-failed":
        result = await queueManager.retryAllFailed(queueName);
        auditAction = "QUEUE_RETRY_FAILED";
        auditDetails = { queueName, retriedJobs: result };
        break;

      case "clean":
        result = await queueManager.cleanCompleted(queueName);
        auditAction = "QUEUE_CLEANED";
        auditDetails = { queueName, cleanedJobs: result };
        break;

      default:
        return NextResponse.json(
          { error: `Ação '${action}' não suportada` },
          { status: 400 }
        );
    }

    // Log da auditoria
    await auditLog.log({
      userId: session.user.id,
      action: auditAction,
      resource: "queue",
      resourceId: queueName,
      details: auditDetails,
      ipAddress: request.headers.get("x-forwarded-for") || 
                 request.headers.get("x-real-ip") || 
                 "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
    });

    return NextResponse.json({
      success: true,
      message: `Ação '${action}' executada com sucesso na fila '${queueName}'`,
      result,
    });

  } catch (error) {
    const { queueName, action } = await params;
    console.error(`Erro ao executar ação ${action} na fila ${queueName}:`, error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}