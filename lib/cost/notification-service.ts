import { CostBudget } from "@prisma/client";
import { sendBudgetAlertEmail } from "@/lib/mail";
import { getRedisInstance } from "@/lib/connections";

const redis = getRedisInstance();

/**
 * Tipos de notificação de orçamento
 */
export type BudgetNotificationType = "WARNING" | "EXCEEDED" | "CRITICAL";

/**
 * Canais de notificação disponíveis
 */
export type NotificationChannel = "email" | "webhook" | "dashboard";

/**
 * Configuração de notificação
 */
export interface NotificationConfig {
	channels: NotificationChannel[];
	webhookUrl?: string;
	emailRecipients?: string[];
	cooldownMinutes?: number;
}

/**
 * Dados da notificação de orçamento
 */
export interface BudgetNotificationData {
	budgetId: string;
	budgetName: string;
	currentSpending: number;
	limitUSD: number;
	percentage: number;
	period: string;
	inboxId?: string;
	userId?: string;
	type: BudgetNotificationType;
	timestamp: string;
	actions?: string[];
}

/**
 * Serviço principal de notificações de orçamento
 */
export class BudgetNotificationService {
	private static instance: BudgetNotificationService;

	public static getInstance(): BudgetNotificationService {
		if (!BudgetNotificationService.instance) {
			BudgetNotificationService.instance = new BudgetNotificationService();
		}
		return BudgetNotificationService.instance;
	}

	/**
	 * Envia notificação de orçamento através de múltiplos canais
	 */
	async sendBudgetNotification(
		budget: CostBudget,
		notificationData: BudgetNotificationData,
		config: NotificationConfig = { channels: ["email"] },
	): Promise<{
		success: boolean;
		channels: Record<NotificationChannel, boolean>;
		errors: string[];
	}> {
		const results = {
			success: false,
			channels: {} as Record<NotificationChannel, boolean>,
			errors: [] as string[],
		};

		// Verificar cooldown
		const cooldownKey = `budget:notification:cooldown:${budget.id}:${notificationData.type}`;
		const cooldownMinutes = config.cooldownMinutes || 30;

		const lastNotification = await redis.get(cooldownKey);
		if (lastNotification) {
			results.errors.push(`Notificação em cooldown (${cooldownMinutes} minutos)`);
			return results;
		}

		// Enviar através de cada canal configurado
		for (const channel of config.channels) {
			try {
				let channelSuccess = false;

				switch (channel) {
					case "email":
						channelSuccess = await this.sendEmailNotification(notificationData, config);
						break;
					case "webhook":
						channelSuccess = await this.sendWebhookNotification(notificationData, config);
						break;
					case "dashboard":
						channelSuccess = await this.sendDashboardNotification(notificationData);
						break;
				}

				results.channels[channel] = channelSuccess;
				if (channelSuccess) {
					results.success = true;
				}
			} catch (error) {
				results.channels[channel] = false;
				results.errors.push(`Erro no canal ${channel}: ${error}`);
			}
		}

		// Definir cooldown se pelo menos um canal foi bem-sucedido
		if (results.success) {
			await redis.setex(cooldownKey, cooldownMinutes * 60, new Date().toISOString());
		}

		return results;
	}

	/**
	 * Envia notificação por email
	 */
	private async sendEmailNotification(data: BudgetNotificationData, config: NotificationConfig): Promise<boolean> {
		try {
			const recipients = config.emailRecipients || (await this.getDefaultEmailRecipients());

			if (recipients.length === 0) {
				console.warn("⚠️ Nenhum destinatário de email configurado para alertas de orçamento");
				return false;
			}

			const emailPromises = recipients.map((recipient) =>
				sendBudgetAlertEmail(
					recipient,
					data.budgetName,
					data.currentSpending,
					data.limitUSD,
					data.percentage,
					data.type === "EXCEEDED" || data.type === "CRITICAL" ? "EXCEEDED" : "WARNING",
				),
			);

			await Promise.all(emailPromises);
			console.log(`📧 Notificação de orçamento enviada por email para ${recipients.length} destinatários`);
			return true;
		} catch (error) {
			console.error("❌ Erro ao enviar notificação por email:", error);
			return false;
		}
	}

	/**
	 * Envia notificação via webhook
	 */
	private async sendWebhookNotification(data: BudgetNotificationData, config: NotificationConfig): Promise<boolean> {
		try {
			if (!config.webhookUrl) {
				console.warn("⚠️ URL do webhook não configurada");
				return false;
			}

			const payload = {
				event: "budget_alert",
				data,
				timestamp: new Date().toISOString(),
			};

			const response = await fetch(config.webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "Socialwise-Budget-Monitor/1.0",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`Webhook retornou status ${response.status}`);
			}

			console.log(`🔗 Notificação de orçamento enviada via webhook: ${config.webhookUrl}`);
			return true;
		} catch (error) {
			console.error("❌ Erro ao enviar notificação via webhook:", error);
			return false;
		}
	}

	/**
	 * Envia notificação para o dashboard (via Redis pub/sub)
	 */
	private async sendDashboardNotification(data: BudgetNotificationData): Promise<boolean> {
		try {
			const notification = {
				id: `budget-${data.budgetId}-${Date.now()}`,
				type: "budget_alert",
				severity: this.getSeverityLevel(data.type),
				title: this.getNotificationTitle(data),
				message: this.getNotificationMessage(data),
				data,
				timestamp: new Date().toISOString(),
				read: false,
			};

			// Publicar no canal de notificações do dashboard
			await redis.publish("dashboard:notifications", JSON.stringify(notification));

			// Armazenar para recuperação posterior
			const notificationKey = `dashboard:notifications:${notification.id}`;
			await redis.setex(notificationKey, 24 * 60 * 60, JSON.stringify(notification)); // 24h TTL

			console.log(`📊 Notificação de orçamento enviada para o dashboard`);
			return true;
		} catch (error) {
			console.error("❌ Erro ao enviar notificação para o dashboard:", error);
			return false;
		}
	}

	/**
	 * Obtém destinatários de email padrão
	 */
	private async getDefaultEmailRecipients(): Promise<string[]> {
		const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];
		const budgetAlertEmails = process.env.BUDGET_ALERT_EMAILS?.split(",") || [];

		const allEmails = [...adminEmails, ...budgetAlertEmails]
			.map((email) => email.trim())
			.filter((email) => email.length > 0);

		return [...new Set(allEmails)]; // Remove duplicatas
	}

	/**
	 * Determina o nível de severidade
	 */
	private getSeverityLevel(type: BudgetNotificationType): "info" | "warning" | "error" {
		switch (type) {
			case "WARNING":
				return "warning";
			case "EXCEEDED":
			case "CRITICAL":
				return "error";
			default:
				return "info";
		}
	}

	/**
	 * Gera título da notificação
	 */
	private getNotificationTitle(data: BudgetNotificationData): string {
		switch (data.type) {
			case "WARNING":
				return `⚠️ Alerta de Orçamento: ${data.budgetName}`;
			case "EXCEEDED":
				return `🚨 Orçamento Excedido: ${data.budgetName}`;
			case "CRITICAL":
				return `🔴 Orçamento Crítico: ${data.budgetName}`;
			default:
				return `📊 Notificação de Orçamento: ${data.budgetName}`;
		}
	}

	/**
	 * Gera mensagem da notificação
	 */
	private getNotificationMessage(data: BudgetNotificationData): string {
		const percentage = (data.percentage * 100).toFixed(1);
		const spending = data.currentSpending.toFixed(2);
		const limit = data.limitUSD.toFixed(2);

		switch (data.type) {
			case "WARNING":
				return `Orçamento atingiu ${percentage}% do limite ($${spending}/$${limit} USD)`;
			case "EXCEEDED":
				return `Orçamento excedido em ${percentage}% ($${spending}/$${limit} USD). Controles aplicados.`;
			case "CRITICAL":
				return `Orçamento crítico em ${percentage}% ($${spending}/$${limit} USD). Bloqueio total ativo.`;
			default:
				return `Gasto atual: $${spending}/$${limit} USD (${percentage}%)`;
		}
	}

	/**
	 * Obtém histórico de notificações de um orçamento
	 */
	async getNotificationHistory(budgetId: string, limit: number = 10): Promise<any[]> {
		try {
			const pattern = `dashboard:notifications:budget-${budgetId}-*`;
			const keys = await redis.keys(pattern);

			if (keys.length === 0) {
				return [];
			}

			const notifications = await redis.mget(...keys);
			const parsed = notifications
				.filter((n: string | null) => n !== null)
				.map((n: string) => JSON.parse(n))
				.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
				.slice(0, limit);

			return parsed;
		} catch (error) {
			console.error("❌ Erro ao buscar histórico de notificações:", error);
			return [];
		}
	}

	/**
	 * Limpa notificações antigas
	 */
	async cleanupOldNotifications(olderThanDays: number = 7): Promise<number> {
		try {
			const pattern = "dashboard:notifications:budget-*";
			const keys = await redis.keys(pattern);

			if (keys.length === 0) {
				return 0;
			}

			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

			let deletedCount = 0;
			const notifications = await redis.mget(...keys);

			for (let i = 0; i < keys.length; i++) {
				const notification = notifications[i];
				if (notification) {
					const parsed = JSON.parse(notification);
					const notificationDate = new Date(parsed.timestamp);

					if (notificationDate < cutoffDate) {
						await redis.del(keys[i]);
						deletedCount++;
					}
				}
			}

			console.log(`🧹 Limpeza de notificações: ${deletedCount} notificações antigas removidas`);
			return deletedCount;
		} catch (error) {
			console.error("❌ Erro na limpeza de notificações:", error);
			return 0;
		}
	}
}

// Exportar instância singleton
export const budgetNotificationService = BudgetNotificationService.getInstance();
