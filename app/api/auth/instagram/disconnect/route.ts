import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      );
    }

    // Obter o ID da conta a ser desconectada do corpo da requisição
    const body = await request.json().catch(() => ({}));
    const accountId = body.accountId;

    // Se não for fornecido um accountId, desconectar a conta principal
    if (!accountId) {
      // Buscar a conta principal do Instagram do usuário
      const mainAccount = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: "instagram",
          isMain: true
        },
        select: {
          id: true,
          providerAccountId: true,
          isMain: true
        }
      });

      if (!mainAccount) {
        return NextResponse.json(
          { error: "Nenhuma conta principal do Instagram encontrada" },
          { status: 404 }
        );
      }

      // Excluir a conta principal
      await prisma.account.delete({
        where: {
          id: mainAccount.id
        }
      });

      return NextResponse.json({
        success: true,
        message: "Conta principal do Instagram desconectada com sucesso",
        providerAccountId: mainAccount.providerAccountId
      });
    } else {
      // Verificar se a conta pertence ao usuário usando o providerAccountId
      const account = await prisma.account.findFirst({
        where: {
          providerAccountId: accountId,
          userId: session.user.id,
          provider: "instagram"
        },
        select: {
          id: true,
          providerAccountId: true,
          isMain: true
        }
      });

      if (!account) {
        return NextResponse.json(
          { error: "Conta não encontrada ou não pertence ao usuário" },
          { status: 404 }
        );
      }

      // Excluir a conta específica
      await prisma.account.delete({
        where: {
          id: account.id
        }
      });

      return NextResponse.json({
        success: true,
        message: "Conta do Instagram desconectada com sucesso",
        providerAccountId: account.providerAccountId
      });
    }
  } catch (error) {
    console.error("Erro ao desconectar conta do Instagram:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao desconectar a conta do Instagram" },
      { status: 500 }
    );
  }
}