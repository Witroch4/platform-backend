import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Schema de validação para atualização de orçamento
const updateBudgetSchema = z.object({
	name: z.string().min(1, "Nome é obrigatório").optional(),
	period: z.enum(["daily", "weekly", "monthly"]).optional(),
	limitUSD: z.number().positive("Limite deve ser maior que zero").optional(),
	alertAt: z.number().min(0).max(1).optional(),
	isActive: z.boolean().optional(),
});

// GET - Buscar orçamento específico
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem visualizar orçamentos." },
				{ status: 403 },
			);
		}

		const { id } = await params;

		const budget = await prisma.costBudget.findUnique({
			where: { id },
		});

		if (!budget) {
			return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
		}

		// Calcular gastos atuais
		const currentSpending = await calculateCurrentSpending(budget);
		const spendingPercentage = currentSpending / Number(budget.limitUSD);

		const budgetWithSpending = {
			...budget,
			currentSpending,
			spendingPercentage,
			status: spendingPercentage >= 1 ? "EXCEEDED" : spendingPercentage >= Number(budget.alertAt) ? "WARNING" : "OK",
		};

		return NextResponse.json(budgetWithSpending);
	} catch (error) {
		console.error("Erro ao buscar orçamento:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// PUT - Atualizar orçamento
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem atualizar orçamentos." },
				{ status: 403 },
			);
		}

		const { id } = await params;
		const body = await request.json();
		const validatedData = updateBudgetSchema.parse(body);

		// Verificar se orçamento existe
		const existingBudget = await prisma.costBudget.findUnique({
			where: { id },
		});

		if (!existingBudget) {
			return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
		}

		// Se mudando período, verificar conflitos
		if (validatedData.period && validatedData.period !== existingBudget.period) {
			const conflictingBudget = await prisma.costBudget.findFirst({
				where: {
					id: { not: id },
					inboxId: existingBudget.inboxId,
					userId: existingBudget.userId,
					period: validatedData.period,
					isActive: true,
				},
			});

			if (conflictingBudget) {
				return NextResponse.json({ error: "Já existe um orçamento ativo para este escopo e período" }, { status: 409 });
			}
		}

		// Atualizar orçamento
		const updatedBudget = await prisma.costBudget.update({
			where: { id },
			data: validatedData,
		});

		return NextResponse.json(updatedBudget);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: "Dados inválidos", details: error.errors }, { status: 400 });
		}

		console.error("Erro ao atualizar orçamento:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// DELETE - Remover orçamento
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem remover orçamentos." },
				{ status: 403 },
			);
		}

		const { id } = await params;

		// Verificar se orçamento existe
		const existingBudget = await prisma.costBudget.findUnique({
			where: { id },
		});

		if (!existingBudget) {
			return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
		}

		// Remover orçamento
		await prisma.costBudget.delete({
			where: { id },
		});

		return NextResponse.json({ message: "Orçamento removido com sucesso" });
	} catch (error) {
		console.error("Erro ao remover orçamento:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// Função auxiliar para calcular gastos atuais (duplicada da route principal)
async function calculateCurrentSpending(budget: any): Promise<number> {
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
