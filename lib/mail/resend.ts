import { Resend } from "resend";

let resend: Resend | null = null;

function getResendInstance(): Resend {
  if (!resend) {
    if (!process.env.AUTH_RESEND_KEY) {
      throw new Error("AUTH_RESEND_KEY environment variable is required");
    }
    resend = new Resend(process.env.AUTH_RESEND_KEY);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/**
 * Envia email usando Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  try {
    const { to, subject, html, from, replyTo } = options;
    
    const fromAddress = from || process.env.FROM_EMAIL || 'noreply@socialwise.com.br';
    
    const resendInstance = getResendInstance();
    await resendInstance.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      replyTo,
    });
    
    console.log(`📧 Email enviado com sucesso para: ${Array.isArray(to) ? to.join(', ') : to}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error);
    throw error;
  }
}

/**
 * Envia email de alerta de orçamento
 */
export async function sendBudgetAlertEmail(
  recipient: string,
  budgetName: string,
  currentSpending: number,
  limitUSD: number,
  percentage: number,
  alertType: 'WARNING' | 'EXCEEDED'
): Promise<void> {
  const subject = alertType === 'EXCEEDED' 
    ? `🚨 Orçamento Excedido: ${budgetName}`
    : `⚠️ Alerta de Orçamento: ${budgetName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${alertType === 'EXCEEDED' ? '#dc2626' : '#f59e0b'};">
        ${alertType === 'EXCEEDED' ? '🚨 Orçamento Excedido' : '⚠️ Alerta de Orçamento'}
      </h2>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>${budgetName}</h3>
        <p><strong>Gasto Atual:</strong> $${currentSpending.toFixed(2)} USD</p>
        <p><strong>Limite:</strong> $${limitUSD.toFixed(2)} USD</p>
        <p><strong>Porcentagem:</strong> ${(percentage * 100).toFixed(1)}%</p>
        <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
      </div>
      
      ${alertType === 'EXCEEDED' ? `
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #dc2626; margin: 0;">
            <strong>Ação Tomada:</strong> Controles automáticos foram aplicados para limitar gastos adicionais.
          </p>
        </div>
      ` : ''}
      
      <p style="color: #6b7280; font-size: 14px;">
        Este é um alerta automático do sistema de monitoramento de custos.
        Para mais detalhes, acesse o dashboard administrativo.
      </p>
    </div>
  `;

  await sendEmail({
    to: recipient,
    subject,
    html,
  });
}

export default resend;