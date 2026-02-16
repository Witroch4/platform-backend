// proxy.ts - Next.js 16
import { NextResponse } from "next/server";
import { configRoutes } from "./config/routes/index";

export default async function proxy(req: any) {
	try {
		const { nextUrl } = req;
		const pathName = nextUrl.pathname;

		// Verificações básicas de rotas
		const publicRoutes = configRoutes.publicRoutes || [];
		const adminRoutes = configRoutes.adminRoutes || [];
		const superAdminRoutes = configRoutes.superAdminRoutes || [];
		const iframeRoutes = configRoutes.iframeRoutes || [];

		// Verificações simples
		const isPublicRoute = publicRoutes.some(
			(route) => route === pathName || (route.endsWith("/*") && pathName.startsWith(route.slice(0, -2))),
		);

		const isAdminRoute = adminRoutes.some(
			(route) => route === pathName || (route.endsWith("/*") && pathName.startsWith(route.slice(0, -2))),
		);

		const isSuperAdminRoute = superAdminRoutes.some(
			(route) => route === pathName || (route.endsWith("/*") && pathName.startsWith(route.slice(0, -2))),
		);

		const isIframeRoute = iframeRoutes.some(
			(route) => route === pathName || (route.endsWith("/*") && pathName.startsWith(route.slice(0, -2))),
		);

		// Para rotas públicas, permitir acesso
		// EXCEÇÃO: Se for a rota raiz "/" e usuário estiver autenticado, permitir
		// que a página page.tsx faça o redirecionamento inteligente
		if (isPublicRoute) {
			return NextResponse.next();
		}

		// Para rotas iframe, usar autenticação especial baseada em referrer
		if (isIframeRoute) {
			// Rotas iframe têm sua própria verificação de autorização
			// Permitir acesso para que a verificação seja feita na página
			return NextResponse.next();
		}

		// Para rotas protegidas, redirecionar para login (simplificado)
		if (isAdminRoute || isSuperAdminRoute) {
			// Verificar se há token de autenticação
			const token =
				req.cookies.get("next-auth.session-token") ||
				req.cookies.get("__Secure-next-auth.session-token") ||
				req.cookies.get("authjs.session-token") ||
				req.cookies.get("__Secure-authjs.session-token");

			if (!token) {
				return NextResponse.redirect(new URL("/auth/login", req.url));
			}
		}

		return NextResponse.next();
	} catch (error) {
		console.error("Erro no middleware:", error);
		return NextResponse.next();
	}
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico|docs|animations).*)"],
};
