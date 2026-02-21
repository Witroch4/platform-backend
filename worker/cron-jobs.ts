/**
 * Cron Jobs — All scheduled tasks in one place.
 * Separated from BullMQ workers for clarity (crons ≠ queues).
 */

import cron from "node-cron";
import { getPrismaInstance } from "@/lib/connections";
// Track scheduled tasks for cleanup
const scheduledTasks: cron.ScheduledTask[] = [];

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Verifica tokens de acesso expirando nos próximos 7 dias e cria notificações.
 */
export async function handleExpiringTokensNotification(): Promise<{ success: boolean; count: number }> {
	try {
		console.log("[CronJobs] Verificando tokens expirando...");

		const sevenDaysFromNow = new Date();
		sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

		const expiringAccounts = await getPrismaInstance().account.findMany({
			where: {
				expires_at: {
					not: null,
					lte: Math.floor(sevenDaysFromNow.getTime() / 1000),
					gt: Math.floor(Date.now() / 1000),
				},
			},
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		console.log(`[CronJobs] Encontradas ${expiringAccounts.length} contas com tokens expirando.`);

		for (const account of expiringAccounts) {
			const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;
			if (!expiresAt) continue;

			const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

			await getPrismaInstance().notification.create({
				data: {
					userId: account.userId,
					title: "Token de Acesso Expirando",
					message: `Seu token de acesso para ${account.provider} expirará em ${daysRemaining} dias. Por favor, reconecte sua conta para evitar interrupções.`,
					isRead: false,
				},
			});

			console.log(
				`[CronJobs] Notificação criada para o usuário ${account.userId} sobre token expirando em ${daysRemaining} dias.`,
			);
		}

		return { success: true, count: expiringAccounts.length };
	} catch (error: any) {
		console.error("[CronJobs] Erro ao processar notificação de tokens expirando:", error);
		throw error;
	}
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Inicializa todos os cron jobs.
 * Chamado pelo init.ts após os workers estarem prontos.
 */
export function initCronJobs(): void {
	console.log("[CronJobs] Inicializando jobs recorrentes...");

	// Verificação diária de tokens expirando (8h UTC)
	const tokenCheck = cron.schedule("0 8 * * *", async () => {
		try {
			console.log("[CronJobs] Executando verificação diária de tokens expirando...");
			await handleExpiringTokensNotification();
			console.log("[CronJobs] ✅ Verificação de tokens concluída.");
		} catch (error) {
			console.error("[CronJobs] Erro ao verificar tokens expirando:", error);
		}
	});
	scheduledTasks.push(tokenCheck);

	console.log("[CronJobs] ✅ Jobs recorrentes inicializados (cron: diário às 8h UTC).");
}

/**
 * Para todos os cron jobs (para shutdown graceful).
 */
export function stopCronJobs(): void {
	for (const task of scheduledTasks) {
		task.stop();
	}
	scheduledTasks.length = 0;
	console.log("[CronJobs] 🛑 Cron jobs parados.");
}
