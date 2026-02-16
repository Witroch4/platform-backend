import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

// POST: Enviar notificação para usuários com tokens expirando
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

		// Obter o parâmetro de dias
		const url = new URL(req.url);
		const daysParam = url.searchParams.get("days");
		const days = daysParam ? Number.parseInt(daysParam, 10) : 10; // Padrão: 10 dias

		if (isNaN(days) || days <= 0) {
			return NextResponse.json(
				{
					success: false,
					count: 0,
					message: "O parâmetro 'days' deve ser um número positivo",
				},
				{ status: 400 },
			);
		}

		// Calcular o timestamp para verificar tokens expirando
		const now = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
		const expiryThreshold = now + days * 24 * 60 * 60; // Timestamp para X dias no futuro

		// Buscar usuários com contas do Instagram cujos tokens expiram em menos de X dias
		const usersWithExpiringTokens = await getPrismaInstance().user.findMany({
			where: {
				accounts: {
					some: {
						provider: "instagram",
						expires_at: {
							not: null,
							gt: now, // Token ainda não expirou
							lte: expiryThreshold, // Mas expirará em X dias ou menos
						},
					},
				},
			},
			include: {
				accounts: {
					where: {
						provider: "instagram",
						expires_at: {
							not: null,
							gt: now,
							lte: expiryThreshold,
						},
					},
					select: {
						id: true,
						providerAccountId: true,
						igUsername: true,
						expires_at: true,
					},
				},
			},
		});

		if (usersWithExpiringTokens.length === 0) {
			return NextResponse.json({
				success: true,
				count: 0,
				message: `Nenhum usuário com tokens expirando em ${days} dias encontrado`,
			});
		}

		// Criar notificações para cada usuário com tokens expirando
		const notifications = [];

		for (const user of usersWithExpiringTokens) {
			for (const account of user.accounts) {
				const expiryDate = new Date(account.expires_at! * 1000);
				const formattedDate = expiryDate.toLocaleDateString("pt-BR");
				const daysUntilExpiry = Math.ceil((account.expires_at! - now) / (24 * 60 * 60));

				const title =
					days <= 3
						? `URGENTE: Token do Instagram expirando em ${daysUntilExpiry} dias`
						: `Token do Instagram expirando em ${daysUntilExpiry} dias`;

				const message =
					days <= 3
						? `Atenção! O token de acesso da sua conta do Instagram ${account.igUsername ? `@${account.igUsername}` : account.providerAccountId} expirará em ${daysUntilExpiry} dias (${formattedDate}). É URGENTE que você faça login novamente para renovar o token, caso contrário suas automações deixarão de funcionar.`
						: `O token de acesso da sua conta do Instagram ${account.igUsername ? `@${account.igUsername}` : account.providerAccountId} expirará em ${daysUntilExpiry} dias (${formattedDate}). Por favor, faça login novamente para renovar o token e garantir que suas automações continuem funcionando.`;

				const notification = await getPrismaInstance().notification.create({
					data: {
						userId: user.id,
						title,
						message,
					},
				});

				notifications.push(notification);
			}
		}

		return NextResponse.json({
			success: true,
			count: notifications.length,
			message: `${notifications.length} notificações de tokens expirando em ${days} dias enviadas com sucesso`,
		});
	} catch (error) {
		console.error("[ADMIN_EXPIRING_TOKENS_NOTIFICATIONS]", error);
		return NextResponse.json(
			{
				success: false,
				count: 0,
				message: `Erro ao enviar notificações de tokens expirando`,
			},
			{ status: 500 },
		);
	}
}
