import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { QueueManagerService } from "@/lib/queue-management/services/queue-manager.service";
import { AuditLogService } from "@/lib/services/audit-log.service";

interface RouteParams {
  params: {
    queueName: string;
    action: string;
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Verificação de autenticação e autorização
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode executar ações nas filas." },
        { status: 403 }
      );
    }

    const { queueName, action } = params;
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
    console.error(`Erro ao executar ação ${params.action} na fila ${params.queueName}:`, error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}