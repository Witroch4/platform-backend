import { getSmtpTransporter, sendBudgetAlertEmail, sendEmail } from "./smtp";
import type { SendEmailOptions } from "./smtp";

// Interface compativel com codigo existente (mail().emails.send())
function getMailInstance() {
	return {
		emails: {
			send: async (options: {
				from: string;
				to: string | string[];
				subject: string;
				html: string;
				replyTo?: string;
			}) => {
				const recipient = Array.isArray(options.to) ? options.to.join(", ") : options.to;
				console.log(`[mail] Tentando enviar e-mail para: ${recipient}, subject: ${options.subject}`);

				try {
					const transport = getSmtpTransporter();
					const info = await transport.sendMail({
						from: options.from,
						to: recipient,
						subject: options.subject,
						html: options.html,
						replyTo: options.replyTo,
					});
					console.log(`[mail] E-mail enviado com sucesso para: ${recipient}, messageId: ${info.messageId}`);
					return { data: { id: info.messageId }, error: null };
				} catch (error) {
					console.error(`[mail] ERRO ao enviar e-mail para ${recipient}:`, error);
					return { data: null, error };
				}
			},
		},
	};
}

export default getMailInstance;
export { sendBudgetAlertEmail, sendEmail };
export type { SendEmailOptions };
