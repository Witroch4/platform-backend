// config/routes/index.ts

import type { ConfigRoutes } from "@/types/routes";

export const configRoutes: ConfigRoutes = {
	publicRoutes: [
		"/",
		"/auth/login",
		"/auth/register",
		"/auth/change-password",
		"/auth/reset-password",
		"/auth/verify-email",
		"/auth/users",
		"/denied",
	],
	authRoutes: ["/api/auth/signin"],
	apiRoutes: ["/api/protected-api"],
	protectedRoutes: [
		"/hub",
		"/auth/settings",
		"/example/multi-step-form/campaign",
		"/dashboard",
		"/dashboard/*",
		"/registro/redesocial",
		"/registro/redesocial/*",
		// Gestão Social (qualquer user autenticado)
		"/gestao-social/*",
	],
	adminRoutes: [
		// MTF Diamante (ADMIN + SUPERADMIN)
		"/mtf-diamante",
		"/mtf-diamante/*",
	],
	superAdminRoutes: [
		// Admin real (SUPERADMIN only)
		"/admin",
		"/admin/*",
	],
	iframeRoutes: ["/iframe/admin", "/iframe/admin/*"],
};
