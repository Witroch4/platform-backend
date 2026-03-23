"""FastAPI SSE (Server-Sent Events) admin endpoints.

Port of:
- app/api/admin/leads-chatwit/notifications/route.ts (GET stream + POST send)
- app/api/admin/leads-chatwit/notifications/send/route.ts (POST send)
- app/api/admin/leads-chatwit/notifications/check/route.ts (GET status)

Provides:
- GET  /notifications       → SSE stream (EventSource-compatible)
- POST /notifications/send  → Publish notification to a lead channel
- GET  /notifications/status → Debug status of connections
"""

from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import (
    AdminProxyContext,
    get_admin_proxy_context,
)
from domains.socialwise.services.sse.manager import get_sse_manager
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-sse"],
)

HEARTBEAT_INTERVAL_S = 25


# ── SSE stream ───────────────────────────────────────────────────────────


@router.get("/notifications")
async def sse_stream(
    request: Request,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    db: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    """Server-Sent Events stream for real-time lead notifications.

    The browser connects via ``new EventSource(url, {withCredentials: true})``.
    Auth is handled via JWT cookie (same as other admin endpoints).
    """
    manager = get_sse_manager()
    conn = await manager.add_user_connection(ctx.user_id, ctx.role, db)

    async def event_generator():
        heartbeat_task: asyncio.Task | None = None
        try:
            # Background heartbeat to keep the connection alive
            async def heartbeat():
                while True:
                    await asyncio.sleep(HEARTBEAT_INTERVAL_S)
                    if conn.closed:
                        break
                    conn.enqueue(f": keepalive {int(asyncio.get_event_loop().time())}\n\n")

            heartbeat_task = asyncio.create_task(heartbeat())

            while True:
                if await request.is_disconnected():
                    break

                try:
                    data = await asyncio.wait_for(conn.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                if conn.closed and data == "":
                    break
                if data:
                    yield data
        finally:
            if heartbeat_task:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            manager.remove_user_connection(ctx.user_id, conn.connection_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Send notification ────────────────────────────────────────────────────


class SendNotificationRequest(BaseModel):
    leadId: str
    data: dict[str, Any]


@router.post("/notifications/send")
async def send_notification(
    body: SendNotificationRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
):
    """Publish a notification to connected SSE clients for a specific lead."""
    manager = get_sse_manager()
    sent = await manager.send_notification(body.leadId, body.data)
    return {
        "success": sent,
        "leadId": body.leadId,
        "message": "Notificação enviada com sucesso" if sent else "Erro ao enviar notificação",
    }


# ── Status (debug) ──────────────────────────────────────────────────────


@router.get("/notifications/status")
async def sse_status():
    """Debug endpoint showing current SSE connection status."""
    manager = get_sse_manager()
    return manager.get_status()
