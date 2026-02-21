import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { handleExpiringTokensNotification } from "@/worker/cron-jobs";

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
				id: session.user.id,
			},
		});

		if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPERADMIN") {
			return new NextResponse("Acesso negado", { status: 403 });
		}

		// Executar verificação diretamente (sem fila BullMQ — queue zombie removida)
		const result = await handleExpiringTokensNotification();

		return NextResponse.json({
			success: true,
			message: `Verificação concluída: ${result.count} contas com tokens expirando encontradas.`,
		});
	} catch (error) {
		console.error("[ADMIN_CHECK_EXPIRING_TOKENS]", error);
		return new NextResponse("Erro interno", { status: 500 });
	}
}
