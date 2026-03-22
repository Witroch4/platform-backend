"""Async email transport using aiosmtplib — domain-agnostic SMTP sender."""

from email.message import EmailMessage

import structlog
from aiosmtplib import SMTP

from platform_core.config import settings

logger = structlog.get_logger(__name__)


class EmailTransport:
    """Domain-agnostic async SMTP email transport.

    Provides a single ``send()`` method.  Domain-specific templates
    (password reset, 2FA, verification) live in the respective domain
    service layer and call this transport for delivery.
    """

    @staticmethod
    async def send(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
        from_email: str | None = None,
    ) -> bool:
        """Send an email asynchronously.

        Args:
            to_email: Full recipient email address.
            subject: Email subject.
            html_content: HTML body content.
            text_content: Optional plain text body content.
            from_email: Sender address (defaults to ``settings.mailer_sender_email``).

        Returns:
            ``True`` if sent successfully, ``False`` otherwise.
        """
        sender = from_email or settings.mailer_sender_email

        if not settings.smtp_username or not settings.smtp_password:
            logger.warning(
                "smtp_credentials_not_configured",
                to=to_email,
                subject=subject,
            )
            return True

        message = EmailMessage()
        message["From"] = sender
        message["To"] = to_email
        message["Subject"] = subject

        if text_content:
            message.set_content(text_content)

        message.add_alternative(html_content, subtype="html")

        try:
            smtp_client = SMTP(
                hostname=settings.smtp_address,
                port=settings.smtp_port,
                use_tls=False,
            )

            await smtp_client.connect()

            if settings.smtp_enable_starttls_auto:
                await smtp_client.starttls()

            await smtp_client.login(settings.smtp_username, settings.smtp_password)
            await smtp_client.send_message(message)
            await smtp_client.quit()

            logger.info("email_sent", to=to_email, subject=subject)
            return True

        except Exception as e:
            logger.error("email_send_failed", to=to_email, error=str(e))
            return False
