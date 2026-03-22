"""WebSocket endpoint for real-time notifications."""

import json
from uuid import UUID

import structlog
from fastapi import WebSocket, WebSocketDisconnect, Depends, Query, HTTPException, status
from jose import JWTError

from domains.jusmonitoria.auth.jwt import verify_token
from platform_core.services.sse_manager import ConnectionManager

logger = structlog.get_logger(__name__)


# Global connection manager instance (tenant-scoped)
manager = ConnectionManager(scope_name="tenant")


async def verify_websocket_token(token: str = Query(...)) -> UUID:
    """
    Verify JWT token from WebSocket query parameter.

    Returns the tenant_id from the token.
    """
    try:
        token_data = verify_token(token, expected_type="access")
        return token_data.tenant_id

    except JWTError as e:
        logger.error("jwt_verification_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    except ValueError as e:
        logger.error("invalid_tenant_id", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid tenant_id format",
        )


async def websocket_endpoint(
    websocket: WebSocket,
    tenant_id: UUID = Depends(verify_websocket_token),
):
    """
    WebSocket endpoint for real-time notifications.

    Authentication is done via JWT token in query parameter:
    ws://localhost:8000/ws?token=<jwt_token>

    The token must contain a valid tenant_id claim.
    """
    await websocket.accept()
    await manager.connect(websocket, str(tenant_id))

    try:
        # Send initial connection confirmation
        await manager.send_to(
            {
                "type": "connection_established",
                "tenant_id": str(tenant_id),
                "message": "Connected to notification service",
            },
            websocket,
        )

        # Keep connection alive and handle incoming messages
        while True:
            # Wait for messages from client (e.g., ping/pong for keepalive)
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                # Handle ping/pong for keepalive
                if message.get("type") == "ping":
                    await manager.send_to(
                        {"type": "pong", "timestamp": message.get("timestamp")},
                        websocket,
                    )

                # Log other message types for debugging
                else:
                    logger.debug(
                        "websocket_message_received",
                        tenant_id=str(tenant_id),
                        message_type=message.get("type"),
                    )

            except json.JSONDecodeError:
                logger.warning(
                    "invalid_json_received",
                    tenant_id=str(tenant_id),
                    data=data,
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("websocket_client_disconnected", tenant_id=str(tenant_id))

    except Exception as e:
        logger.error(
            "websocket_error",
            tenant_id=str(tenant_id),
            error=str(e),
            error_type=type(e).__name__,
        )
        manager.disconnect(websocket)


async def send_notification_to_tenant(
    tenant_id: UUID,
    notification_type: str,
    title: str,
    message: str,
    notification_id: str,
    metadata: dict = None,
):
    """
    Send a notification to all WebSocket connections for a tenant.

    This function should be called from workers or API endpoints
    when a new notification needs to be sent.
    """
    notification_data = {
        "type": "notification",
        "notification_type": notification_type,
        "id": notification_id,
        "title": title,
        "message": message,
        "created_at": None,  # Will be set by the caller
        "metadata": metadata or {},
    }

    await manager.broadcast(notification_data, str(tenant_id))

    logger.info(
        "notification_sent",
        tenant_id=str(tenant_id),
        notification_type=notification_type,
        notification_id=notification_id,
    )
