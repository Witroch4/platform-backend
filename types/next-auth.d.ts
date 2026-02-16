// types/next-auth.d.ts

import type { DefaultSession, DefaultUser } from "next-auth";
import { JWT } from "next-auth/jwt";
import type { UserRole } from "@prisma/client"; // Ajuste o caminho conforme a localização do seu enum UserRole

declare module "next-auth" {
	/**
	 * Interface estendida para a sessão do usuário
	 */
	interface Session {
		user: {
			id: string; // Assegure-se de que o ID do usuário está disponível na sessão
			role: UserRole;
			isTwoFactorAuthEnabled: boolean;
			instagramAccessToken?: string;
			providerAccountId?: string; // Adicionado
			isNewUser?: boolean; // Indica se o usuário acabou de se registrar
			chatwitAccessToken?: string; // Token de acesso do Chatwit
			/**
			 * Por padrão, TypeScript mescla novas propriedades de interface e sobrescreve as existentes.
			 * Neste caso, as propriedades padrão do usuário na sessão serão sobrescritas,
			 * com as novas definidas acima. Para manter as propriedades padrão do usuário na sessão,
			 * você precisa adicioná-las de volta na interface declarada acima.
			 */
		} & DefaultSession["user"];
	}

	/**
	 * Interface estendida para o usuário
	 */
	interface User extends DefaultUser {
		role: UserRole;
		isTwoFactorAuthEnabled: boolean;
		instagramAccessToken?: string;
		// instagramExpiresAt?: number; // Removido
		providerAccountId?: string; // Adicionado
		isNewUser?: boolean; // Indica se o usuário acabou de se registrar
		chatwitAccessToken?: string; // Token de acesso do Chatwit
	}
}

declare module "next-auth/jwt" {
	/**
	 * Interface estendida para o JWT
	 */
	interface JWT {
		isTwoFactorAuthEnabled: boolean;
		instagramAccessToken?: string;
		// instagramExpiresAt?: number; // Removido
		providerAccountId?: string; // Adicionado
		role?: UserRole; // Adicionado se você deseja incluir o papel do usuário no JWT
		isNewUser?: boolean; // Indica se o usuário acabou de se registrar
		chatwitAccessToken?: string; // Token de acesso do Chatwit
		isOAuth?: boolean; // Adicionado para compatibilidade
	}
}
