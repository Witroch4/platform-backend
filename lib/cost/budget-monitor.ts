import { PrismaClient, CostBudget } from "@prisma/client";
import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { sendBudgetAlert, applyBudgetControls, removeBudgetControls } from "./budget-controls";
import { costAuditLogger } from "./audit-logger";

const prisma = new PrismaClient();

// Configuração da fila de monitoramento de orçamentos
export const BUDGET_MONITOR_QUEUE = "budget-monitor";

const budgetQueue = new Queue(BUDGET_MONITOR_QUEUE, {
	connection: getRedisInstance(),
	defaultJobOptions: {
		removeOnComplete: 10,
		removeOnFail: 5,
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 2000,
		},
	},
});

// Processor function — used by worker/registry.ts (Worker created by init.ts)
export async function processBudgetJob(job: import("bullmq").Job): Promise<any> {
	const { type } = job.data;

	switch (type) {
		case "check-all-budgets":
			return await checkAllBudgets();
		case "check-specific-budget":
			return await checkSpecificBudget(job.data.budgetId);
		default:
			throw new Error(`Tipo de job desconhecido: ${type}`);
	}
}

/**
 * Agenda verificação periódica de todos os orçamentos
 * Deve ser chamado na inicialização do servidor
 */
export async function scheduleBudgetMonitoring() {
	try {
		// Remove jobs existentes para evitar duplicação
		await budgetQueue.obliterate({ force: true });

		// Agenda job recorrente a cada hora
		await budgetQueue.add(
			"check-all-budgets",
			{ type: "check-all-budgets" },
			{
				repeat: {
					pattern: "0 * * * *", // A cada hora no minuto 0
				},
				jobId: "budget-monitor-hourly", // ID fixo para evitar duplicação
			},
		);

		console.log("✅ Monitoramento de orçamentos agendado (execução a cada hora)");
		return { success: true };
	} catch (error) {
		console.error("❌ Erro ao agendar monitoramento de orçamentos:", error);
		return { success: false, error };
	}
}

/**
 * Verifica todos os orçamentos ativos
 */
export async function checkAllBudgets(): Promise<{
	checked: number;
	alerts: number;
	blocked: number;
	errors: string[];
}> {
	console.log("🔍 Iniciando verificação de todos os orçamentos...");

	const results = {
		checked: 0,
		alerts: 0,
		blocked: 0,
		errors: [] as string[],
	};

	try {
		// Buscar todos os orçamentos ativos
		const activeBudgets = await prisma.costBudget.findMany({
			where: { isActive: true },
			orderBy: { createdAt: "desc" },
		});

		console.log(`📊 Encontrados ${activeBudgets.length} orçamentos ativos para verificar`);

		// Verificar cada orçamento
		for (const budget of activeBudgets) {
			try {
				const result = await checkBudgetStatus(budget);
				results.checked++;

				if (result.alertSent) results.alerts++;
				if (result.controlsApplied) results.blocked++;
			} catch (error) {
				const errorMsg = `Erro ao verificar orçamento ${budget.id}: ${error}`;
				console.error(errorMsg);
				results.errors.push(errorMsg);
			}
		}

		console.log(
			`✅ Verificação concluída: ${results.checked} orçamentos verificados, ${results.alerts} alertas, ${results.blocked} bloqueios`,
		);
		return results;
	} catch (error) {
		console.error("❌ Erro na verificação geral de orçamentos:", error);
		results.errors.push(`Erro geral: ${error}`);
		return results;
	}
}

/**
 * Verifica um orçamento específico
 */
export async function checkSpecificBudget(budgetId: string): Promise<{
	budgetId: string;
	status: string;
	currentSpending: number;
	percentage: number;
	alertSent: boolean;
	controlsApplied: boolean;
}> {
	const budget = await prisma.costBudget.findUnique({
		where: { id: budgetId, isActive: true },
	});

	if (!budget) {
		throw new Error(`Orçamento ${budgetId} não encontrado ou inativo`);
	}

	return await checkBudgetStatus(budget);
}

/**
 * Verifica o status de um orçamento específico e aplica ações necessárias
 */
async function checkBudgetStatus(budget: CostBudget): Promise<{
	budgetId: string;
	status: string;
	currentSpending: number;
	percentage: number;
	alertSent: boolean;
	controlsApplied: boolean;
}> {
	const currentSpending = await calculateCurrentSpending(budget);
	const percentage = currentSpending / Number(budget.limitUSD);

	let status = "OK";
	let alertSent = false;
	let controlsApplied = false;

	// Determinar status baseado na porcentagem
	if (percentage >= 1.0) {
		status = "EXCEEDED";
	} else if (percentage >= Number(budget.alertAt)) {
		status = "WARNING";
	}

	console.log(
		`📊 Orçamento ${budget.name} (${budget.id}): ${(percentage * 100).toFixed(1)}% usado ($${currentSpending.toFixed(2)}/$${budget.limitUSD})`,
	);

	// Aplicar ações baseadas no status
	if (status === "EXCEEDED") {
		// Orçamento excedido - aplicar controles
		try {
			await applyBudgetControls(budget);
			controlsApplied = true;
			console.log(`🚫 Controles aplicados para orçamento ${budget.name}`);
		} catch (error) {
			console.error(`❌ Erro ao aplicar controles para orçamento ${budget.id}:`, error);
		}

		// Enviar alerta de orçamento excedido
		try {
			await sendBudgetAlert(budget, currentSpending, percentage, "EXCEEDED");
			alertSent = true;

			// Audit logging para orçamento excedido
			await costAuditLogger.logBudgetExceeded({
				budgetId: budget.id,
				name: budget.name,
				limitUSD: Number(budget.limitUSD),
				currentSpent: currentSpending,
				percentage,
				inboxId: budget.inboxId || undefined,
				userId: budget.userId || undefined,
			});
		} catch (error) {
			console.error(`❌ Erro ao enviar alerta para orçamento ${budget.id}:`, error);
		}
	} else if (status === "WARNING") {
		// Orçamento em alerta - enviar notificação
		try {
			await sendBudgetAlert(budget, currentSpending, percentage, "WARNING");
			alertSent = true;
			console.log(`⚠️ Alerta enviado para orçamento ${budget.name}`);
		} catch (error) {
			console.error(`❌ Erro ao enviar alerta para orçamento ${budget.id}:`, error);
		}

		// Remover controles se existirem (orçamento voltou ao normal)
		try {
			await removeBudgetControls(budget);
		} catch (error) {
			console.error(`❌ Erro ao remover controles para orçamento ${budget.id}:`, error);
		}
	} else {
		// Orçamento OK - remover controles se existirem
		try {
			await removeBudgetControls(budget);
		} catch (error) {
			console.error(`❌ Erro ao remover controles para orçamento ${budget.id}:`, error);
		}
	}

	return {
		budgetId: budget.id,
		status,
		currentSpending,
		percentage,
		alertSent,
		controlsApplied,
	};
}

/**
 * Calcula gastos atuais para um orçamento baseado no período
 */
async function calculateCurrentSpending(budget: CostBudget): Promise<number> {
	const now = new Date();
	let startDate: Date;

	// Calcular período baseado no tipo
	switch (budget.period) {
		case "daily":
			startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			break;
		case "weekly":
			const dayOfWeek = now.getDay();
			startDate = new Date(now);
			startDate.setDate(now.getDate() - dayOfWeek);
			startDate.setHours(0, 0, 0, 0);
			break;
		case "monthly":
			startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			break;
		default:
			startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}

	// Construir filtros para busca de eventos
	const where: any = {
		ts: { gte: startDate },
		status: "PRICED",
		cost: { not: null },
	};

	if (budget.inboxId) where.inboxId = budget.inboxId;
	if (budget.userId) where.userId = budget.userId;

	// Somar custos do período
	const result = await prisma.costEvent.aggregate({
		where,
		_sum: { cost: true },
	});

	return Number(result._sum.cost || 0);
}

/**
 * Agenda verificação imediata de um orçamento específico
 */
export async function scheduleImmediateBudgetCheck(budgetId: string): Promise<void> {
	await budgetQueue.add(
		"check-specific-budget",
		{
			type: "check-specific-budget",
			budgetId,
		},
		{
			priority: 1, // Alta prioridade para verificações imediatas
		},
	);
}

/**
 * Obtém estatísticas da fila de monitoramento
 */
export async function getBudgetMonitorStats(): Promise<{
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
}> {
	const [waiting, active, completed, failed, delayed] = await Promise.all([
		budgetQueue.getWaiting(),
		budgetQueue.getActive(),
		budgetQueue.getCompleted(),
		budgetQueue.getFailed(),
		budgetQueue.getDelayed(),
	]);

	return {
		waiting: waiting.length,
		active: active.length,
		completed: completed.length,
		failed: failed.length,
		delayed: delayed.length,
	};
}

/**
 * Para o monitoramento de orçamentos (para testes ou manutenção)
 */
export async function stopBudgetMonitoring(): Promise<void> {
	await budgetQueue.close();
	console.log("🛑 Monitoramento de orçamentos parado");
}

// Event handlers moved to worker/init.ts via attachStandardEventHandlers (registry pattern)

export { budgetQueue };
