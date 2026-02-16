// auth.config.ts
import bcryptjs from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import FacebookProvider from "next-auth/providers/facebook";
import { InvalidCredentials, UserNotFound } from "./lib/auth";
import { CredentialsSchema } from "./schemas/auth";
import { findUserbyEmail } from "./services";

export const runtime = "nodejs";

const authConfig: NextAuthConfig = {
	providers: [
		CredentialsProvider({
			name: "E-mail & Senha",
			credentials: {
				email: { label: "E-mail", type: "text" },
				password: { label: "Senha", type: "password" },
			},
			async authorize(credentials) {
				const parsed = CredentialsSchema.safeParse(credentials);
				if (!parsed.success) throw new InvalidCredentials();

				const { email, password } = parsed.data;
				const user = await findUserbyEmail(email);
				if (!user?.password) throw new UserNotFound();

				const passOk = await bcryptjs.compare(password, user.password);
				if (!passOk) throw new InvalidCredentials();

				// ↓ Retorne apenas o que vai para o JWT
				return {
					id: user.id,
					name: user.name,
					email: user.email,
					role: user.role, // UserRole
					isTwoFactorAuthEnabled: user.isTwoFactorAuthEnabled, // boolean
				};
			},
		}),
		GoogleProvider({
			clientId: process.env.AUTH_GOOGLE_ID!,
			clientSecret: process.env.AUTH_GOOGLE_SECRET!,
		}),
		GitHubProvider({
			clientId: process.env.AUTH_GITHUB_ID!,
			clientSecret: process.env.AUTH_GITHUB_SECRET!,
		}),
		FacebookProvider({
			clientId: process.env.FACEBOOK_CLIENT_ID!,
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
		}),
	],
};

export default authConfig;
