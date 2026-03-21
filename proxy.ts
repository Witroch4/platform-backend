// proxy.ts - Next.js 16
import { NextResponse } from "next/server";
import { configRoutes } from "./config/routes/index";

export default async function proxy(req: any) {
	try {
		const { nextUrl } = req;
		const pathName = nextUrl.pathname;

		const publicRoutes = configRoutes.publicRoutes || [];
		const adminRoutes = configRoutes.adminRoutes || [];
		const superAdminRoutes = configRoutes.superAdminRoutes || [];
		const protectedRoutes = configRoutes.protectedRoutes || [];
		const iframeRoutes = configRoutes.iframeRoutes || [];

		const matchRoute = (routes: string[], path: string) =>
			routes.some(
				(route) => route === path || (route.endsWith("/*") && path.startsWith(route.slice(0, -2))),
			);

		const isPublicRoute = matchRoute(publicRoutes, pathName);
		const isAdminRoute = matchRoute(adminRoutes, pathName);
		const isSuperAdminRoute = matchRoute(superAdminRoutes, pathName);
		const isProtectedRoute = matchRoute(protectedRoutes, pathName);
		const isIframeRoute = matchRoute(iframeRoutes, pathName);

		if (isPublicRoute) {
			return NextResponse.next();
		}

		if (isIframeRoute) {
			return NextResponse.next();
		}

		// Para rotas protegidas, admin e superadmin: verificar token
		if (isAdminRoute || isSuperAdminRoute || isProtectedRoute) {
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
