"""Notification service for creating and sending notifications."""

from datetime import datetime
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.api.v1.websocket import send_notification_to_tenant
from domains.jusmonitoria.db.models.notification import Notification, NotificationType

logger = structlog.get_logger(__name__)


class NotificationService:
    """Service for managing notifications."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_urgent_movement_notification(
        self,
        tenant_id: UUID,
        user_id: UUID,
        process_id: UUID,
        process_number: str,
        movement_description: str,
    ) -> Notification:
        """
        Create notification for urgent process movement.

        Args:
            tenant_id: Tenant ID
            user_id: User to notify
            process_id: Process ID
            process_number: CNJ process number
            movement_description: Description of the movement

        Returns:
            Created notification
        """
        notification = Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            type=NotificationType.URGENT_MOVEMENT,
            title=f"Movimentação Urgente - Processo {process_number}",
            message=movement_description[:200],  # Truncate to 200 chars
            notification_metadata={
                "process_id": str(process_id),
                "process_number": process_number,
            },
        )

        self.session.add(notification)
        await self.session.commit()
        await self.session.refresh(notification)

        # Send via WebSocket
        await self._send_websocket_notification(notification)

        logger.info(
            "urgent_movement_notification_created",
            notification_id=str(notification.id),
            tenant_id=str(tenant_id),
            user_id=str(user_id),
            process_id=str(process_id),
        )

        return notification

    async def create_qualified_lead_notification(
        self,
        tenant_id: UUID,
        user_id: UUID,
        lead_id: UUID,
        lead_name: str,
        score: int,
    ) -> Notification:
        """
        Create notification for automatically qualified lead.

        Args:
            tenant_id: Tenant ID
            user_id: User to notify
            lead_id: Lead ID
            lead_name: Lead name
            score: Lead score

        Returns:
            Created notification
        """
        notification = Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            type=NotificationType.QUALIFIED_LEAD,
            title="Novo Lead Qualificado",
            message=f"{lead_name} foi qualificado automaticamente com score {score}",
            notification_metadata={
                "lead_id": str(lead_id),
                "lead_name": lead_name,
                "score": score,
            },
        )

        self.session.add(notification)
        await self.session.commit()
        await self.session.refresh(notification)

        # Send via WebSocket
        await self._send_websocket_notification(notification)

        logger.info(
            "qualified_lead_notification_created",
            notification_id=str(notification.id),
            tenant_id=str(tenant_id),
            user_id=str(user_id),
            lead_id=str(lead_id),
        )

        return notification

    async def create_briefing_available_notification(
        self,
        tenant_id: UUID,
        user_id: UUID,
        briefing_date: str,
        urgent_count: int,
        attention_count: int,
    ) -> Notification:
        """
        Create notification for available morning briefing.

        Args:
            tenant_id: Tenant ID
            user_id: User to notify
            briefing_date: Date of the briefing
            urgent_count: Number of urgent items
            attention_count: Number of items needing attention

        Returns:
            Created notification
        """
        notification = Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            type=NotificationType.BRIEFING_AVAILABLE,
            title="Briefing Matinal Disponível",
            message=f"Seu briefing de {briefing_date} está pronto: {urgent_count} urgentes, {attention_count} precisam atenção",
            notification_metadata={
                "briefing_date": briefing_date,
                "urgent_count": urgent_count,
                "attention_count": attention_count,
            },
        )

        self.session.add(notification)
        await self.session.commit()
        await self.session.refresh(notification)

        # Send via WebSocket
        await self._send_websocket_notification(notification)

        logger.info(
            "briefing_available_notification_created",
            notification_id=str(notification.id),
            tenant_id=str(tenant_id),
            user_id=str(user_id),
        )

        return notification

    async def create_mention_notification(
        self,
        tenant_id: UUID,
        user_id: UUID,
        mentioned_by_user_id: UUID,
        mentioned_by_name: str,
        client_id: UUID,
        client_name: str,
        note_preview: str,
    ) -> Notification:
        """
        Create notification for user mention in note.

        Args:
            tenant_id: Tenant ID
            user_id: User who was mentioned
            mentioned_by_user_id: User who created the mention
            mentioned_by_name: Name of user who mentioned
            client_id: Client ID
            client_name: Client name
            note_preview: Preview of the note content

        Returns:
            Created notification
        """
        notification = Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            type=NotificationType.MENTION,
            title=f"{mentioned_by_name} mencionou você",
            message=f"Em nota sobre {client_name}: {note_preview[:100]}",
            notification_metadata={
                "mentioned_by_user_id": str(mentioned_by_user_id),
                "mentioned_by_name": mentioned_by_name,
                "client_id": str(client_id),
                "client_name": client_name,
            },
        )

        self.session.add(notification)
        await self.session.commit()
        await self.session.refresh(notification)

        # Send via WebSocket
        await self._send_websocket_notification(notification)

        logger.info(
            "mention_notification_created",
            notification_id=str(notification.id),
            tenant_id=str(tenant_id),
            user_id=str(user_id),
            mentioned_by_user_id=str(mentioned_by_user_id),
        )

        return notification

    async def mark_as_read(self, notification_id: UUID) -> Notification:
        """
        Mark a notification as read.

        Args:
            notification_id: Notification ID

        Returns:
            Updated notification
        """
        notification = await self.session.get(Notification, notification_id)

        if not notification:
            raise ValueError(f"Notification {notification_id} not found")

        notification.read = True
        notification.read_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(notification)

        logger.info(
            "notification_marked_as_read",
            notification_id=str(notification_id),
        )

        return notification

    async def mark_all_as_read(self, tenant_id: UUID, user_id: UUID) -> int:
        """
        Mark all notifications as read for a user.

        Args:
            tenant_id: Tenant ID
            user_id: User ID

        Returns:
            Number of notifications marked as read
        """
        from sqlalchemy import update

        result = await self.session.execute(
            update(Notification)
            .where(
                Notification.tenant_id == tenant_id,
                Notification.user_id == user_id,
                Notification.read.is_(False),
            )
            .values(read=True, read_at=datetime.utcnow())
        )

        await self.session.commit()

        count = result.rowcount

        logger.info(
            "all_notifications_marked_as_read",
            tenant_id=str(tenant_id),
            user_id=str(user_id),
            count=count,
        )

        return count

    async def _send_websocket_notification(self, notification: Notification):
        """Send notification via WebSocket."""
        try:
            await send_notification_to_tenant(
                tenant_id=notification.tenant_id,
                notification_type=notification.type.value,
                title=notification.title,
                message=notification.message,
                notification_id=str(notification.id),
                metadata=notification.notification_metadata,
            )
        except Exception as e:
            logger.error(
                "failed_to_send_websocket_notification",
                notification_id=str(notification.id),
                error=str(e),
            )
