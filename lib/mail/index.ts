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
				try {
					const transport = getSmtpTransporter();
					const info = await transport.sendMail({
						from: options.from,
						to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
						subject: options.subject,
						html: options.html,
						replyTo: options.replyTo,
					});
					return { data: { id: info.messageId }, error: null };
				} catch (error) {
					return { data: null, error };
				}
			},
		},
	};
}

export default getMailInstance;
export { sendBudgetAlertEmail, sendEmail };
export type { SendEmailOptions };
