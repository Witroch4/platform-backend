import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

// GET: Obter todas as notificações do usuário atual
export async function GET() {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return new NextResponse("Não autorizado", { status: 401 });
		}

		// Buscar notificações do usuário, ordenadas por data de criação (mais recentes primeiro)
		const notifications = await getPrismaInstance().notification.findMany({
			where: {
				userId: session.user.id,
			},
			orderBy: {
				createdAt: "desc",
			},
			take: 20, // Limitar a 20 notificações mais recentes
		});

		return NextResponse.json({
			success: true,
			notifications,
		});
	} catch (error) {
		console.error("[NOTIFICATIONS_GET]", error);
		return new NextResponse("Erro interno", { status: 500 });
	}
}

// POST: Marcar notificação como lida
export async function POST(req: Request) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return new NextResponse("Não autorizado", { status: 401 });
		}

		const body = await req.json();
		const { notificationId } = body;

		if (!notificationId) {
			return new NextResponse("ID da notificação é obrigatório", { status: 400 });
		}

		// Verificar se a notificação pertence ao usuário
		const notification = await getPrismaInstance().notification.findUnique({
			where: {
				id: notificationId,
				userId: session.user.id,
			},
		});

		if (!notification) {
			return new NextResponse("Notificação não encontrada", { status: 404 });
		}

		// Atualizar notificação para lida
		const updatedNotification = await getPrismaInstance().notification.update({
			where: {
				id: notificationId,
			},
			data: {
				isRead: true,
			},
		});

		return NextResponse.json(updatedNotification);
	} catch (error) {
		console.error("[NOTIFICATION_MARK_READ]", error);
		return new NextResponse("Erro interno", { status: 500 });
	}
}
