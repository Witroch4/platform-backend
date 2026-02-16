import type { NextRequest } from "next/server";

export interface RouteConfig {
	public: string[];
	protected: string[];
	api: string[];
	auth: string[];
	admin: string[];
}

export function createRouteMatchers(config: RouteConfig, req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Função para verificar se o caminho corresponde a um padrão
	const matchPath = (path: string, pattern: string): boolean => {
		// Verificação exata
		if (pattern === path) return true;

		// Verificação com wildcard /*
		if (pattern.endsWith("/*")) {
			const basePattern = pattern.slice(0, -2);
			return path.startsWith(basePattern + "/") || path === basePattern;
		}

		// Verificação com wildcard * no final
		if (pattern.endsWith("*")) {
			const basePattern = pattern.slice(0, -1);
			return path.startsWith(basePattern);
		}

		return false;
	};

	// Verificar se o caminho corresponde a algum dos padrões em uma lista
	const matchAnyPattern = (path: string, patterns: string[]): boolean => {
		return patterns.some((pattern) => matchPath(path, pattern));
	};

	return {
		isPublicRoute: matchAnyPattern(pathname, config.public),
		isProtectedRoute: matchAnyPattern(pathname, config.protected),
		isApiRoute: matchAnyPattern(pathname, config.api),
		isAuthRoute: matchAnyPattern(pathname, config.auth),
		isAdminRoute: matchAnyPattern(pathname, config.admin),
	};
}
