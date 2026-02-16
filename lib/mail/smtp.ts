import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function getSmtpTransporter(): Transporter {
	if (!transporter) {
		const host = process.env.SMTP_ADDRESS;
		const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
		const user = process.env.SMTP_USERNAME;
		const pass = process.env.SMTP_PASSWORD;

		if (!host || !user || !pass) {
			throw new Error("SMTP_ADDRESS, SMTP_USERNAME e SMTP_PASSWORD são obrigatórios");
		}

		transporter = nodemailer.createTransport({
			host,
			port,
			secure: port === 465,
			auth: { user, pass },
			tls: {
				rejectUnauthorized: process.env.SMTP_OPENSSL_VERIFY_MODE === "peer",
			},
			pool: true,
			maxConnections: 5,
		});
	}
	return transporter;
}

export interface SendEmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	from?: string;
	replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
	const transport = getSmtpTransporter();
	const from = options.from || process.env.MAILER_SENDER_EMAIL || process.env.SMTP_USERNAME;

	await transport.sendMail({
		from,
		to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
		subject: options.subject,
		html: options.html,
		replyTo: options.replyTo,
	});

	console.log(`Email enviado para: ${Array.isArray(options.to) ? options.to.join(", ") : options.to}`);
}

export async function sendBudgetAlertEmail(
	recipient: string,
	budgetName: string,
	currentSpending: number,
	limitUSD: number,
	percentage: number,
	alertType: "WARNING" | "EXCEEDED",
): Promise<void> {
	const subject =
		alertType === "EXCEEDED" ? `Orcamento Excedido: ${budgetName}` : `Alerta de Orcamento: ${budgetName}`;

	const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${alertType === "EXCEEDED" ? "#dc2626" : "#f59e0b"};">
        ${alertType === "EXCEEDED" ? "Orcamento Excedido" : "Alerta de Orcamento"}
      </h2>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>${budgetName}</h3>
        <p><strong>Gasto Atual:</strong> $${currentSpending.toFixed(2)} USD</p>
        <p><strong>Limite:</strong> $${limitUSD.toFixed(2)} USD</p>
        <p><strong>Porcentagem:</strong> ${(percentage * 100).toFixed(1)}%</p>
        <p><strong>Data/Hora:</strong> ${new Date().toLocaleString("pt-BR")}</p>
      </div>
      ${
				alertType === "EXCEEDED"
					? `
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #dc2626; margin: 0;">
            <strong>Acao Tomada:</strong> Controles automaticos foram aplicados para limitar gastos adicionais.
          </p>
        </div>
      `
					: ""
			}
      <p style="color: #6b7280; font-size: 14px;">
        Este e um alerta automatico do sistema de monitoramento de custos.
        Para mais detalhes, acesse o dashboard administrativo.
      </p>
    </div>
  `;

	await sendEmail({ to: recipient, subject, html });
}
