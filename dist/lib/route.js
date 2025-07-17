"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouteMatchers = createRouteMatchers;
function createRouteMatchers(config, req) {
    const { pathname } = req.nextUrl;
    // Função para verificar se o caminho corresponde a um padrão
    const matchPath = (path, pattern) => {
        // Converter o padrão em uma expressão regular
        const regexPattern = pattern
            .replace(/\//g, "\\/") // Escapar barras
            .replace(/\*/g, ".*"); // Converter * em .*
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path);
    };
    // Verificar se o caminho corresponde a algum dos padrões em uma lista
    const matchAnyPattern = (path, patterns) => {
        return patterns.some(pattern => matchPath(path, pattern));
    };
    return {
        isPublicRoute: matchAnyPattern(pathname, config.public),
        isProtectedRoute: matchAnyPattern(pathname, config.protected),
        isApiRoute: matchAnyPattern(pathname, config.api),
        isAuthRoute: matchAnyPattern(pathname, config.auth),
        isAdminRoute: matchAnyPattern(pathname, config.admin),
    };
}
