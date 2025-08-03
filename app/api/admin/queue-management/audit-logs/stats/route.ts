import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { AuditLogService } from "@/lib/services/audit-log.service";

export async function GET(request: NextRequest) {
  try {
    // Verificação de autenticação e autorização
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode acessar estatísticas de auditoria." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;

    const auditLogService = AuditLogService.getInstance();
    const stats = await auditLogService.getStats(startDate, endDate);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Erro ao buscar estatísticas de auditoria:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}