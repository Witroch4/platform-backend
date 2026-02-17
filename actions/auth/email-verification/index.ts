"use server";

import { getPrismaInstance } from "@/lib/connections";
import mail from "@/lib/mail";
import { verificationTemplate } from "@/lib/mail/templates";
import { findUserbyEmail } from "@/services";
import { findVerificationTokenbyToken } from "@/services/auth";
import type { User } from "@prisma/client";
/**
 * This method uses Resend to send an email to the user to verify
 * the ownership of the email by the user.
 *
 * @param {User} user - The user to send the verification email to.
 * @param {string} token - The verification token.
 * @returns {Promise<{ error?: string, success?: string }>} An object indicating the result of the operation.
 */
export const sendAccountVerificationEmail = async (user: User, token: string) => {
	const { MAILER_SENDER_EMAIL, VERIFICATION_SUBJECT, NEXT_PUBLIC_URL, NEXTAUTH_URL, VERIFICATION_URL } = process.env;

	// Usa NEXT_PUBLIC_URL ou NEXTAUTH_URL como fallback
	const baseUrl = NEXT_PUBLIC_URL || NEXTAUTH_URL;

	if (!MAILER_SENDER_EMAIL || !VERIFICATION_SUBJECT || !baseUrl || !VERIFICATION_URL) {
		return {
			error: "Configuração de ambiente insuficiente para envio de e-mail.",
		};
	}

	const verificationUrl = `${baseUrl}${VERIFICATION_URL}?token=${token}`;
	const { email, name } = user;
	try {
		const { data, error } = await mail().emails.send({
			from: MAILER_SENDER_EMAIL,
			to: email,
			subject: VERIFICATION_SUBJECT,
			html: verificationTemplate(verificationUrl, name || undefined),
		});

		if (error)
			return {
				error,
			};
		return {
			success: "E-mail enviado com sucesso",
		};
	} catch (error) {
		return { error };
	}
};

/**
 * This method updates the user's record with the date the email was verified.
 *
 * @param {string} token - The verification token.
 * @returns {Promise<{ error?: string, success?: string }>} An object indicating the result of the operation.
 */
export const verifyToken = async (token: string) => {
	const existingToken = await findVerificationTokenbyToken(token);
	if (!existingToken) {
		return {
			error: "Código de verificação não encontrado",
		};
	}

	const isTokenExpired = new Date(existingToken.expires) < new Date();
	if (isTokenExpired) {
		return {
			error: "Código de verificação expirado",
		};
	}

	const user = await findUserbyEmail(existingToken.email);
	if (!user) {
		return {
			error: "Usuário não encontrado",
		};
	}

	try {
		await getPrismaInstance().user.update({
			where: { id: user.id },
			data: {
				emailVerified: new Date(),
			},
		});

		await getPrismaInstance().verificationToken.delete({
			where: {
				id: existingToken.id,
			},
		});

		return {
			success: "E-mail verificado",
		};
	} catch (err) {
		return { error: "Erro ao atualizar verificação de e-mail" };
	}
};
