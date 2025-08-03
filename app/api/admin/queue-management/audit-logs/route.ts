import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { AuditLogService } from "@/lib/services/audit-log.service";

export async function GET(request: NextRequest) {
  try {
    // Verificação de autenticação e autorização
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode acessar logs de auditoria." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    const filter = {
      userId: searchParams.get("userId") || undefined,
      action: searchParams.get("action") || undefined,
      resource: searchParams.get("resource") || undefined,
      resourceId: searchParams.get("resourceId") || undefined,
      startDate: searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined,
      endDate: searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined,
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
    };

    const auditLogService = AuditLogService.getInstance();
    const result = await auditLogService.getLogs(filter);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erro ao buscar logs de auditoria:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}