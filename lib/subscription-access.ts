// lib/subscription-access.ts
// Este arquivo é server-only (usa Prisma)
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { EXEMPTED_EMAILS, isExemptedEmail } from "@/lib/exempted-emails";

// Re-exportar para manter compatibilidade
export { isExemptedEmail };

/**
 * Verifica se o usuário tem acesso baseado em assinatura ativa ou se está na lista de exceções
 */
export async function checkSubscriptionAccess(): Promise<{
	hasAccess: boolean;
	reason: "active_subscription" | "exempted_email" | "no_access";
	userEmail?: string;
}> {
	try {
		const session = await auth();

		if (!session?.user?.email) {
			console.log("[Subscription Access] Usuário não autenticado");
			return {
				hasAccess: false,
				reason: "no_access",
			};
		}

		const userEmail = session.user.email;
		console.log(`[Subscription Access] Verificando acesso para: ${userEmail}`);

		// Verificar se o email está na lista de exceções
		if (EXEMPTED_EMAILS.includes(userEmail)) {
			console.log(`[Subscription Access] Email encontrado na lista de exceções: ${userEmail}`);
			return {
				hasAccess: true,
				reason: "exempted_email",
				userEmail,
			};
		}

		// Verificar se tem assinatura ativa
		const prisma = getPrismaInstance();
		const user = await prisma.user.findUnique({
			where: { email: userEmail },
			include: {
				subscriptions: {
					where: { status: "ACTIVE" },
					take: 1,
				},
			},
		});

		const hasActiveSubscription = Boolean(user?.subscriptions && user.subscriptions.length > 0);

		console.log(`[Subscription Access] Assinatura ativa encontrada: ${hasActiveSubscription} para ${userEmail}`);

		return {
			hasAccess: hasActiveSubscription,
			reason: hasActiveSubscription ? "active_subscription" : "no_access",
			userEmail,
		};
	} catch (error) {
		console.error("Erro ao verificar acesso de assinatura:", error);
		return {
			hasAccess: false,
			reason: "no_access",
		};
	}
}

// isExemptedEmail é re-exportado de @/lib/exempted-emails
