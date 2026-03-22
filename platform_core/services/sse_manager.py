"""Generic real-time connection manager for WebSocket and SSE.

Manages connections scoped by a string key (tenant_id, lead_id, etc.).
Accepts any object that implements ``send_text(data: str)``.
"""

import json
from typing import Any, Protocol, runtime_checkable

import structlog

logger = structlog.get_logger(__name__)


@runtime_checkable
class RealTimeConnection(Protocol):
    """Minimal contract a connection must satisfy."""

    async def send_text(self, data: str) -> None: ...


class ConnectionManager:
    """Manages real-time connections scoped by a string key.

    Args:
        scope_name: Label for structured logging (e.g. ``"tenant"``, ``"lead"``).
    """

    def __init__(self, scope_name: str = "scope") -> None:
        self.scope_name = scope_name
        self.active_connections: dict[str, set[RealTimeConnection]] = {}
        self.connection_scopes: dict[RealTimeConnection, str] = {}

    async def connect(self, connection: RealTimeConnection, scope_key: str) -> None:
        """Register a new connection under *scope_key*."""
        if scope_key not in self.active_connections:
            self.active_connections[scope_key] = set()

        self.active_connections[scope_key].add(connection)
        self.connection_scopes[connection] = scope_key

        logger.info(
            "connection_established",
            **{self.scope_name: scope_key},
            total=len(self.active_connections[scope_key]),
        )

    def disconnect(self, connection: RealTimeConnection) -> None:
        """Remove a connection."""
        scope_key = self.connection_scopes.pop(connection, None)

        if scope_key and scope_key in self.active_connections:
            self.active_connections[scope_key].discard(connection)
            if not self.active_connections[scope_key]:
                del self.active_connections[scope_key]

        logger.info(
            "connection_closed",
            **{self.scope_name: scope_key},
        )

    async def send_to(self, message: dict[str, Any], connection: RealTimeConnection) -> None:
        """Send a message to a single connection."""
        try:
            await connection.send_text(json.dumps(message))
        except Exception as e:
            logger.error("send_failed", error=str(e))

    async def broadcast(self, message: dict[str, Any], scope_key: str) -> None:
        """Broadcast a message to all connections under *scope_key*."""
        if scope_key not in self.active_connections:
            logger.debug("no_connections", **{self.scope_name: scope_key})
            return

        connections = list(self.active_connections[scope_key])

        for conn in connections:
            try:
                await conn.send_text(json.dumps(message))
            except Exception as e:
                logger.error(
                    "broadcast_failed",
                    **{self.scope_name: scope_key},
                    error=str(e),
                )
                self.disconnect(conn)
