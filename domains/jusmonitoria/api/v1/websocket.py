"""WebSocket endpoint for real-time notifications."""

import json
from typing import Dict, Set
from uuid import UUID

import structlog
from fastapi import WebSocket, WebSocketDisconnect, Depends, Query, HTTPException, status
from jose import JWTError

from domains.jusmonitoria.auth.jwt import verify_token

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time notifications."""

    def __init__(self):
        # Map of tenant_id -> set of WebSocket connections
        self.active_connections: Dict[UUID, Set[WebSocket]] = {}
        # Map of WebSocket -> tenant_id for cleanup
        self.connection_tenants: Dict[WebSocket, UUID] = {}

    async def connect(self, websocket: WebSocket, tenant_id: UUID):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        
        self.active_connections[tenant_id].add(websocket)
        self.connection_tenants[websocket] = tenant_id
        
        logger.info(
            "websocket_connected",
            tenant_id=str(tenant_id),
            total_connections=len(self.active_connections[tenant_id]),
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        tenant_id = self.connection_tenants.get(websocket)
        
        if tenant_id and tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)
            
            # Clean up empty tenant sets
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]
        
        if websocket in self.connection_tenants:
            del self.connection_tenants[websocket]
        
        logger.info(
            "websocket_disconnected",
            tenant_id=str(tenant_id) if tenant_id else None,
        )

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific WebSocket connection."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error("failed_to_send_message", error=str(e))

    async def broadcast_to_tenant(self, message: dict, tenant_id: UUID):
        """Broadcast a message to all connections for a specific tenant."""
        if tenant_id not in self.active_connections:
            logger.debug("no_connections_for_tenant", tenant_id=str(tenant_id))
            return
        
        # Create a copy of the set to avoid modification during iteration
        connections = list(self.active_connections[tenant_id])
        
        for connection in connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(
                    "failed_to_broadcast_message",
                    tenant_id=str(tenant_id),
                    error=str(e),
                )
                # Remove failed connection
                self.disconnect(connection)


# Global connection manager instance
manager = ConnectionManager()


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
    await manager.connect(websocket, tenant_id)
    
    try:
        # Send initial connection confirmation
        await manager.send_personal_message(
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
                    await manager.send_personal_message(
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
    
    await manager.broadcast_to_tenant(notification_data, tenant_id)
    
    logger.info(
        "notification_sent",
        tenant_id=str(tenant_id),
        notification_type=notification_type,
        notification_id=notification_id,
    )
