import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

// POST: Registrar manualmente uma notificação de boas-vindas para um usuário
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

		const body = await req.json();
		const { userId } = body;

		if (!userId) {
			return new NextResponse("ID do usuário é obrigatório", { status: 400 });
		}

		// Verificar se o usuário existe
		const user = await getPrismaInstance().user.findUnique({
			where: {
				id: userId,
			},
		});

		if (!user) {
			return new NextResponse("Usuário não encontrado", { status: 404 });
		}

		// Criar notificação diretamente (queue zombie removida — era deprecated)
		await getPrismaInstance().notification.create({
			data: {
				userId,
				title: "Bem-vindo ao Socialwise!",
				message: "Bem-vindo à plataforma! Configure suas integrações para começar.",
				isRead: false,
			},
		});

		return NextResponse.json({
			success: true,
			message: `Notificação de boas-vindas criada para o usuário ${userId}`,
		});
	} catch (error) {
		console.error("[ADMIN_REGISTER_WELCOME_NOTIFICATION]", error);
		return new NextResponse("Erro interno", { status: 500 });
	}
}
