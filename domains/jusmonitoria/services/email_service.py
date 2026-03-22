"""Email service for sending transactional emails — JusMonitorIA branded templates."""

from typing import Optional

from platform_core.config import settings
from platform_core.services.email import EmailTransport


class EmailService:
    """Service for sending JusMonitorIA-branded emails using shared transport."""

    @staticmethod
    async def send_email(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """Send an email asynchronously via shared transport."""
        return await EmailTransport.send(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @staticmethod
    async def send_password_reset_email(name: str, email: str, token: str) -> bool:
        """Send password reset email."""
        reset_url = f"{settings.frontend_url}/reset-password?token={token}"

        subject = "Redefinição de senha — JusMonitorIA"

        text_content = f"""
        Olá {name},

        Recebemos uma solicitação para redefinir a senha da sua conta no JusMonitorIA.

        Acesse o link abaixo para criar uma nova senha:

        {reset_url}

        Este link expira em 1 hora.

        Se você não solicitou a redefinição de senha, ignore este e-mail.
        """

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #D4AF37;">Redefinição de Senha</h2>
            <p>Olá <strong>{name}</strong>,</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta no JusMonitorIA. Clique no botão abaixo para criar uma nova senha.</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}" style="background-color: #D4AF37; color: #0B0F19; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    Redefinir minha senha
                </a>
            </div>

            <p style="font-size: 14px; color: #666;">
                Ou copie e cole o seguinte link no seu navegador:<br>
                <a href="{reset_url}" style="color: #D4AF37;">{reset_url}</a>
            </p>

            <p style="font-size: 14px; color: #666;">
                <strong>Este link expira em 1 hora.</strong>
            </p>

            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999;">
                Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha não será alterada.
            </p>
        </div>
        """

        return await EmailTransport.send(
            to_email=email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @staticmethod
    async def send_2fa_notification_email(
        name: str,
        email: str,
        action: str,
    ) -> bool:
        """Send notification email when 2FA is activated or deactivated."""
        subject = f"Autenticação de dois fatores {action} — JusMonitorIA"

        is_enabled = action == "ativada"
        icon = "🔒" if is_enabled else "🔓"
        color = "#22c55e" if is_enabled else "#ef4444"

        text_content = f"""
        Olá {name},

        A autenticação de dois fatores (2FA) da sua conta no JusMonitorIA foi {action}.

        Se você não realizou essa alteração, entre em contato com o suporte imediatamente.
        """

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #D4AF37;">{icon} Autenticação de Dois Fatores {action.capitalize()}</h2>
            <p>Olá <strong>{name}</strong>,</p>
            <p>A autenticação de dois fatores (2FA) da sua conta no JusMonitorIA foi <strong style="color: {color};">{action}</strong>.</p>

            <div style="background-color: #f8f9fa; border-left: 4px solid {color}; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px;">
                    <strong>Status atual:</strong> 2FA {action}
                </p>
            </div>

            <p style="font-size: 14px; color: #666;">
                Se você não realizou essa alteração, entre em contato com o suporte imediatamente para proteger sua conta.
            </p>

            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999;">
                Este é um e-mail automático de segurança do JusMonitorIA. Não responda este e-mail.
            </p>
        </div>
        """

        return await EmailTransport.send(
            to_email=email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @staticmethod
    async def send_verification_email(name: str, email: str, token: str) -> bool:
        """Send verification email during registration."""
        verify_url = f"{settings.frontend_url}/verify-email?token={token}"

        subject = "Confirme seu cadastro no JusMonitorIA"

        text_content = f"""
        Olá {name},

        Obrigado por se cadastrar no JusMonitorIA. Para concluir seu registro, \
por favor acesse o link abaixo para verificar seu e-mail:

        {verify_url}

        Se você não criou esta conta, simplesmente ignore este e-mail.
        """

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #D4AF37;">Bem-vindo ao JusMonitorIA!</h2>
            <p>Olá <strong>{name}</strong>,</p>
            <p>Obrigado por escolher nossa plataforma jurídica premium. Para podermos liberar seu acesso completo, por favor, clique no botão abaixo para confirmar seu endereço de e-mail.</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{verify_url}" style="background-color: #D4AF37; color: #0B0F19; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    Confirmar meu E-mail
                </a>
            </div>

            <p style="font-size: 14px; color: #666;">
                Ou copie e cole o seguinte link no seu navegador:<br>
                <a href="{verify_url}" style="color: #D4AF37;">{verify_url}</a>
            </p>

            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999;">
                Se você não solicitou esta criação de conta, por favor ignore este e-mail.
            </p>
        </div>
        """

        return await EmailTransport.send(
            to_email=email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )
