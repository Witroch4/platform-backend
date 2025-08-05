// auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { UserRole } from "@prisma/client";
import NextAuth from "next-auth";
import authConfig from "./auth.config";
// Importação condicional baseada no runtime
function getPrismaForAuth() {
  // Se estamos no Edge Runtime, usar a versão edge
  if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
    const { getPrismaInstanceEdge } = require("./lib/edge-connections");
    return getPrismaInstanceEdge();
  }
  // Caso contrário, usar a versão normal
  const { getPrismaInstance } = require("./lib/connections");
  return getPrismaInstance();
}
import { findUserbyEmail } from "./services";
import { isTwoFactorAuthenticationEnabled } from "./services/auth";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
  unstable_update: update,
} = NextAuth({
  adapter: PrismaAdapter(getPrismaForAuth()),
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
        const registeredUser = await findUserbyEmail(user.email);
        if (!registeredUser?.emailVerified) return false;
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

        const dbUser = await getPrismaForAuth().user.findUnique({
          where: { id: user.id },
          select: { password: true }
        });
        token.isOAuth = !dbUser?.password;
        token.isTwoFactorAuthEnabled = user.isTwoFactorAuthEnabled || false;
        
        // Buscar chatwitAccessToken do UsuarioChatwit
        const usuarioChatwit = await getPrismaForAuth().usuarioChatwit.findUnique({
          where: { appUserId: user.id },
          select: { chatwitAccessToken: true }
        });
        token.chatwitAccessToken = usuarioChatwit?.chatwitAccessToken || undefined;

        console.log("Requisição Prisma: Buscando status de autenticação de dois fatores");
        if (!user.id) {
          throw new Error("User id não definido");
        }
        const isTwoFactorAuthEnabled = await isTwoFactorAuthenticationEnabled(user.id);
        token.isTwoFactorAuthEnabled = isTwoFactorAuthEnabled ?? false;

        console.log("Requisição Prisma: Buscando conta do Instagram");
        const instagramAccount = await getPrismaForAuth().account.findFirst({
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
        } else {
          console.log("Nenhuma conta do Instagram encontrada.");
          token.instagramAccessToken = undefined;
          token.providerAccountId = undefined;
        }

        token.role = user.role as UserRole;
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
        session.user.id = token.sub as string;
        session.user.isTwoFactorAuthEnabled = token.isTwoFactorAuthEnabled as boolean;
        session.user.role = token.role as UserRole;
        session.user.instagramAccessToken = token.instagramAccessToken as string | undefined;
        session.user.providerAccountId = token.providerAccountId as string | undefined;
        
        // Buscar chatwitAccessToken do banco sempre para manter atualizado
        // NOTA: Esta consulta foi removida para evitar problemas no Edge Runtime (middleware)
        // O chatwitAccessToken será buscado diretamente nas páginas que precisam dele
        session.user.chatwitAccessToken = token.chatwitAccessToken as string | undefined;
      }
      return session;
    },
  },
  ...authConfig,
});
