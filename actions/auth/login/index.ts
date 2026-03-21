//actions\auth\login\index.ts

"use server";

import { signIn } from "@/auth";
import {
	applyProgressiveDelay,
	checkLoginAllowed,
	recordFailedAttempt,
	recordSuccessfulLogin,
} from "@/lib/auth/login-security";
import { CredentialsSchema, MagicLinkSignInSchema } from "@/schemas/auth";
import { findUserbyEmail } from "@/services";
import {
	createTwoFactorAuthToken,
	createVerificationToken,
	deleteTwoFactorAuthTokenById,
	findTwoFactorAuthTokenByEmail,
} from "@/services/auth";
import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import type { z } from "zod";
import { sendAccountVerificationEmail } from "../email-verification";
import { sendTwoFactorAuthEmail } from "../two-factor";

// Mensagem genérica para evitar enumeração de usuários
const GENERIC_ERROR_MESSAGE = "E-mail ou senha incorretos";

/**
 * Obtém o IP do cliente a partir dos headers
 */
async function getClientIp(): Promise<string> {
	try {
		const headersList = await headers();
		return headersList.get("x-forwarded-for")?.split(",")[0].trim() || headersList.get("x-real-ip") || "unknown";
	} catch {
		return "unknown";
	}
}

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

	const { email, password, code } = validCredentials.data;
	const clientIp = await getClientIp();

	// Verificar rate limiting e lockout ANTES de qualquer operação
	const securityCheck = await checkLoginAllowed(clientIp, email);
	if (!securityCheck.allowed) {
		return {
			error: securityCheck.message,
		};
	}

	try {
		const user = await findUserbyEmail(email);

		// IMPORTANTE: Mensagem genérica para evitar enumeração de usuários
		if (!user) {
			// Registrar tentativa falha mesmo sem usuário (para rate limiting por IP)
			const { shouldDelay, delayMs } = await recordFailedAttempt(clientIp, email);
			if (shouldDelay) {
				await applyProgressiveDelay(delayMs);
			}
			return {
				error: GENERIC_ERROR_MESSAGE,
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
		const baseRedirect = process.env.AUTH_LOGIN_REDIRECT || "/hub";

		// Verificar se o URL já contém parâmetros de consulta
		const hasQueryParams = baseRedirect.includes("?");

		// Adicionar o parâmetro fromLogin=true de forma adequada
		const loginRedirect = hasQueryParams ? `${baseRedirect}&fromLogin=true` : `${baseRedirect}?fromLogin=true`;

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
		// Isso significa que o login foi bem-sucedido e está redirecionando
		if (err instanceof Error && err.message === "NEXT_REDIRECT") {
			// Login bem-sucedido - limpar contadores de tentativas falhas
			// Usamos void para não bloquear o redirect
			void recordSuccessfulLogin(clientIp, email);
			throw err; // Re-throw para permitir o redirecionamento
		}

		// Verificar se é um erro de digest de redirecionamento (NextAuth)
		if (err && typeof err === "object" && "digest" in err) {
			const errorWithDigest = err as { digest?: string };
			if (errorWithDigest.digest && errorWithDigest.digest.includes("NEXT_REDIRECT")) {
				// Login bem-sucedido - limpar contadores de tentativas falhas
				void recordSuccessfulLogin(clientIp, email);
				throw err; // Re-throw para permitir o redirecionamento
			}
		}

		if (err instanceof AuthError) {
			if (err instanceof CredentialsSignin) {
				// Registrar tentativa falha (senha incorreta)
				const { shouldDelay, delayMs } = await recordFailedAttempt(clientIp, email);
				if (shouldDelay) {
					await applyProgressiveDelay(delayMs);
				}
				return {
					error: GENERIC_ERROR_MESSAGE,
				};
			}
		}

		throw err; // Rethrow all other errors
	}
};
