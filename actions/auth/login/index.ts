//actions\auth\login\index.ts

"use server";

import { signIn } from "@/auth";
import { CredentialsSchema, MagicLinkSignInSchema } from "@/schemas/auth";
import { findUserbyEmail } from "@/services";
import {
	createTwoFactorAuthToken,
	createVerificationToken,
	deleteTwoFactorAuthTokenById,
	findTwoFactorAuthTokenByEmail,
} from "@/services/auth";
import { AuthError, CredentialsSignin } from "next-auth";
import type { z } from "zod";
import { sendAccountVerificationEmail } from "../email-verification";
import { sendTwoFactorAuthEmail } from "../two-factor";

/**
 * This method is responsible for executing the login flow.
 * @param {z.infer<typeof CredentialsSchema>} credentials - The user credentials.
 * @returns {Promise<{ error?: string, success?: string, data?: { twoFactorAuthEnabled: boolean } }>}
 * An object containing error, success, or data about two-factor authentication status,
 * or throws an error if an unexpected error occurs.
 */
export const login = async (credentials: z.infer<typeof CredentialsSchema>) => {
	const validCredentials = await CredentialsSchema.safeParse(credentials);
	if (!validCredentials.success) {
		return {
			error: "Dados inválidos",
		};
	}

	try {
		const { email, password, code } = validCredentials.data;
		const user = await findUserbyEmail(email);
		if (!user) {
			return {
				error: "Usuário não encontrado",
			};
		}
		//Verificação de E-mail
		if (!user.emailVerified) {
			const verificationToken = await createVerificationToken(user.email);
			await sendAccountVerificationEmail(user, verificationToken.token);
			return {
				success: "Verificação de E-mail enviada com sucesso",
			};
		}

		//Two Factor Authentication
		if (user.isTwoFactorAuthEnabled) {
			if (code) {
				const twoFactorAuthToken = await findTwoFactorAuthTokenByEmail(email);

				if (!twoFactorAuthToken || twoFactorAuthToken.token !== code) {
					return {
						error: "Código Inválido",
						data: {
							twoFactorAuthEnabled: true,
						},
					};
				}

				const hasExpired = new Date(twoFactorAuthToken.expires) < new Date();

				if (hasExpired) {
					return {
						error: "Código Expirado",
						data: {
							twoFactorAuthEnabled: true,
						},
					};
				}

				await deleteTwoFactorAuthTokenById(twoFactorAuthToken.id);
			} else {
				//generate code
				const twoFactorAuthToken = await createTwoFactorAuthToken(email);
				await sendTwoFactorAuthEmail(user, twoFactorAuthToken.token);
				return {
					data: {
						twoFactorAuthEnabled: true,
					},
				};
			}
		}

		// Obter o URL base de redirecionamento da variável de ambiente
		const baseRedirect = process.env.AUTH_LOGIN_REDIRECT || "/registro/redesocial";

		// Verificar se o URL já contém parâmetros de consulta
		const hasQueryParams = baseRedirect.includes('?');

		// Adicionar o parâmetro fromLogin=true de forma adequada
		const loginRedirect = hasQueryParams
			? `${baseRedirect}&fromLogin=true`
			: `${baseRedirect}?fromLogin=true`;

		await signIn("credentials", {
			email,
			password,
			redirectTo: loginRedirect,
		});

		// Retornar sucesso após o signIn
		return {
			success: "Login realizado com sucesso",
		};
	} catch (err) {
		// Verificar se é um NEXT_REDIRECT (comportamento normal do NextAuth)
		if (err instanceof Error && err.message === 'NEXT_REDIRECT') {
			throw err; // Re-throw para permitir o redirecionamento
		}

		// Verificar se é um erro de digest de redirecionamento (NextAuth)
		if (err && typeof err === 'object' && 'digest' in err) {
			const errorWithDigest = err as { digest?: string };
			if (errorWithDigest.digest && errorWithDigest.digest.includes('NEXT_REDIRECT')) {
				throw err; // Re-throw para permitir o redirecionamento
			}
		}
		
		if (err instanceof AuthError) {
			if (err instanceof CredentialsSignin) {
				return {
					error: "Credenciais inválidas",
				};
			}
		}

		throw err; // Rethrow all other errors
	}
};
