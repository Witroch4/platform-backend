import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import { addCheckExpiringTokensJob } from "@/lib/queue/instagram-webhook.queue";

// POST: Verificar manualmente tokens expirando
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    // Verificar se o usuário é administrador
    const adminUser = await getPrismaInstance().user.findUnique({
      where: {
        id: session.user.id
      }
    });

    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPERADMIN") {
      return new NextResponse("Acesso negado", { status: 403 });
    }

    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Number.parseInt(daysParam, 10) : 10; // Padrão: 10 dias

    if (isNaN(days) || days <= 0) {
      return new NextResponse("O parâmetro 'days' deve ser um número positivo", { status: 400 });
    }

    // Adicionar job para verificar tokens expirando
    await addCheckExpiringTokensJob(days);

    return NextResponse.json({
      success: true,
      message: `Job para verificar tokens expirando em ${days} dias adicionado com sucesso`
    });
  } catch (error) {
    console.error("[ADMIN_CHECK_EXPIRING_TOKENS]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}