import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteAgendamento } from "@/lib/agendamento.service";

/**
 * Handler para DELETE em /api/[accountid]/agendar/delete/[id]
 * Exclui um agendamento específico pelo ID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string; id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { accountid, id } = await params;
    if (!accountid || !id) {
      return NextResponse.json(
        { error: "Parâmetros inválidos." },
        { status: 400 }
      );
    }

    console.log(`[Agendar] Excluindo agendamento com ID: ${id}`);

    // Verifica se a conta pertence ao usuário
    const account = await prisma.account.findFirst({
      where: {
        providerAccountId: accountid,
        userId: session.user.id,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada ou não pertence ao usuário." },
        { status: 404 }
      );
    }

    // Verifica se o agendamento existe e pertence ao usuário
    const agendamento = await prisma.agendamento.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!agendamento) {
      return NextResponse.json(
        { error: "Agendamento não encontrado ou não pertence ao usuário." },
        { status: 404 }
      );
    }

    // Exclui o agendamento
    await deleteAgendamento(id);

    return NextResponse.json({
      message: "Agendamento excluído com sucesso.",
    });
  } catch (error: any) {
    console.error("[Agendar] Erro ao excluir agendamento:", error);
    return NextResponse.json(
      { error: "Erro ao excluir agendamento", details: error.message },
      { status: 500 }
    );
  }
}