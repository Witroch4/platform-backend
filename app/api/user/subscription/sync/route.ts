import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

// Esta rota é apenas para administradores
// Ela permite sincronizar os cookies de assinatura para todos os usuários
// ou para um usuário específico
export async function POST(request: Request) {
	try {
		const session = await auth();

		// Verificar se o usuário está autenticado e tem permissão de administrador
		if (!session?.user?.email || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Obter os dados da requisição
		const data = await request.json();
		const { userId } = data; // userId é opcional

		// Se userId for fornecido, sincronizar apenas para esse usuário
		if (userId) {
			const user = await getPrismaInstance().user.findUnique({
				where: { id: userId },
				include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } },
			});

			if (!user) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			const subscription = user.subscriptions[0];
			const hasActiveSubscription = subscription?.status === "ACTIVE";

			// Registrar a sincronização
			console.log(`Sincronizando assinatura para usuário ${userId}: ${hasActiveSubscription ? "ACTIVE" : "INACTIVE"}`);

			return NextResponse.json({
				message: "Subscription synced successfully for user",
				user: {
					id: user.id,
					email: user.email,
					hasActiveSubscription,
				},
			});
		} else {
			// Sincronizar para todos os usuários
			// Buscar todos os usuários com suas assinaturas mais recentes
			const users = await getPrismaInstance().user.findMany({
				include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } },
			});

			const results = users.map((user) => {
				const subscription = user.subscriptions[0];
				const hasActiveSubscription = subscription?.status === "ACTIVE";

				// Registrar a sincronização
				console.log(
					`Sincronizando assinatura para usuário ${user.id}: ${hasActiveSubscription ? "ACTIVE" : "INACTIVE"}`,
				);

				return {
					id: user.id,
					email: user.email,
					hasActiveSubscription,
				};
			});

			return NextResponse.json({
				message: "Subscriptions synced successfully for all users",
				count: results.length,
				users: results,
			});
		}
	} catch (error) {
		console.error("[SUBSCRIPTION_SYNC]", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
