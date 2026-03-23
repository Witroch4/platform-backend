"""FastAPI admin route for the Leads Webhook Receiver (B.7.5e).

Port of: app/api/admin/leads-chatwit/webhook/route.ts (POST, GET)

This webhook receives payloads from external systems (manuscript agents,
mirror agents, analysis agents, etc.) and dispatches to the appropriate handler.

Auth: optional webhook secret via x-webhook-secret or Authorization header.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.services.leads.admin_leads_webhook_receiver_service import (
    process_webhook,
)
from platform_core.config import settings
from platform_core.db.sessions import get_socialwise_session
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads-webhook"],
)


# ---------------------------------------------------------------------------
# webhook (POST + GET)
# ---------------------------------------------------------------------------


@router.post("/webhook")
async def post_webhook(
    request: Request,
    x_webhook_secret: str | None = Header(default=None, alias="x-webhook-secret"),
    authorization: str | None = Header(default=None),
):
    # Auth check (optional — only if LEADS_WEBHOOK_SECRET is set)
    secret = settings.leads_webhook_secret
    if secret:
        token = x_webhook_secret or (authorization.removeprefix("Bearer ").strip() if authorization else None)
        if token != secret:
            logger.warning("webhook_auth_failed")
            return JSONResponse(content={"error": "Não autorizado"}, status_code=401)

    try:
        raw_data = await request.json()
    except Exception:
        return JSONResponse(content={"error": "Payload inválido"}, status_code=400)

    # Get DB session manually (webhook doesn't use AdminProxyContext)
    from platform_core.db.sessions import get_session_factory

    factory = get_session_factory("socialwise")
    async with factory() as session:
        try:
            result = await process_webhook(session, raw_data)
            await session.commit()

            status_code = result.pop("_status_code", 200)
            return JSONResponse(content=result, status_code=status_code)
        except Exception as e:
            await session.rollback()
            logger.error("webhook_processing_error", error=str(e), exc_info=True)
            return JSONResponse(
                content={"error": str(e) or "Erro interno ao processar webhook"},
                status_code=500,
            )


@router.get("/webhook")
async def get_webhook():
    return JSONResponse(
        content={"status": "Webhook do Chatwit funcionando corretamente"},
        status_code=200,
    )
