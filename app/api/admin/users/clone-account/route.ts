import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const session = await auth();

    // Verificar se o usuário está autenticado e é administrador
    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    // Verificar se o usuário é SUPERADMIN
    const adminUser = await getPrismaInstance().user.findUnique({
      where: {
        id: session.user.id
      },
      select: {
        role: true
      }
    });

    if (adminUser?.role !== "SUPERADMIN") {
      return new NextResponse("Acesso negado. Apenas SUPERADMIN pode acessar.", { status: 403 });
    }

    // Obter dados do corpo da requisição
    const body = await req.json();
    const { sourceAccountId, targetUserId } = body;

    if (!sourceAccountId || !targetUserId) {
      return new NextResponse("ID da conta de origem e ID do usuário de destino são obrigatórios", { status: 400 });
    }

    // Verificar se a conta de origem existe
    const sourceAccount = await getPrismaInstance().account.findUnique({
      where: {
        id: sourceAccountId
      }
    });

    if (!sourceAccount) {
      return new NextResponse("Conta de origem não encontrada", { status: 404 });
    }

    // Verificar se o usuário de destino existe
    const targetUser = await getPrismaInstance().user.findUnique({
      where: {
        id: targetUserId
      }
    });

    if (!targetUser) {
      return new NextResponse("Usuário de destino não encontrado", { status: 404 });
    }

    // Gerar um novo providerAccountId único para evitar conflitos
    const uniqueId = randomUUID().substring(0, 8);
    const clonedProviderAccountId = `clone_${uniqueId}_${sourceAccount.providerAccountId}`;

    console.log(`Clonando conta: Original=${sourceAccount.providerAccountId}, Nova=${clonedProviderAccountId}`);

    // Criar uma cópia da conta para o usuário de destino
    const newAccount = await getPrismaInstance().account.create({
      data: {
        userId: targetUserId,
        type: sourceAccount.type,
        provider: sourceAccount.provider,
        providerAccountId: clonedProviderAccountId,
        refresh_token: sourceAccount.refresh_token,
        access_token: sourceAccount.access_token,
        expires_at: sourceAccount.expires_at,
        token_type: sourceAccount.token_type,
        scope: sourceAccount.scope,
        id_token: sourceAccount.id_token,
        session_state: sourceAccount.session_state,
        igUserId: sourceAccount.igUserId,
        igUsername: sourceAccount.igUsername,
        isMain: false // A conta clonada não será a principal por padrão
      }
    });

    return NextResponse.json({
      success: true,
      message: "Conta clonada com sucesso",
      account: {
        id: newAccount.id,
        provider: newAccount.provider,
        providerAccountId: newAccount.providerAccountId,
        igUsername: newAccount.igUsername,
        originalProviderAccountId: sourceAccount.providerAccountId
      }
    });
  } catch (error) {
    console.error("[CLONE_ACCOUNT]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}