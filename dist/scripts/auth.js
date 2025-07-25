"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.update = exports.signOut = exports.signIn = exports.auth = exports.POST = exports.GET = void 0;
// auth.ts
const prisma_adapter_1 = require("@auth/prisma-adapter");
const next_auth_1 = __importDefault(require("next-auth"));
const auth_config_1 = __importDefault(require("./auth.config"));
const prisma_1 = require("./lib/prisma");
const services_1 = require("./services");
const auth_1 = require("./services/auth");
_a = (0, next_auth_1.default)({
    adapter: (0, prisma_adapter_1.PrismaAdapter)(prisma_1.prisma),
    secret: process.env.AUTH_SECRET,
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/auth/login",
    },
    trustHost: true,
    callbacks: {
        async signIn({ user, email, account, profile }) {
            if (account && (account.provider === "google" || account.provider === "github")) {
                return true;
            }
            if (user.email) {
                console.log("Requisição Prisma: Buscando usuário por email durante sign-in");
                const registeredUser = await (0, services_1.findUserbyEmail)(user.email);
                if (!registeredUser?.emailVerified)
                    return false;
            }
            return true;
        },
        async jwt({ token, user, trigger, session }) {
            if (trigger === "update" && session) {
                token.isTwoFactorEnabled = session.user.isTwoFactorEnabled;
                token.instagramAccessToken = session.user.instagramAccessToken;
                if (session.user.providerAccountId) {
                    token.providerAccountId = session.user.providerAccountId;
                }
                // Atualizar chatwitAccessToken se fornecido na sessão
                if (session.user.chatwitAccessToken !== undefined) {
                    token.chatwitAccessToken = session.user.chatwitAccessToken;
                }
                return token;
            }
            if (user) {
                console.log("Usuário acabou de fazer login, atualizando token");
                token.id = user.id;
                token.email = user.email;
                token.name = user.name;
                token.role = user.role;
                const dbUser = await prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    select: { password: true }
                });
                token.isOAuth = !dbUser?.password;
                token.isTwoFactorAuthEnabled = user.isTwoFactorAuthEnabled || false;
                // Buscar chatwitAccessToken do UsuarioChatwit
                const usuarioChatwit = await prisma_1.prisma.usuarioChatwit.findUnique({
                    where: { appUserId: user.id },
                    select: { chatwitAccessToken: true }
                });
                token.chatwitAccessToken = usuarioChatwit?.chatwitAccessToken || undefined;
                console.log("Requisição Prisma: Buscando status de autenticação de dois fatores");
                if (!user.id) {
                    throw new Error("User id não definido");
                }
                const isTwoFactorAuthEnabled = await (0, auth_1.isTwoFactorAuthenticationEnabled)(user.id);
                token.isTwoFactorAuthEnabled = isTwoFactorAuthEnabled ?? false;
                console.log("Requisição Prisma: Buscando conta do Instagram");
                const instagramAccount = await prisma_1.prisma.account.findFirst({
                    where: {
                        userId: user.id,
                        provider: "instagram",
                    },
                });
                if (instagramAccount) {
                    const partialIgToken = instagramAccount.access_token
                        ? instagramAccount.access_token.slice(0, 3) + "..."
                        : null;
                    console.log(`Conta do Instagram encontrada. ProviderAccountId: ${instagramAccount.providerAccountId}, AccessToken parcial: ${partialIgToken}`);
                    token.instagramAccessToken = instagramAccount.access_token ?? undefined;
                    token.providerAccountId = instagramAccount.providerAccountId;
                }
                else {
                    console.log("Nenhuma conta do Instagram encontrada.");
                    token.instagramAccessToken = undefined;
                    token.providerAccountId = undefined;
                }
                token.role = user.role;
                console.log("Usuário COM A ROLE:", token.role);
            }
            const partialAccess = token.instagramAccessToken
                ? token.instagramAccessToken.slice(0, 3) + "..."
                : undefined;
            // console.log("Token final antes de retornar (PARCIAL IG):", {
            //   ...token,
            //   instagramAccessToken: partialAccess,
            // });
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.sub;
                session.user.isTwoFactorAuthEnabled = token.isTwoFactorAuthEnabled;
                session.user.role = token.role;
                session.user.instagramAccessToken = token.instagramAccessToken;
                session.user.providerAccountId = token.providerAccountId;
                // Buscar chatwitAccessToken do banco sempre para manter atualizado
                // NOTA: Esta consulta foi removida para evitar problemas no Edge Runtime (middleware)
                // O chatwitAccessToken será buscado diretamente nas páginas que precisam dele
                session.user.chatwitAccessToken = token.chatwitAccessToken;
            }
            return session;
        },
    },
    ...auth_config_1.default,
}), _b = _a.handlers, exports.GET = _b.GET, exports.POST = _b.POST, exports.auth = _a.auth, exports.signIn = _a.signIn, exports.signOut = _a.signOut, exports.update = _a.unstable_update;
