// lib/subscription-middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// Lista de emails com acesso liberado
const EXEMPTED_EMAILS = [
  "amandasousa22.adv@gmail.com",
  "witalorocha216@gmail.com",
  "witalo_rocha@outlook.com"
];

// Rotas que requerem assinatura ativa
const SUBSCRIPTION_REQUIRED_PATHS = [
  '/dashboard/automacao',
  '/dashboard/analytics',
  '/dashboard/advanced-features'
];

/**
 * Middleware para verificar acesso baseado em assinatura
 */
export async function checkSubscriptionMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Verificar se a rota requer assinatura
  const requiresSubscription = SUBSCRIPTION_REQUIRED_PATHS.some(path => 
    pathname.includes(path)
  );

  if (!requiresSubscription) {
    return NextResponse.next();
  }

  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    const userEmail = session.user.email;

    // Verificar se o email está na lista de exceções
    if (EXEMPTED_EMAILS.includes(userEmail)) {
      console.log(`[Subscription Middleware] Acesso liberado para email na lista de exceções: ${userEmail}`);
      return NextResponse.next();
    }

    // Verificar cookie de assinatura ativa
    const subscriptionCookie = request.cookies.get("subscription-active");
    const hasActiveSubscription = subscriptionCookie?.value === "true";

    if (hasActiveSubscription) {
      console.log(`[Subscription Middleware] Acesso liberado por assinatura ativa: ${userEmail}`);
      return NextResponse.next();
    }

    // Sem acesso - redirecionar para página de assinatura
    console.log(`[Subscription Middleware] Acesso negado para: ${userEmail} na rota: ${pathname}`);
    return NextResponse.redirect(new URL("/assine-agora", request.url));

  } catch (error) {
    console.error('[Subscription Middleware] Erro ao verificar acesso:', error);
    return NextResponse.redirect(new URL("/assine-agora", request.url));
  }
}