import type { RouteConfig } from "@/lib/route";

export const configRoutes: RouteConfig = {
  // Rotas públicas que não requerem autenticação
  public: [
    "/",
    "/auth/login",
    "/auth/register",
    "/auth/error",
    "/auth/reset",
    "/auth/new-password",
    "/auth/verify",
    "/denied",
    "/docs/*",
    "/assine-agora",
    "/termos",
    "/privacidade",
    "/middleware-test"
  ],

  // Rotas protegidas que requerem autenticação
  protected: [
    "/settings/*",
    "/profile/*",
    "/dashboard/*",
    "/registro/*"
  ],

  // Rotas de API
  api: [
    "/api/*"
  ],

  // Rotas de autenticação
  auth: [
    "/auth/*"
  ],

  // Rotas de administração
  admin: [
    "/admin/*"
  ]
};