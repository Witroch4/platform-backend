// middleware.ts
import { auth } from "@/auth"; // Importe o auth já configurado
import { NextResponse } from "next/server";
import { configRoutes } from "./config/routes/index";
import { createRouteMatchers } from "./lib/route";

export default auth(async (req) => {
  try {
    const { nextUrl } = req;
    const pathName = nextUrl.pathname;
    
    // Verificações básicas de rotas
    const publicRoutes = configRoutes.publicRoutes || [];
    const adminRoutes = configRoutes.adminRoutes || [];
    const superAdminRoutes = configRoutes.superAdminRoutes || [];
    
    // Verificações simples
    const isPublicRoute = publicRoutes.some(route => 
      route === pathName || (route.endsWith('/*') && pathName.startsWith(route.slice(0, -2)))
    );
    
    const isAdminRoute = adminRoutes.some(route => 
      route === pathName || (route.endsWith('/*') && pathName.startsWith(route.slice(0, -2)))
    );
    
    const isSuperAdminRoute = superAdminRoutes.some(route => 
      route === pathName || (route.endsWith('/*') && pathName.startsWith(route.slice(0, -2)))
    );

  // Obtenha a role do usuário do token
  const userRole = req.auth?.user.role;
  const isLoggedIn = !!req.auth;
  
  // Verificar se é uma rota pública
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Verifica se a rota é superAdmin e se o usuário possui a role "SUPERADMIN"
  if (isSuperAdminRoute && (!isLoggedIn || userRole !== "SUPERADMIN")) {
    return NextResponse.redirect(new URL("/denied", req.url));
  }

  // Verifica se a rota é admin e se o usuário possui pelo menos a role "ADMIN"
  if (isAdminRoute && (!isLoggedIn || (userRole !== "ADMIN" && userRole !== "SUPERADMIN"))) {
    return NextResponse.redirect(new URL("/denied", req.url));
  }

  return NextResponse.next();
  
  } catch (error) {
    console.error('Erro no middleware:', error);
    return NextResponse.next();
  }
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|docs|animations).*)",
  ],
};

