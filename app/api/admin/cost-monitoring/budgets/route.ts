import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Schema de validação para criação/atualização de orçamento
const budgetSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  inboxId: z.string().optional(),
  userId: z.string().optional(),
  period: z.enum(["daily", "weekly", "monthly"], {
    errorMap: () => ({ message: "Período deve ser daily, weekly ou monthly" })
  }),
  limitUSD: z.number().positive("Limite deve ser maior que zero"),
  alertAt: z.number().min(0).max(1).default(0.80), // 80% por padrão
  isActive: z.boolean().default(true)
});

// GET - Listar orçamentos
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "Acesso negado. Apenas administradores podem visualizar orçamentos." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const inboxId = searchParams.get("inboxId");
    const userId = searchParams.get("userId");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Construir filtros
    const where: any = {};
    if (inboxId) where.inboxId = inboxId;
    if (userId) where.userId = userId;
    if (isActive !== null) where.isActive = isActive === "true";

    // Buscar orçamentos com paginação
    const [budgets, total] = await Promise.all([
      prisma.costBudget.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit
      }),
      prisma.costBudget.count({ where })
    ]);

    // Calcular gastos atuais para cada orçamento
    const budgetsWithSpending = await Promise.all(
      budgets.map(async (budget) => {
        const spending = await calculateCurrentSpending(budget);
        const percentage = spending / Number(budget.limitUSD);
        
        return {
          ...budget,
          currentSpending: spending,
          spendingPercentage: percentage,
          status: percentage >= 1 ? "EXCEEDED" : 
                 percentage >= Number(budget.alertAt) ? "WARNING" : "OK"
        };
      })
    );

    return NextResponse.json({
      budgets: budgetsWithSpending,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Erro ao buscar orçamentos:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// POST - Criar novo orçamento
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "Acesso negado. Apenas administradores podem criar orçamentos." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = budgetSchema.parse(body);

    // Validar regras de negócio
    if (!validatedData.inboxId && !validatedData.userId) {
      return NextResponse.json(
        { error: "Orçamento deve ser associado a um inbox ou usuário" },
        { status: 400 }
      );
    }

    // Verificar se já existe orçamento ativo para o mesmo escopo
    const existingBudget = await prisma.costBudget.findFirst({
      where: {
        inboxId: validatedData.inboxId || null,
        userId: validatedData.userId || null,
        period: validatedData.period,
        isActive: true
      }
    });

    if (existingBudget) {
      return NextResponse.json(
        { error: "Já existe um orçamento ativo para este escopo e período" },
        { status: 409 }
      );
    }

    // Criar orçamento
    const budget = await prisma.costBudget.create({
      data: validatedData
    });

    return NextResponse.json(budget, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Erro ao criar orçamento:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// Função auxiliar para calcular gastos atuais
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
    cost: { not: null }
  };

  if (budget.inboxId) where.inboxId = budget.inboxId;
  if (budget.userId) where.userId = budget.userId;

  // Somar custos do período
  const result = await prisma.costEvent.aggregate({
    where,
    _sum: { cost: true }
  });

  return Number(result._sum.cost || 0);
}