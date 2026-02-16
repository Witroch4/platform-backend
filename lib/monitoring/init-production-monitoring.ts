/**
 * Inicialização do Sistema de Monitoramento de Produção
 * Configura e inicia todos os componentes de monitoramento
 */

import { ProductionMonitor } from "./production-monitor";
import { DisasterRecoveryManager } from "./disaster-recovery";

let isInitialized = false;
let monitor: ProductionMonitor | null = null;
let recoveryManager: DisasterRecoveryManager | null = null;

/**
 * Inicializa o sistema de monitoramento de produção
 */
export async function initializeProductionMonitoring(): Promise<void> {
	if (isInitialized) {
		console.log("[ProductionMonitoring] Sistema já inicializado");
		return;
	}

	try {
		console.log("[ProductionMonitoring] Inicializando sistema de monitoramento de produção...");

		// Configurações baseadas no ambiente
		const isProduction = process.env.NODE_ENV === "production";
		const config = {
			memoryThreshold: isProduction ? 85 : 90, // Mais restritivo em produção
			cpuThreshold: isProduction ? 80 : 85,
			responseTimeThreshold: isProduction ? 3000 : 5000,
			errorRateThreshold: isProduction ? 3 : 5,
			queueDepthThreshold: isProduction ? 500 : 1000,
		};

		// Inicializar monitor de produção
		monitor = ProductionMonitor.getInstance(config);
		console.log("[ProductionMonitoring] ✅ ProductionMonitor inicializado");

		// Inicializar disaster recovery manager
		recoveryManager = DisasterRecoveryManager.getInstance();
		console.log("[ProductionMonitoring] ✅ DisasterRecoveryManager inicializado");

		// Aguardar um momento para os sistemas se estabilizarem
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Executar health check inicial
		await monitor.performHealthChecks();
		console.log("[ProductionMonitoring] ✅ Health check inicial executado");

		// Executar backup inicial se em produção
		if (isProduction) {
			try {
				await monitor.performAutomaticBackup();
				console.log("[ProductionMonitoring] ✅ Backup inicial executado");
			} catch (backupError) {
				console.warn("[ProductionMonitoring] ⚠️ Erro no backup inicial:", backupError);
			}
		}

		isInitialized = true;
		console.log("[ProductionMonitoring] 🎉 Sistema de monitoramento de produção inicializado com sucesso");
	} catch (error) {
		console.error("[ProductionMonitoring] ❌ Erro ao inicializar sistema de monitoramento:", error);
		throw error;
	}
}

/**
 * Verifica se o sistema está inicializado
 */
export function isProductionMonitoringInitialized(): boolean {
	return isInitialized;
}

/**
 * Obtém instância do monitor de produção
 */
export function getProductionMonitor(): ProductionMonitor | null {
	return monitor;
}

/**
 * Obtém instância do disaster recovery manager
 */
export function getDisasterRecoveryManager(): DisasterRecoveryManager | null {
	return recoveryManager;
}

/**
 * Para o sistema de monitoramento
 */
export function stopProductionMonitoring(): void {
	if (monitor) {
		monitor.stop();
		monitor = null;
	}

	isInitialized = false;
	console.log("[ProductionMonitoring] 🛑 Sistema de monitoramento parado");
}

/**
 * Obtém status geral do sistema
 */
export function getProductionMonitoringStatus() {
	return {
		initialized: isInitialized,
		monitor: monitor ? monitor.getMonitoringStatus() : null,
		recovery: recoveryManager
			? {
					procedures: recoveryManager.getProcedures().length,
					executions: recoveryManager.getExecutions().length,
				}
			: null,
		timestamp: new Date().toISOString(),
	};
}

/**
 * Auto-inicialização em produção
 */
if (process.env.NODE_ENV === "production") {
	// Inicializar automaticamente após um delay para evitar problemas de startup
	setTimeout(() => {
		initializeProductionMonitoring().catch((error) => {
			console.error("[ProductionMonitoring] Erro na auto-inicialização:", error);
		});
	}, 10000); // 10 segundos de delay
}

// Cleanup em shutdown
process.on("SIGINT", () => {
	console.log("[ProductionMonitoring] SIGINT recebido, parando monitoramento...");
	stopProductionMonitoring();
});

process.on("SIGTERM", () => {
	console.log("[ProductionMonitoring] SIGTERM recebido, parando monitoramento...");
	stopProductionMonitoring();
});

export {
	ProductionMonitor,
	type InfrastructureAlert,
	type ConnectionHealth,
	type BackupStatus,
} from "./production-monitor";

export {
	DisasterRecoveryManager,
	type RecoveryProcedure,
	type RecoveryExecution,
} from "./disaster-recovery";

export { type RecoveryResult } from "./disaster-recovery";
