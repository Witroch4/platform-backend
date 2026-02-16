import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

/**
 * API para métricas do dashboard do Modo Turbo
 *
 * NOVA FILOSOFIA: Modo Turbo é funcionalidade core sempre disponível.
 * Esta API mostra métricas de uso e acesso, não disponibilidade do sistema.
 */
export async function GET(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Verificar se é SUPERADMIN
		const currentUser = await prisma.user.findUnique({
			where: { id: session.user.id },
		});

		if (currentUser?.role !== "ADMIN" && currentUser?.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem visualizar métricas do dashboard." },
				{ status: 403 },
			);
		}

		// Contar usuários com acesso ao Modo Turbo
		const turboEnabledUsers = await prisma.user.count({
			where: {
				turboModeEnabled: true,
			},
		});

		// Contar total de usuários
		const totalUsers = await prisma.user.count();

		// Contar usuários premium (não DEFAULT)
		const premiumUsers = await prisma.user.count({
			where: {
				role: {
					not: "DEFAULT",
				},
			},
		});

		// Simular dados de performance (em um sistema real, você buscaria de métricas reais)
		const performanceData = {
			avgResponseTime: Math.floor(Math.random() * 100) + 200, // 200-300ms
			systemLoad: Math.floor(Math.random() * 40) + 50, // 50-90%
			errorRate: Math.random() * 0.05, // 0-5%
		};

		// Simular métricas do modo turbo
		const turboMetrics = {
			totalSessions: Math.floor(Math.random() * 100) + 100,
			timeSavedMinutes: Math.floor(Math.random() * 2000) + 1000,
			avgSpeedImprovement: (Math.random() * 3 + 2).toFixed(1), // 2.0x - 5.0x
			successRate: (Math.random() * 5 + 95).toFixed(1), // 95-100%
		};

		return NextResponse.json({
			users: {
				total: totalUsers,
				turboEnabled: turboEnabledUsers,
				premium: premiumUsers,
			},
			performance: performanceData,
			turboMetrics: {
				...turboMetrics,
				totalUsers,
				turboEnabledUsers,
				avgSpeedImprovement: parseFloat(turboMetrics.avgSpeedImprovement),
				successRate: parseFloat(turboMetrics.successRate),
			},
		});
	} catch (error) {
		console.error("Erro ao buscar métricas do dashboard:", error);
		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}
