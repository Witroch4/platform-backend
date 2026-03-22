"""API endpoints for notifications."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_user
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.notification import Notification
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.services.notification_service import NotificationService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def serialize_notification(notification: Notification) -> dict:
    """Serialize a notification model for API responses."""
    return {
        "id": str(notification.id),
        "type": notification.type.value,
        "title": notification.title,
        "message": notification.message,
        "read": notification.read,
        "created_at": notification.created_at.isoformat(),
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "metadata": notification.notification_metadata or {},
    }


@router.get("")
async def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get notifications for the current user.

    Args:
        skip: Number of notifications to skip
        limit: Maximum number of notifications to return
        unread_only: If True, only return unread notifications
        current_user: Current authenticated user
        session: Database session

    Returns:
        List of notifications and unread count
    """
    tenant_id = current_user.tenant_id
    user_id = current_user.id

    # Build query
    query = select(Notification).where(
        Notification.tenant_id == tenant_id,
        Notification.user_id == user_id,
    )

    if unread_only:
        query = query.where(Notification.read.is_(False))

    query = query.order_by(Notification.created_at.desc())
    query = query.offset(skip).limit(limit)

    # Execute query
    result = await session.execute(query)
    notifications = result.scalars().all()

    # Get unread count
    unread_query = select(func.count()).where(
        Notification.tenant_id == tenant_id,
        Notification.user_id == user_id,
        Notification.read.is_(False),
    )
    unread_result = await session.execute(unread_query)
    unread_count = unread_result.scalar()

    return {
        "notifications": [serialize_notification(notification) for notification in notifications],
        "unread_count": unread_count,
        "total": len(notifications),
    }


@router.post("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Mark a notification as read.

    Args:
        notification_id: Notification ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Updated notification
    """
    notification = await session.get(Notification, notification_id)

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found",
        )

    if notification.tenant_id != current_user.tenant_id or notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this notification",
        )

    service = NotificationService(session)
    updated_notification = await service.mark_as_read(notification_id)

    return {
        "id": str(updated_notification.id),
        "read": updated_notification.read,
        "read_at": updated_notification.read_at.isoformat()
        if updated_notification.read_at
        else None,
    }


@router.post("/read-all")
async def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Mark all notifications as read for the current user.

    Args:
        current_user: Current authenticated user
        session: Database session

    Returns:
        Number of notifications marked as read
    """
    service = NotificationService(session)

    count = await service.mark_all_as_read(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
    )

    return {
        "marked_as_read": count,
        "message": f"{count} notifications marked as read",
    }


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get count of unread notifications.

    Args:
        current_user: Current authenticated user
        session: Database session

    Returns:
        Unread notification count
    """
    tenant_id = current_user.tenant_id
    user_id = current_user.id

    query = select(func.count()).where(
        Notification.tenant_id == tenant_id,
        Notification.user_id == user_id,
        Notification.read.is_(False),
    )

    result = await session.execute(query)
    count = result.scalar()

    return {
        "unread_count": count,
    }
