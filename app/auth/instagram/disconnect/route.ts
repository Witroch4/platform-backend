//app\auth\instagram\disconnect\route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth, update } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json(
        { error: "Não autorizado. Faça login para continuar." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { accountId } = body;

    // Se não foi fornecido um ID de conta específico, desconectar a conta principal
    if (!accountId) {
      // Buscar a conta principal do Instagram
      const mainAccount = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: "instagram",
          isMain: true
        },
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
          id: mainAccount.id,
        },
      });

      // Verificar se há outras contas do Instagram
      const otherAccounts = await prisma.account.findMany({
        where: {
          userId: session.user.id,
          provider: "instagram",
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 1
      });

      // Se houver outra conta, torná-la a principal
      if (otherAccounts.length > 0) {
        const newMainAccount = otherAccounts[0];

        await prisma.account.update({
          where: {
            id: newMainAccount.id
          },
          data: {
            isMain: true
          }
        });

        // Atualizar a sessão com os dados da nova conta principal
        await update({
          user: {
            instagramAccessToken: newMainAccount.access_token || undefined,
            providerAccountId: newMainAccount.providerAccountId || undefined,
          }
        });

        return NextResponse.json({
          success: true,
          message: "Conta principal desconectada. Uma nova conta principal foi definida.",
          newMainAccountId: newMainAccount.providerAccountId
        });
      } else {
        // Se não houver outras contas, limpar os dados da sessão
        await update({
          user: {
            instagramAccessToken: undefined,
            providerAccountId: undefined,
          }
        });

        return NextResponse.json({
          success: true,
          message: "Conta principal desconectada. Não há mais contas conectadas."
        });
      }
    }

    // Verificar se a conta específica pertence ao usuário
    const account = await prisma.account.findFirst({
      where: {
        providerAccountId: accountId,
        userId: session.user.id,
        provider: "instagram",
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada ou não pertence ao usuário" },
        { status: 404 }
      );
    }

    // Verificar se é a conta principal
    const isMainAccount = account.isMain;

    // Excluir a conta
    await prisma.account.delete({
      where: {
        id: account.id,
      },
    });

    // Se era a conta principal, precisamos atualizar a sessão e possivelmente definir uma nova conta principal
    if (isMainAccount) {
      // Verificar se há outras contas do Instagram
      const otherAccounts = await prisma.account.findMany({
        where: {
          userId: session.user.id,
          provider: "instagram",
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 1
      });

      // Se houver outra conta, torná-la a principal
      if (otherAccounts.length > 0) {
        const newMainAccount = otherAccounts[0];

        await prisma.account.update({
          where: {
            id: newMainAccount.id
          },
          data: {
            isMain: true
          }
        });

        // Atualizar a sessão com os dados da nova conta principal
        await update({
          user: {
            instagramAccessToken: newMainAccount.access_token || undefined,
            providerAccountId: newMainAccount.providerAccountId || undefined,
          }
        });

        return NextResponse.json({
          success: true,
          message: "Conta desconectada. Uma nova conta principal foi definida.",
          newMainAccountId: newMainAccount.providerAccountId
        });
      } else {
        // Se não houver outras contas, limpar os dados da sessão
        await update({
          user: {
            instagramAccessToken: undefined,
            providerAccountId: undefined,
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: isMainAccount
        ? "Conta principal desconectada."
        : "Conta secundária desconectada."
    });
  } catch (error) {
    console.error("Erro ao desconectar conta do Instagram:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao desconectar a conta do Instagram" },
      { status: 500 }
    );
  }
}
