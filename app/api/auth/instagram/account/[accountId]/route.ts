// app/api/auth/instagram/account/[accountId]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

export async function GET(request: NextRequest, context: any) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { params } = context; // extrai `params`
    const { accountId } = params || {};

    if (!accountId) {
      return NextResponse.json(
        { error: "ID da conta não fornecido" },
        { status: 400 }
      );
    }

    // Buscar a conta...
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

    // Cria a resposta
    const mappedAccount = {
      id: account.id,
      providerAccountId: account.providerAccountId,
      access_token: account.access_token,
      igUsername: account.igUsername || "Instagram",
      igUserId: account.igUserId || account.providerAccountId,
      isMain: account.isMain || false,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    return NextResponse.json(mappedAccount);
  } catch (error) {
    console.error("Erro ao validar conta do Instagram:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao validar a conta do Instagram" },
      { status: 500 }
    );
  }
}
