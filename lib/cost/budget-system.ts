/**
 * Sistema completo de orçamentos e controles de custo
 * Exporta todas as funcionalidades relacionadas a orçamentos
 */

// Monitoramento de orçamentos
export {
	checkAllBudgets,
	checkSpecificBudget,
	scheduleImmediateBudgetCheck,
	getBudgetMonitorStats,
	stopBudgetMonitoring,
	budgetQueue,
	BUDGET_MONITOR_QUEUE,
} from "./budget-monitor";

// Controles de orçamento
export {
	sendBudgetAlert,
	applyBudgetControls,
	removeBudgetControls,
	isInboxBlocked,
	isUserBlocked,
	getDowngradedModel,
	BUDGET_CONTROLS_CONFIG,
	type BudgetAlertType,
} from "./budget-controls";

// Guards de orçamento
export {
	checkBudgetLimits,
	guardOpenAIOperation,
	guardWhatsAppOperation,
	withBudgetGuard,
	logBlockedOperation,
	logModelDowngrade,
	BudgetExceededException,
	type BudgetCheckResult,
} from "./budget-guard";

// Serviço de notificações
export {
	budgetNotificationService,
	BudgetNotificationService,
	type BudgetNotificationType,
	type NotificationChannel,
	type NotificationConfig,
	type BudgetNotificationData,
} from "./notification-service";

/**
 * Inicializa todo o sistema de orçamentos
 * Deve ser chamado na inicialização do servidor
 */
export async function initializeBudgetSystem(): Promise<{
	success: boolean;
	errors: string[];
}> {
	// Budget scheduling is now handled by worker/registry.ts (centro da verdade).
	// This function is kept for API compatibility but is a no-op for scheduling.
	console.log("✅ Sistema de orçamentos inicializado (scheduling via registry)");
	return { success: true, errors: [] };
}

/**
 * Para todo o sistema de orçamentos
 * Útil para testes ou manutenção
 */
export async function shutdownBudgetSystem(): Promise<void> {
	try {
		const { stopBudgetMonitoring } = await import("./budget-monitor");
		await stopBudgetMonitoring();
		console.log("🛑 Sistema de orçamentos parado com sucesso");
	} catch (error) {
		console.error("❌ Erro ao parar sistema de orçamentos:", error);
	}
}

/**
 * Verifica saúde do sistema de orçamentos
 */
export async function checkBudgetSystemHealth(): Promise<{
	healthy: boolean;
	details: Record<string, any>;
}> {
	try {
		const { getBudgetMonitorStats } = await import("./budget-monitor");
		const stats = await getBudgetMonitorStats();

		const healthy = stats.failed < 5 && stats.waiting < 100;

		return {
			healthy,
			details: {
				monitorQueue: stats,
				timestamp: new Date().toISOString(),
			},
		};
	} catch (error) {
		return {
			healthy: false,
			details: {
				error: error?.toString(),
				timestamp: new Date().toISOString(),
			},
		};
	}
}
