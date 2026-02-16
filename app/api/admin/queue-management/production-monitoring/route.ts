/**
 * API para Monitoramento de Produção
 * Endpoints para alertas de infraestrutura, saúde das conexões e disaster recovery
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ProductionMonitor } from "@/lib/monitoring/production-monitor";
import { DisasterRecoveryManager } from "@/lib/monitoring/disaster-recovery";

// Verificar se usuário tem permissão SUPERADMIN
async function checkSuperAdminPermission() {
	const session = await auth();

	if (!session?.user) {
		return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
	}

	if (session.user.role !== "SUPERADMIN") {
		return NextResponse.json(
			{ success: false, error: "Acesso negado. Apenas SUPERADMIN pode acessar." },
			{ status: 403 },
		);
	}

	return null;
}

/**
 * GET - Obter status do monitoramento de produção
 */
export async function GET(request: NextRequest) {
	const permissionError = await checkSuperAdminPermission();
	if (permissionError) return permissionError;

	try {
		const { searchParams } = new URL(request.url);
		const component = searchParams.get("component"); // 'alerts', 'connections', 'recovery', 'status'

		const monitor = ProductionMonitor.getInstance();
		const recoveryManager = DisasterRecoveryManager.getInstance();

		switch (component) {
			case "alerts":
				const activeAlerts = monitor.getActiveAlerts();
				return NextResponse.json({
					success: true,
					data: {
						activeAlerts,
						totalAlerts: activeAlerts.length,
						criticalAlerts: activeAlerts.filter((a) => a.severity === "CRITICAL").length,
						highAlerts: activeAlerts.filter((a) => a.severity === "HIGH").length,
						mediumAlerts: activeAlerts.filter((a) => a.severity === "MEDIUM").length,
						lowAlerts: activeAlerts.filter((a) => a.severity === "LOW").length,
					},
				});

			case "connections":
				const connectionsHealth = monitor.getConnectionsHealth();
				return NextResponse.json({
					success: true,
					data: {
						connections: connectionsHealth,
						summary: {
							healthy: connectionsHealth.filter((c) => c.status === "HEALTHY").length,
							degraded: connectionsHealth.filter((c) => c.status === "DEGRADED").length,
							failed: connectionsHealth.filter((c) => c.status === "FAILED").length,
						},
					},
				});

			case "recovery":
				const procedures = recoveryManager.getProcedures();
				const executions = recoveryManager.getExecutions();
				return NextResponse.json({
					success: true,
					data: {
						procedures: procedures.map((p) => ({
							id: p.id,
							name: p.name,
							description: p.description,
							priority: p.priority,
							autoExecute: p.autoExecute,
							triggerConditions: p.triggerConditions,
							stepsCount: p.steps?.length || 0,
						})),
						recentExecutions: executions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 10),
						executionStats: {
							total: executions.length,
							running: executions.filter((e) => e.status === "RUNNING").length,
							completed: executions.filter((e) => e.status === "COMPLETED").length,
							failed: executions.filter((e) => e.status === "FAILED").length,
						},
					},
				});

			case "status":
			default:
				const monitoringStatus = monitor.getMonitoringStatus();
				const systemMetrics = monitoringStatus.systemMetrics ?? monitor.getLastSystemMetrics();
				return NextResponse.json({
					success: true,
					data: {
						monitoring: monitoringStatus,
						systemMetrics,
						alerts: {
							active: monitor.getActiveAlerts().length,
							critical: monitor.getActiveAlerts().filter((a) => a.severity === "CRITICAL").length,
						},
						connections: {
							status: monitor.getConnectionsHealth().reduce(
								(acc, conn) => {
									acc[conn.component.toLowerCase()] = conn.status;
									return acc;
								},
								{} as Record<string, string>,
							),
						},
						recovery: {
							proceduresCount: recoveryManager.getProcedures().length,
							runningExecutions: recoveryManager.getExecutions().filter((e) => e.status === "RUNNING").length,
						},
						timestamp: new Date().toISOString(),
					},
				});
		}
	} catch (error) {
		console.error("[ProductionMonitoring API] Erro ao obter dados:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Erro interno do servidor",
				details: (error as Error).message,
			},
			{ status: 500 },
		);
	}
}

/**
 * POST - Executar ações de monitoramento
 */
export async function POST(request: NextRequest) {
	const permissionError = await checkSuperAdminPermission();
	if (permissionError) return permissionError;

	try {
		const body = await request.json();
		const { action, data } = body;

		const monitor = ProductionMonitor.getInstance();
		const recoveryManager = DisasterRecoveryManager.getInstance();

		switch (action) {
			case "resolve_alert":
				if (!data.alertId) {
					return NextResponse.json({ success: false, error: "alertId é obrigatório" }, { status: 400 });
				}

				const resolved = await monitor.resolveAlert(data.alertId);
				return NextResponse.json({
					success: resolved,
					message: resolved ? "Alerta resolvido com sucesso" : "Alerta não encontrado",
				});

			case "execute_recovery":
				if (!data.procedureId) {
					return NextResponse.json({ success: false, error: "procedureId é obrigatório" }, { status: 400 });
				}

				const execution = await recoveryManager.executeProcedure(data.procedureId);
				return NextResponse.json({
					success: true,
					data: execution,
					message: "Procedimento de recuperação iniciado",
				});

			case "rollback_recovery":
				if (!data.executionId) {
					return NextResponse.json({ success: false, error: "executionId é obrigatório" }, { status: 400 });
				}

				await recoveryManager.rollbackExecution(data.executionId);
				return NextResponse.json({
					success: true,
					message: "Rollback executado com sucesso",
				});

			case "force_backup":
				const backups = await monitor.performAutomaticBackup();
				return NextResponse.json({
					success: true,
					data: backups,
					message: `Backup manual executado: ${backups.length} backups criados`,
				});

			case "health_check":
				await monitor.performHealthChecks();
				return NextResponse.json({
					success: true,
					message: "Health check executado com sucesso",
					data: {
						connections: monitor.getConnectionsHealth(),
						alerts: monitor.getActiveAlerts(),
					},
				});

			default:
				return NextResponse.json({ success: false, error: `Ação não reconhecida: ${action}` }, { status: 400 });
		}
	} catch (error) {
		console.error("[ProductionMonitoring API] Erro ao executar ação:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Erro interno do servidor",
				details: (error as Error).message,
			},
			{ status: 500 },
		);
	}
}
