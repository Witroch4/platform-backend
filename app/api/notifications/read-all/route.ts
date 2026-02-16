import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

// POST: Marcar todas as notificações do usuário como lidas
export async function POST() {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return new NextResponse("Não autorizado", { status: 401 });
		}

		// Marcar todas as notificações não lidas do usuário como lidas
		await getPrismaInstance().notification.updateMany({
			where: {
				userId: session.user.id,
				isRead: false,
			},
			data: {
				isRead: true,
			},
		});

		return NextResponse.json({
			success: true,
			message: "Todas as notificações foram marcadas como lidas",
		});
	} catch (error) {
		console.error("[NOTIFICATIONS_READ_ALL]", error);
		return new NextResponse("Erro interno", { status: 500 });
	}
}
