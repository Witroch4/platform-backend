/**
 * Templates de e-mail HTML profissionais - Socialwise
 * Compatível com: Gmail, Outlook, Yahoo, Apple Mail, Hotmail
 */

const colors = {
	indigo: "#4f46e5",
	indigoDark: "#3730a3",
	coral: "#f97316",
	slate900: "#0f172a",
	slate700: "#334155",
	slate500: "#64748b",
	slate300: "#cbd5e1",
	slate100: "#f1f5f9",
	white: "#ffffff",
	warningBg: "#fef3c7",
	warningBorder: "#fbbf24",
	warningText: "#92400e",
};

function wrapTemplate(content: string, icon: string): string {
	return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Socialwise</title>
  <!--[if mso]>
  <style type="text/css">
    table, td { border-collapse: collapse; }
    .btn { padding: 16px 40px !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${colors.slate100}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Outer Container -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${colors.slate100};">
    <tr>
      <td align="center" style="padding: 48px 20px;">

        <!-- Card Container -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: ${colors.white}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td align="center" style="background-color: ${colors.indigo}; padding: 32px 40px;">
              <span style="font-size: 26px; font-weight: 700; color: ${colors.white}; letter-spacing: -0.5px;">Social<span style="color: ${colors.coral};">wise</span></span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Icon -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="width: 64px; height: 64px; background-color: ${colors.slate100}; border-radius: 16px; font-size: 28px; line-height: 64px; text-align: center;">${icon}</div>
                  </td>
                </tr>
              </table>

              ${content}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: ${colors.slate100}; border-top: 1px solid ${colors.slate300};">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: ${colors.slate500}; text-align: center;">
                <strong style="color: ${colors.slate700};">Socialwise</strong> - Gestao inteligente de redes sociais
              </p>
              <p style="margin: 0; font-size: 12px; color: ${colors.slate500}; text-align: center;">
                Este e-mail foi enviado automaticamente. Por favor, nao responda.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;
}

export function resetPasswordTemplate(resetUrl: string, userName?: string): string {
	const greeting = userName ? `Ola, ${userName}!` : "Ola!";

	return wrapTemplate(
		`
      <!-- Title -->
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${colors.slate900}; text-align: center; letter-spacing: -0.5px;">Redefinir senha</h1>
      <p style="margin: 0 0 32px 0; font-size: 15px; color: ${colors.slate500}; text-align: center;">Solicitacao de nova senha recebida</p>

      <!-- Body -->
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};"><strong style="color: ${colors.slate900};">${greeting}</strong></p>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};">Recebemos uma solicitacao para redefinir a senha da sua conta Socialwise. Clique no botao abaixo para criar uma nova senha segura.</p>

      <!-- Button -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: ${colors.indigo}; color: ${colors.white}; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Redefinir minha senha</a>
          </td>
        </tr>
      </table>

      <!-- Warning Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color: ${colors.warningBg}; border-left: 4px solid ${colors.warningBorder}; border-radius: 8px; padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: ${colors.warningText};"><strong>Atencao:</strong> Este link expira em <strong>2 horas</strong>. Se voce nao solicitou a redefinicao de senha, pode ignorar este e-mail com seguranca.</p>
          </td>
        </tr>
      </table>

      <!-- Link Fallback -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
        <tr>
          <td style="background-color: ${colors.slate100}; border-radius: 8px; padding: 16px;">
            <p style="margin: 0 0 8px 0; font-size: 11px; color: ${colors.slate500}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Link alternativo</p>
            <p style="margin: 0; font-size: 12px; word-break: break-all; color: ${colors.indigo};">${resetUrl}</p>
          </td>
        </tr>
      </table>
    `,
		"🔐",
	);
}

export function verificationTemplate(verificationUrl: string, userName?: string): string {
	const greeting = userName ? `Ola, ${userName}!` : "Ola!";

	return wrapTemplate(
		`
      <!-- Title -->
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${colors.slate900}; text-align: center; letter-spacing: -0.5px;">Confirme seu e-mail</h1>
      <p style="margin: 0 0 32px 0; font-size: 15px; color: ${colors.slate500}; text-align: center;">Falta apenas um passo para comecar</p>

      <!-- Body -->
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};"><strong style="color: ${colors.slate900};">${greeting}</strong></p>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};">Obrigado por se cadastrar na Socialwise! Para ativar sua conta e comecar a gerenciar suas redes sociais de forma inteligente, confirme seu endereco de e-mail.</p>

      <!-- Button -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 24px 0;">
            <a href="${verificationUrl}" style="display: inline-block; background-color: ${colors.indigo}; color: ${colors.white}; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Confirmar meu e-mail</a>
          </td>
        </tr>
      </table>

      <!-- Info Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color: ${colors.slate100}; border-left: 4px solid ${colors.indigo}; border-radius: 8px; padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: ${colors.slate700};"><strong style="color: ${colors.slate900};">O que vem a seguir?</strong> Apos a confirmacao, voce tera acesso completo ao dashboard, agendamento de posts, analytics e todas as ferramentas da plataforma.</p>
          </td>
        </tr>
      </table>

      <!-- Link Fallback -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
        <tr>
          <td style="background-color: ${colors.slate100}; border-radius: 8px; padding: 16px;">
            <p style="margin: 0 0 8px 0; font-size: 11px; color: ${colors.slate500}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Link alternativo</p>
            <p style="margin: 0; font-size: 12px; word-break: break-all; color: ${colors.indigo};">${verificationUrl}</p>
          </td>
        </tr>
      </table>
    `,
		"✉️",
	);
}

export function otpTemplate(code: string, userName?: string): string {
	const greeting = userName ? `Ola, ${userName}!` : "Ola!";

	return wrapTemplate(
		`
      <!-- Title -->
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${colors.slate900}; text-align: center; letter-spacing: -0.5px;">Codigo de verificacao</h1>
      <p style="margin: 0 0 32px 0; font-size: 15px; color: ${colors.slate500}; text-align: center;">Use este codigo para verificar sua identidade</p>

      <!-- Body -->
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};"><strong style="color: ${colors.slate900};">${greeting}</strong></p>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};">Utilize o codigo abaixo para completar sua verificacao. Este codigo e valido por tempo limitado.</p>

      <!-- Code Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
        <tr>
          <td align="center" style="background-color: ${colors.slate100}; border: 2px dashed ${colors.slate300}; border-radius: 16px; padding: 32px;">
            <p style="margin: 0 0 8px 0; font-size: 11px; color: ${colors.slate500}; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Seu codigo</p>
            <p style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 12px; color: ${colors.indigo}; font-family: 'Courier New', Courier, monospace;">${code}</p>
          </td>
        </tr>
      </table>

      <!-- Warning Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color: ${colors.warningBg}; border-left: 4px solid ${colors.warningBorder}; border-radius: 8px; padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: ${colors.warningText};"><strong>Importante:</strong> Este codigo expira em <strong>10 minutos</strong>. Por seguranca, nunca compartilhe este codigo com outras pessoas.</p>
          </td>
        </tr>
      </table>
    `,
		"🔑",
	);
}

export function welcomeTemplate(userName: string, loginUrl: string): string {
	return wrapTemplate(
		`
      <!-- Title -->
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${colors.slate900}; text-align: center; letter-spacing: -0.5px;">Bem-vindo a Socialwise!</h1>
      <p style="margin: 0 0 32px 0; font-size: 15px; color: ${colors.slate500}; text-align: center;">Sua conta foi criada com sucesso</p>

      <!-- Body -->
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};"><strong style="color: ${colors.slate900};">Ola, ${userName}!</strong></p>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: ${colors.slate700};">Estamos muito felizes em ter voce conosco. A Socialwise vai transformar a forma como voce gerencia suas redes sociais - com inteligencia artificial, automacao e insights poderosos.</p>

      <!-- Button -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 24px 0;">
            <a href="${loginUrl}" style="display: inline-block; background-color: ${colors.indigo}; color: ${colors.white}; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Acessar minha conta</a>
          </td>
        </tr>
      </table>

      <!-- Info Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color: ${colors.slate100}; border-left: 4px solid ${colors.indigo}; border-radius: 8px; padding: 16px 20px;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: ${colors.slate900};"><strong>Primeiros passos:</strong></p>
            <p style="margin: 0 0 4px 0; font-size: 14px; color: ${colors.slate700};">1. Conecte suas redes sociais</p>
            <p style="margin: 0 0 4px 0; font-size: 14px; color: ${colors.slate700};">2. Explore o dashboard de analytics</p>
            <p style="margin: 0; font-size: 14px; color: ${colors.slate700};">3. Agende seu primeiro post</p>
          </td>
        </tr>
      </table>
    `,
		"🚀",
	);
}
