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
		"/denied", // Adicionado para evitar que o middleware processe esta rota
	],
	authRoutes: ["/api/auth/signin"],
	apiRoutes: ["/api/protected-api"],
	protectedRoutes: [
		"/auth/settings",
		"/example/multi-step-form/campaign",
		"/dashboard",
		"/dashboard/*",
		"/registro/redesocial",
		"/registro/redesocial/*",
		// Rotas dinâmicas para contas do Instagram
		"/:accountid/dashboard",
		"/:accountid/dashboard/*",
	],
	adminRoutes: [
		"/admin",
		"/admin/*", // Inclui todas as subrotas de /admin (exceto as específicas de SUPERADMIN)
	],
	superAdminRoutes: [
		"/admin/monitoring",
		"/admin/monitoring/*",
		"/admin/notifications",
		"/admin/notifications/*",
		"/admin/users",
		"/admin/users/*",
		"/admin/queue-management",
		"/admin/queue-management/*",
		"/admin/iframe-config",
		"/admin/iframe-config/*",
		"/admin/resposta-rapida",
		"/admin/resposta-rapida/*",
		"/admin/features",
		"/admin/features/*",
	],
	iframeRoutes: ["/iframe/admin", "/iframe/admin/*"],
};
