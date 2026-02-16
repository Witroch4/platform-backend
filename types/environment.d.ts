declare global {
	namespace NodeJS {
		interface ProcessEnv {
			DATABASE_URL: string;
			NEXTAUTH_SECRET: string;
			NEXT_PUBLIC_URL: string;
			VERIFICATION_URL: string;
			VERIFICATION_SUBJECT: string;
			AUTH_LOGIN_REDIRECT: string;
			OTP_SUBJECT: string;
			RESET_PASSWORD_URL: string;
			RESET_PASSWORD_SUBJECT: string;
			// SMTP (estilo Chatwoot)
			MAILER_SENDER_EMAIL: string;
			SMTP_ADDRESS: string;
			SMTP_PORT: string;
			SMTP_USERNAME: string;
			SMTP_PASSWORD: string;
			SMTP_DOMAIN?: string;
			SMTP_AUTHENTICATION?: string;
			SMTP_ENABLE_STARTTLS_AUTO?: string;
			SMTP_OPENSSL_VERIFY_MODE?: string;
		}
	}
}
export type {};
