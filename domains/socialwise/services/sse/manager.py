"""Socialwise SSE connection manager — user-scoped, Redis pub/sub backed.

Port of: lib/sse-manager.ts

Architecture:
- In-memory connection tracking per user (asyncio.Queue per connection).
- Redis SUBSCRIBE for per-lead channels (ADMIN users).
- Redis PSUBSCRIBE sse:* for SUPERADMIN users.
- 25s heartbeat keep-alive comments.
- Lazy lead lookup when a message arrives for an untracked lead.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

SSE_CHANNEL_PREFIX = "sse:"
HEARTBEAT_INTERVAL_S = 25


class SseConnection:
    """A single SSE connection backed by an asyncio.Queue."""

    __slots__ = ("queue", "connection_id", "user_id", "closed")

    def __init__(self, connection_id: str, user_id: str) -> None:
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.connection_id = connection_id
        self.user_id = user_id
        self.closed = False

    def enqueue(self, data: str) -> bool:
        if self.closed:
            return False
        try:
            self.queue.put_nowait(data)
            return True
        except asyncio.QueueFull:
            return False

    def close(self) -> None:
        self.closed = True
        # Push a sentinel so the generator unblocks
        try:
            self.queue.put_nowait("")
        except asyncio.QueueFull:
            pass


class SocialwiseSseManager:
    """Singleton SSE manager for the Socialwise domain."""

    def __init__(self) -> None:
        # userId -> {connId -> SseConnection}
        self._connections_by_user: dict[str, dict[str, SseConnection]] = {}
        # userId -> set of leadIds subscribed
        self._user_lead_channels: dict[str, set[str]] = {}
        self._super_admin_users: set[str] = set()
        self._psubscribe_active = False

        self._publisher: aioredis.Redis | None = None
        self._subscriber: aioredis.Redis | None = None
        self._pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task | None = None
        self._initialized = False

    # ── Redis lifecycle ──────────────────────────────────────────────────

    async def _ensure_initialized(self) -> None:
        if self._initialized:
            return

        redis_url = str(settings.redis_url)
        self._publisher = aioredis.from_url(redis_url, decode_responses=True)
        self._subscriber = aioredis.from_url(redis_url, decode_responses=True)
        self._pubsub = self._subscriber.pubsub()
        self._initialized = True

        # Start the listener loop
        self._listener_task = asyncio.create_task(self._listen_loop())
        logger.info("sse_manager_initialized")

    async def _listen_loop(self) -> None:
        """Background task that reads Redis pub/sub messages and routes them."""
        assert self._pubsub is not None
        while True:
            try:
                msg = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if msg is None:
                    continue
                msg_type = msg.get("type")
                channel: str = msg.get("channel", "")
                data: str = msg.get("data", "")

                if msg_type == "message":
                    lead_id = channel.removeprefix(SSE_CHANNEL_PREFIX)
                    self._deliver_to_admins(lead_id, data)
                elif msg_type == "pmessage":
                    lead_id = channel.removeprefix(SSE_CHANNEL_PREFIX)
                    self._deliver_to_super_admins(lead_id, data)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("sse_listen_loop_error")
                await asyncio.sleep(1)

    async def shutdown(self) -> None:
        """Cleanup on app shutdown."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

        # Close all connections
        for user_conns in self._connections_by_user.values():
            for conn in user_conns.values():
                conn.close()
        self._connections_by_user.clear()
        self._user_lead_channels.clear()
        self._super_admin_users.clear()
        self._psubscribe_active = False

        if self._pubsub:
            await self._pubsub.aclose()
        if self._subscriber:
            await self._subscriber.aclose()
        if self._publisher:
            await self._publisher.aclose()

        self._initialized = False
        logger.info("sse_manager_shutdown")

    # ── Delivery helpers ─────────────────────────────────────────────────

    def _deliver_to_admins(self, lead_id: str, message: str) -> None:
        """Deliver a message from a specific channel to ADMINs subscribed to it."""
        total_delivered = 0
        for user_id, lead_channels in self._user_lead_channels.items():
            if user_id in self._super_admin_users:
                continue
            if lead_id in lead_channels:
                total_delivered += self._enqueue_to_user(user_id, message)

        if total_delivered == 0:
            asyncio.create_task(self._handle_unknown_lead(lead_id, message))

    def _deliver_to_super_admins(self, lead_id: str, message: str) -> None:
        """Deliver pattern-matched messages to SUPERADMIN users."""
        for user_id in self._super_admin_users:
            self._enqueue_to_user(user_id, message)

    def _enqueue_to_user(self, user_id: str, message: str) -> int:
        user_conns = self._connections_by_user.get(user_id)
        if not user_conns:
            return 0

        success = 0
        to_remove: list[str] = []
        sse_line = f"data: {message}\n\n"

        for conn_id, conn in user_conns.items():
            if conn.enqueue(sse_line):
                success += 1
            else:
                to_remove.append(conn_id)

        for conn_id in to_remove:
            self._remove_connection_internal(user_id, conn_id)

        return success

    async def _handle_unknown_lead(self, lead_id: str, message: str) -> None:
        """Lazy lookup: find the owner of a lead and subscribe them."""
        try:
            from domains.socialwise.db.session_compat import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                from domains.socialwise.db.models.lead_oab_data import LeadOabData
                from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit

                result = await db.execute(
                    select(UsuarioChatwit.app_user_id).where(
                        UsuarioChatwit.id
                        == select(LeadOabData.usuario_chatwit_id)
                        .where(LeadOabData.id == lead_id)
                        .correlate_except(LeadOabData)
                        .scalar_subquery()
                    )
                )
                app_user_id = result.scalar_one_or_none()

            if not app_user_id:
                return

            user_channels = self._user_lead_channels.get(app_user_id)
            if user_channels is not None:
                user_channels.add(lead_id)
                if app_user_id not in self._super_admin_users and self._pubsub:
                    await self._pubsub.subscribe(f"{SSE_CHANNEL_PREFIX}{lead_id}")
                self._enqueue_to_user(app_user_id, message)
                logger.info(
                    "sse_lazy_lead_subscribed",
                    lead_id=lead_id,
                    user_id=app_user_id,
                )
        except Exception:
            logger.warning("sse_lazy_lookup_failed", lead_id=lead_id, exc_info=True)

    # ── Public API ───────────────────────────────────────────────────────

    async def add_user_connection(
        self, user_id: str, role: str, db: AsyncSession
    ) -> SseConnection:
        """Register a new SSE connection for an authenticated user.

        Returns the SseConnection whose .queue should be consumed by the stream.
        """
        await self._ensure_initialized()

        connection_id = f"user-{user_id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        is_super_admin = role == "SUPERADMIN"

        conn = SseConnection(connection_id, user_id)

        if user_id not in self._connections_by_user:
            self._connections_by_user[user_id] = {}
        self._connections_by_user[user_id][connection_id] = conn

        if is_super_admin:
            self._super_admin_users.add(user_id)
            if not self._psubscribe_active and self._pubsub:
                await self._pubsub.psubscribe(f"{SSE_CHANNEL_PREFIX}*")
                self._psubscribe_active = True
                logger.info("sse_psubscribe_activated")
        else:
            await self._subscribe_user_leads(user_id, db)
            lead_count = len(self._user_lead_channels.get(user_id, set()))
            logger.info(
                "sse_admin_connected",
                user_id=user_id,
                connection_id=connection_id,
                lead_count=lead_count,
            )

        # Welcome message
        welcome = json.dumps(
            {
                "type": "connected",
                "message": "Conexão SSE estabelecida",
                "userId": user_id,
                "connectionId": connection_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        conn.enqueue(f"data: {welcome}\n\n")

        return conn

    def remove_user_connection(self, user_id: str, connection_id: str) -> None:
        """Remove a connection when the client disconnects."""
        self._remove_connection_internal(user_id, connection_id)

    def _remove_connection_internal(self, user_id: str, connection_id: str) -> None:
        user_conns = self._connections_by_user.get(user_id)
        if not user_conns:
            return

        conn = user_conns.pop(connection_id, None)
        if conn:
            conn.close()

        if user_conns:
            return

        # Last connection for this user — clean up
        del self._connections_by_user[user_id]

        if user_id in self._super_admin_users:
            self._super_admin_users.discard(user_id)
            if not self._super_admin_users and self._psubscribe_active and self._pubsub:
                asyncio.create_task(self._safe_punsubscribe())
        else:
            user_channels = self._user_lead_channels.pop(user_id, None)
            if user_channels and self._pubsub:
                asyncio.create_task(
                    self._safe_unsubscribe_channels(user_id, user_channels)
                )

        logger.info(
            "sse_user_disconnected",
            user_id=user_id,
            connection_id=connection_id,
        )

    async def _safe_punsubscribe(self) -> None:
        try:
            if self._pubsub:
                await self._pubsub.punsubscribe(f"{SSE_CHANNEL_PREFIX}*")
                self._psubscribe_active = False
                logger.info("sse_psubscribe_deactivated")
        except Exception:
            logger.warning("sse_punsubscribe_failed", exc_info=True)

    async def _safe_unsubscribe_channels(
        self, user_id: str, channels: set[str]
    ) -> None:
        try:
            if not self._pubsub:
                return
            for lead_id in channels:
                if not self._is_channel_used_by_other(lead_id, user_id):
                    await self._pubsub.unsubscribe(
                        f"{SSE_CHANNEL_PREFIX}{lead_id}"
                    )
        except Exception:
            logger.warning("sse_unsubscribe_failed", user_id=user_id, exc_info=True)

    async def send_notification(self, lead_id: str, data: Any) -> bool:
        """Publish a notification to the sse:{leadId} channel via Redis."""
        await self._ensure_initialized()
        assert self._publisher is not None

        try:
            message = json.dumps(
                {
                    "type": "notification",
                    "leadId": lead_id,
                    "data": data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
            await self._publisher.publish(f"{SSE_CHANNEL_PREFIX}{lead_id}", message)
            return True
        except Exception:
            logger.exception("sse_publish_failed", lead_id=lead_id)
            return False

    async def refresh_user_leads(self, user_id: str, db: AsyncSession) -> None:
        """Re-subscribe a user to their current leads (after ownership changes)."""
        if user_id not in self._connections_by_user:
            return
        if user_id in self._super_admin_users:
            return
        await self._subscribe_user_leads(user_id, db)

    def get_status(self) -> dict[str, Any]:
        """Return debug status info."""
        total = sum(len(c) for c in self._connections_by_user.values())
        users = [
            {
                "userId": uid,
                "connections": len(conns),
                "isSuperAdmin": uid in self._super_admin_users,
                "leadChannels": len(self._user_lead_channels.get(uid, set())),
            }
            for uid, conns in self._connections_by_user.items()
        ]
        return {
            "isRedisInitialized": self._initialized,
            "totalConnections": total,
            "usersConnected": len(self._connections_by_user),
            "superAdminCount": len(self._super_admin_users),
            "psubscribeActive": self._psubscribe_active,
            "connectionsPerUser": users,
        }

    # ── Lead subscription helpers ────────────────────────────────────────

    async def _subscribe_user_leads(
        self, user_id: str, db: AsyncSession
    ) -> None:
        """Query DB for user's leads and subscribe to their SSE channels."""
        try:
            from domains.socialwise.db.models.lead_oab_data import LeadOabData
            from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit

            result = await db.execute(
                select(LeadOabData.id).where(
                    LeadOabData.usuario_chatwit_id.in_(
                        select(UsuarioChatwit.id).where(
                            UsuarioChatwit.app_user_id == user_id
                        )
                    )
                )
            )
            lead_ids = {row[0] for row in result.all()}
            prev_channels = self._user_lead_channels.get(user_id, set())

            if self._pubsub:
                # Subscribe to new channels
                for lead_id in lead_ids - prev_channels:
                    await self._pubsub.subscribe(
                        f"{SSE_CHANNEL_PREFIX}{lead_id}"
                    )
                # Unsubscribe from removed channels
                for lead_id in prev_channels - lead_ids:
                    if not self._is_channel_used_by_other(lead_id, user_id):
                        await self._pubsub.unsubscribe(
                            f"{SSE_CHANNEL_PREFIX}{lead_id}"
                        )

            self._user_lead_channels[user_id] = lead_ids
        except Exception:
            logger.exception("sse_subscribe_user_leads_failed", user_id=user_id)
            if user_id not in self._user_lead_channels:
                self._user_lead_channels[user_id] = set()

    def _is_channel_used_by_other(self, lead_id: str, exclude_user: str) -> bool:
        for uid, channels in self._user_lead_channels.items():
            if uid != exclude_user and uid not in self._super_admin_users:
                if lead_id in channels:
                    return True
        return False


# ── Singleton ────────────────────────────────────────────────────────────

_sse_manager: SocialwiseSseManager | None = None


def get_sse_manager() -> SocialwiseSseManager:
    global _sse_manager
    if _sse_manager is None:
        _sse_manager = SocialwiseSseManager()
    return _sse_manager
