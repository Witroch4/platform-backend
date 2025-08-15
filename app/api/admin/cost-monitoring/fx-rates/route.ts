/**
 * API para consulta de taxas de câmbio históricas
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import FxRateService from "@/lib/cost/fx-rate-service";
import log from "@/lib/log";

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // Verificar permissões de admin
    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas administradores podem acessar dados de taxa de câmbio.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "current";

    switch (action) {
      case "current":
        return await getCurrentRate();

      case "history":
        return await getRateHistory(searchParams);

      case "convert":
        return await convertCurrency(searchParams);

      default:
        return NextResponse.json(
          { error: "Ação não reconhecida. Use: current, history, convert" },
          { status: 400 }
        );
    }
  } catch (error) {
    log.error("Erro na API de taxas de câmbio:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * Obtém taxa atual
 */
async function getCurrentRate() {
  try {
    const latestRate = await FxRateService.getLatestStoredRate();

    if (!latestRate) {
      // Se não há taxa armazenada, buscar uma nova
      const currentRate = await FxRateService.updateCurrentRate();
      return NextResponse.json({
        rate: currentRate,
        date: new Date().toISOString().split("T")[0],
        source: "live_api",
        base: "USD",
        quote: "BRL",
      });
    }

    return NextResponse.json({
      rate: latestRate.rate,
      date: latestRate.date.toISOString().split("T")[0],
      source: "stored",
      base: latestRate.base,
      quote: latestRate.quote,
    });
  } catch (error) {
    log.error("Erro ao obter taxa atual:", error);
    throw error;
  }
}

/**
 * Obtém histórico de taxas
 */
async function getRateHistory(searchParams: URLSearchParams) {
  try {
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: "Parâmetros startDate e endDate são obrigatórios" },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Datas inválidas. Use formato YYYY-MM-DD" },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "Data inicial deve ser anterior à data final" },
        { status: 400 }
      );
    }

    // Limitar consulta a 1 ano
    const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > oneYearInMs) {
      return NextResponse.json(
        { error: "Período máximo de consulta é 1 ano" },
        { status: 400 }
      );
    }

    const history = await FxRateService.getRateHistory(startDate, endDate);

    return NextResponse.json({
      startDate: startDateStr,
      endDate: endDateStr,
      base: "USD",
      quote: "BRL",
      rates: history.map((rate) => ({
        date: rate.date.toISOString().split("T")[0],
        rate: rate.rate,
      })),
      count: history.length,
    });
  } catch (error) {
    log.error("Erro ao obter histórico de taxas:", error);
    throw error;
  }
}

/**
 * Converte valores entre moedas
 */
async function convertCurrency(searchParams: URLSearchParams) {
  try {
    const amountStr = searchParams.get("amount");
    const dateStr = searchParams.get("date");

    if (!amountStr) {
      return NextResponse.json(
        { error: "Parâmetro amount é obrigatório" },
        { status: 400 }
      );
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json(
        { error: "Amount deve ser um número positivo" },
        { status: 400 }
      );
    }

    let targetDate = new Date();
    if (dateStr) {
      targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json(
          { error: "Data inválida. Use formato YYYY-MM-DD" },
          { status: 400 }
        );
      }
    }

    const conversion = await FxRateService.convertUsdToBrl(amount, targetDate);

    return NextResponse.json({
      originalAmount: amount,
      originalCurrency: "USD",
      convertedAmount: conversion.brlAmount,
      convertedCurrency: "BRL",
      exchangeRate: conversion.rate,
      date: conversion.date.toISOString().split("T")[0],
    });
  } catch (error) {
    log.error("Erro ao converter moeda:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // Verificar permissões de admin
    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas administradores podem atualizar taxas de câmbio.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "update":
        return await updateCurrentRate();

      case "backfill":
        return await scheduleBackfill(body);

      default:
        return NextResponse.json(
          { error: "Ação não reconhecida. Use: update, backfill" },
          { status: 400 }
        );
    }
  } catch (error) {
    log.error("Erro na API POST de taxas de câmbio:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * Atualiza taxa atual manualmente
 */
async function updateCurrentRate() {
  try {
    const rate = await FxRateService.updateCurrentRate();

    return NextResponse.json({
      success: true,
      message: "Taxa atualizada com sucesso",
      rate: rate,
      date: new Date().toISOString().split("T")[0],
    });
  } catch (error) {
    log.error("Erro ao atualizar taxa atual:", error);
    throw error;
  }
}

/**
 * Agenda backfill de taxas
 */
async function scheduleBackfill(body: any) {
  try {
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Parâmetros startDate e endDate são obrigatórios" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Datas inválidas. Use formato YYYY-MM-DD" },
        { status: 400 }
      );
    }

    if (start > end) {
      return NextResponse.json(
        { error: "Data inicial deve ser anterior à data final" },
        { status: 400 }
      );
    }

    // Importar função de agendamento
    const { scheduleBackfillRates } = await import("@/lib/cost/fx-rate-worker");
    await scheduleBackfillRates(start, end);

    return NextResponse.json({
      success: true,
      message: "Backfill de taxas agendado com sucesso",
      startDate: startDate,
      endDate: endDate,
    });
  } catch (error) {
    log.error("Erro ao agendar backfill:", error);
    throw error;
  }
}
