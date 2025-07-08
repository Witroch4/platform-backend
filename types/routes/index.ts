// types/routes.ts

export interface ConfigRoutes {
	publicRoutes: string[];
	protectedRoutes: string[];
	authRoutes: string[];
	apiRoutes: string[];
	adminRoutes: string[];
	superAdminRoutes?: string[]; // Rotas apenas para SUPERADMIN (opcional)
  }
