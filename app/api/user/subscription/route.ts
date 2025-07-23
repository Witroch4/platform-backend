// app/api/user/subscription/route.ts

import { NextResponse } from "next/server";
import { auth } from "@/auth"; // Certifique-se de que esse arquivo exporta { auth, handlers, ... } conforme a nova configuração do NextAuth v5
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Localize o usuário no banco de dados a partir do email presente na sessão
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Busca o registro de assinatura mais recente do usuário.
    // Caso o usuário possua múltiplos registros, este exemplo retorna o mais recente.
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Define um cookie para indicar se o usuário tem uma assinatura ativa
    // Este cookie será usado pelo middleware para verificações rápidas
    const hasActiveSubscription = subscription?.status === "ACTIVE";
    const cookieStore = cookies();

    const response = NextResponse.json({ subscription });

    response.cookies.set("subscription-active", hasActiveSubscription ? "true" : "false", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 horas
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[SUBSCRIPTION_GET]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Função para atualizar manualmente o status da assinatura
export async function PUT(request: Request) {
  try {
    const session = await auth();

    // Verificar se o usuário está autenticado e tem permissão de administrador
    if (!session?.user?.email || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Obter os dados da requisição
    const data = await request.json();
    const { userId, status } = data;

    if (!userId || !status) {
      return NextResponse.json({ error: "Missing required fields: userId and status" }, { status: 400 });
    }

    // Verificar se o status é válido
    const validStatuses = ["ACTIVE", "PAST_DUE", "CANCELED", "UNPAID", "INCOMPLETE", "INCOMPLETE_EXPIRED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      }, { status: 400 });
    }

    // Buscar a assinatura do usuário
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found for this user" }, { status: 404 });
    }

    // Atualizar o status da assinatura
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status },
    });

    // Definir o cookie com base no novo status
    const hasActiveSubscription = status === "ACTIVE";
    const response = NextResponse.json({
      message: "Subscription status updated successfully",
      subscription: { ...subscription, status }
    });

    response.cookies.set("subscription-active", hasActiveSubscription ? "true" : "false", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 horas
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[SUBSCRIPTION_PUT]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
