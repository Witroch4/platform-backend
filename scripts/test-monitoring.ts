#!/usr/bin/env tsx

/**
 * Script para testar o sistema de monitoramento
 *
 * Uso:
 * npx tsx scripts/test-monitoring.ts
 * npx tsx scripts/test-monitoring.ts --queues
 * npx tsx scripts/test-monitoring.ts --health
 * npx tsx scripts/test-monitoring.ts --alerts
 */

import { initializeMonitoring, performHealthCheck, getMonitoringStatus } from "../lib/monitoring/init-monitoring";
import { getQueueDashboard, getQueueHealth, getQueuePerformanceStats } from "../lib/monitoring/queue-monitor";
import { apm } from "../lib/monitoring/application-performance-monitor";

async function testMonitoring() {
	console.log("🔍 Testando Sistema de Monitoramento do Socialwise Chatwit\n");

	try {
		// 1. Inicializar monitoramento
		console.log("1️⃣ Inicializando sistema de monitoramento...");
		await initializeMonitoring();
		console.log("✅ Monitoramento inicializado com sucesso\n");

		// 2. Verificar status
		console.log("2️⃣ Verificando status do monitoramento...");
		const status = getMonitoringStatus();
		console.log("Status:", {
			inicializado: status.initialized,
			uptime: `${Math.round(status.uptime)}s`,
			versao: status.version,
		});
		console.log("");

		// 3. Health check completo
		console.log("3️⃣ Realizando health check completo...");
		const healthCheck = await performHealthCheck();
		console.log(`Status geral: ${healthCheck.status.toUpperCase()}`);
		console.log("Componentes:");

		Object.entries(healthCheck.components).forEach(([component, status]) => {
			const emoji = status.status === "healthy" ? "✅" : status.status === "degraded" ? "⚠️" : "❌";
			console.log(`  ${emoji} ${component}: ${status.status} - ${status.message}`);
		});
		console.log("");

		// 4. Dashboard das filas
		console.log("4️⃣ Verificando filas...");
		const queueDashboard = getQueueDashboard();
		console.log(`Total de filas: ${queueDashboard.overview.totalQueues}`);
		console.log(`Total de jobs: ${queueDashboard.overview.totalJobs}`);
		console.log(`Jobs ativos: ${queueDashboard.overview.activeJobs}`);
		console.log(`Jobs que falharam: ${queueDashboard.overview.failedJobs}`);
		console.log("");

		// Detalhes de cada fila
		if (queueDashboard.queues.length > 0) {
			console.log("Detalhes das filas:");
			queueDashboard.queues.forEach((queue) => {
				const health = queue.health;
				const status = health.paused ? "⏸️" : health.failed > 0 ? "⚠️" : "✅";

				console.log(`  ${status} ${queue.name}:`);
				console.log(`    - Aguardando: ${health.waiting}`);
				console.log(`    - Ativos: ${health.active}`);
				console.log(`    - Completados: ${health.completed}`);
				console.log(`    - Falharam: ${health.failed}`);
				console.log(`    - Atrasados: ${health.delayed}`);
				console.log(`    - Pausada: ${health.paused}`);

				if (queue.performance) {
					const perf = queue.performance;
					console.log(`    - Jobs/min: ${perf.throughput.jobsPerMinute.toFixed(1)}`);
					console.log(`    - Tempo médio: ${perf.averageProcessingTime.toFixed(0)}ms`);
					console.log(`    - Taxa sucesso: ${perf.successRate.toFixed(1)}%`);
				}
				console.log("");
			});
		} else {
			console.log("❌ Nenhuma fila encontrada no monitoramento");
			console.log("💡 Dica: Registre suas filas com registerQueueForMonitoring()");
			console.log("");
		}

		// 5. Alertas ativos
		console.log("5️⃣ Verificando alertas ativos...");
		const activeAlerts = apm.getActiveAlerts();

		if (activeAlerts.length > 0) {
			console.log(`Encontrados ${activeAlerts.length} alertas ativos:`);
			activeAlerts.forEach((alert) => {
				const emoji =
					alert.level === "critical" ? "🚨" : alert.level === "error" ? "❌" : alert.level === "warning" ? "⚠️" : "ℹ️";
				console.log(`  ${emoji} [${alert.level.toUpperCase()}] ${alert.component}: ${alert.message}`);
			});
		} else {
			console.log("✅ Nenhum alerta ativo");
		}
		console.log("");

		// 6. Performance summary
		console.log("6️⃣ Resumo de performance...");
		const performanceSummary = await apm.getPerformanceSummary();

		console.log("Webhook:");
		console.log(`  - Tempo médio resposta: ${performanceSummary.webhook.avgResponseTime.toFixed(0)}ms`);
		console.log(`  - Taxa de sucesso: ${performanceSummary.webhook.successRate.toFixed(1)}%`);
		console.log(`  - Total de requests: ${performanceSummary.webhook.totalRequests}`);

		console.log("Worker:");
		console.log(`  - Tempo médio processamento: ${performanceSummary.worker.avgProcessingTime.toFixed(0)}ms`);
		console.log(`  - Taxa de sucesso: ${performanceSummary.worker.successRate.toFixed(1)}%`);
		console.log(`  - Total de jobs: ${performanceSummary.worker.totalJobs}`);

		console.log("Alertas:");
		console.log(`  - Total: ${performanceSummary.alerts.total}`);
		Object.entries(performanceSummary.alerts.byLevel).forEach(([level, count]) => {
			if (count > 0) {
				console.log(`  - ${level}: ${count}`);
			}
		});
		console.log("");

		console.log("🎉 Teste de monitoramento concluído com sucesso!");
		console.log("");
		console.log("💡 Dicas:");
		console.log("  - Use as APIs REST para monitoramento em tempo real");
		console.log("  - Configure alertas para notificações automáticas");
		console.log("  - Monitore regularmente as métricas de performance");
	} catch (error) {
		console.error("❌ Erro durante o teste de monitoramento:", error);
		process.exit(1);
	}
}

// Função para testar apenas filas
async function testQueues() {
	console.log("🔍 Testando Monitoramento de Filas\n");

	try {
		const dashboard = getQueueDashboard();

		console.log("📊 Dashboard das Filas:");
		console.log(`Total de filas: ${dashboard.overview.totalQueues}`);
		console.log(`Total de jobs: ${dashboard.overview.totalJobs}`);
		console.log(`Jobs ativos: ${dashboard.overview.activeJobs}`);
		console.log(`Jobs que falharam: ${dashboard.overview.failedJobs}`);
		console.log("");

		if (dashboard.queues.length > 0) {
			console.log("📋 Detalhes por Fila:");
			dashboard.queues.forEach((queue) => {
				const health = queue.health;
				console.log(`\n🔸 ${queue.name}:`);
				console.log(`   Aguardando: ${health.waiting}`);
				console.log(`   Ativos: ${health.active}`);
				console.log(`   Completados: ${health.completed}`);
				console.log(`   Falharam: ${health.failed}`);
				console.log(`   Atrasados: ${health.delayed}`);
				console.log(`   Pausada: ${health.paused ? "Sim" : "Não"}`);

				if (queue.performance) {
					const perf = queue.performance;
					console.log(`   Performance (última hora):`);
					console.log(`     Jobs/min: ${perf.throughput.jobsPerMinute.toFixed(1)}`);
					console.log(`     Tempo médio: ${perf.averageProcessingTime.toFixed(0)}ms`);
					console.log(`     Taxa sucesso: ${perf.successRate.toFixed(1)}%`);
				}
			});
		} else {
			console.log("❌ Nenhuma fila registrada para monitoramento");
		}
	} catch (error) {
		console.error("❌ Erro ao testar filas:", error);
	}
}

// Função para testar apenas health check
async function testHealthCheck() {
	console.log("🔍 Testando Health Check\n");

	try {
		const healthCheck = await performHealthCheck();

		console.log(`🏥 Status Geral: ${healthCheck.status.toUpperCase()}`);
		console.log(`⏰ Timestamp: ${healthCheck.timestamp}`);
		console.log("");

		console.log("🔧 Componentes:");
		Object.entries(healthCheck.components).forEach(([component, status]) => {
			const emoji = status.status === "healthy" ? "✅" : status.status === "degraded" ? "⚠️" : "❌";
			console.log(`  ${emoji} ${component}:`);
			console.log(`    Status: ${status.status}`);
			console.log(`    Mensagem: ${status.message}`);
			if (status.latency) {
				console.log(`    Latência: ${status.latency}ms`);
			}
			console.log("");
		});
	} catch (error) {
		console.error("❌ Erro ao realizar health check:", error);
	}
}

// Função para testar apenas alertas
async function testAlerts() {
	console.log("🔍 Testando Alertas\n");

	try {
		const activeAlerts = apm.getActiveAlerts();

		if (activeAlerts.length > 0) {
			console.log(`🚨 ${activeAlerts.length} Alertas Ativos:\n`);

			activeAlerts.forEach((alert, index) => {
				const emoji =
					alert.level === "critical" ? "🚨" : alert.level === "error" ? "❌" : alert.level === "warning" ? "⚠️" : "ℹ️";
				console.log(`${index + 1}. ${emoji} [${alert.level.toUpperCase()}]`);
				console.log(`   Componente: ${alert.component}`);
				console.log(`   Mensagem: ${alert.message}`);
				console.log(`   Timestamp: ${alert.timestamp.toISOString()}`);
				if (alert.metrics) {
					console.log(`   Métricas: ${JSON.stringify(alert.metrics, null, 2)}`);
				}
				console.log("");
			});
		} else {
			console.log("✅ Nenhum alerta ativo no momento");
		}
	} catch (error) {
		console.error("❌ Erro ao verificar alertas:", error);
	}
}

// Main function
async function main() {
	const args = process.argv.slice(2);

	if (args.includes("--queues")) {
		await testQueues();
	} else if (args.includes("--health")) {
		await testHealthCheck();
	} else if (args.includes("--alerts")) {
		await testAlerts();
	} else {
		await testMonitoring();
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	main().catch(console.error);
}
