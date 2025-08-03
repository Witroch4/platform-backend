// middleware.ts
import { auth } from "@/auth"; // Importe o auth já configurado
import { NextResponse } from "next/server";
import { configRoutes } from "./config/routes/index";
import { createRouteMatchers } from "./lib/route";

export default auth(async (req) => {
  try {
    const { nextUrl } = req;
    const pathName = nextUrl.pathname;
    
    // Log para debug (remover em produção)
    console.log(`[Middleware] Verificando rota: ${pathName}`);
    
    // Usar a função createRouteMatchers para verificar tipos de rota
    const routeConfig = {
      public: configRoutes.publicRoutes || [],
      protected: configRoutes.protectedRoutes || [],
      api: configRoutes.apiRoutes || [],
      auth: configRoutes.authRoutes || [],
      admin: [...(configRoutes.adminRoutes || []), ...(configRoutes.superAdminRoutes || [])]
    };
    
    const {
      isPublicRoute,
      isProtectedRoute,
      isApiRoute,
      isAuthRoute,
      isAdminRoute
    } = createRouteMatchers(routeConfig, req);
    
    // Verificações específicas para superAdmin
    const superAdminRoutes = configRoutes.superAdminRoutes || [];
    const isSuperAdminRoute = superAdminRoutes.some(route => {
      if (route === pathName) return true;
      if (route.endsWith('/*')) {
        const baseRoute = route.slice(0, -2);
        return pathName.startsWith(baseRoute + '/') || pathName === baseRoute;
      }
      return false;
    });

    // Obtenha a role do usuário do token
    const userRole = req.auth?.user?.role;
    const isLoggedIn = !!req.auth;
    
    // Log para debug (remover em produção)
    console.log(`[Middleware] Usuário logado: ${isLoggedIn}, Role: ${userRole}`);
    console.log(`[Middleware] Tipos de rota - Pública: ${isPublicRoute}, Admin: ${isAdminRoute}, SuperAdmin: ${isSuperAdminRoute}, Protegida: ${isProtectedRoute}`);
    
    // Verificar se é uma rota pública
    if (isPublicRoute) {
      console.log(`[Middleware] Rota pública permitida: ${pathName}`);
      return NextResponse.next();
    }

    // Se não está logado e não é rota pública, redireciona para login
    if (!isLoggedIn) {
      console.log(`[Middleware] Usuário não logado, redirecionando para login`);
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    // Verifica se a rota é superAdmin e se o usuário possui a role "SUPERADMIN"
    if (isSuperAdminRoute && userRole !== "SUPERADMIN") {
      console.log(`[Middleware] Acesso negado para SuperAdmin: ${pathName}, Role: ${userRole}`);
      return NextResponse.redirect(new URL("/denied", req.url));
    }

    // Verifica se a rota é admin e se o usuário possui pelo menos a role "ADMIN"
    if (isAdminRoute && !isSuperAdminRoute && userRole !== "ADMIN" && userRole !== "SUPERADMIN") {
      console.log(`[Middleware] Acesso negado para Admin: ${pathName}, Role: ${userRole}`);
      return NextResponse.redirect(new URL("/denied", req.url));
    }

    // Para rotas protegidas, apenas verifica se está logado
    if (isProtectedRoute && !isLoggedIn) {
      console.log(`[Middleware] Rota protegida, usuário não logado: ${pathName}`);
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    console.log(`[Middleware] Acesso permitido: ${pathName}`);
    return NextResponse.next();
  
  } catch (error) {
    console.error('Erro no middleware:', error);
    return NextResponse.next();
  }
});

export const config = {
  matcher: [
    // Aplica o middleware a todas as rotas exceto:
    // - API routes (começam com /api)
    // - Static files (_next/static)
    // - Images (_next/image)
    // - Favicon
    // - Docs
    // - Animations
    // - Service worker (sw.js)
    "/((?!api|_next/static|_next/image|favicon.ico|docs|animations|sw.js).*)",
  ],
};

