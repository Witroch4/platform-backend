"""Chatwit init webhook for Socialwise."""

from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status

from domains.socialwise.services.flow.chatwit_config import save_chatwit_system_config
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/integrations/webhooks/socialwiseflow/init", tags=["socialwise-webhooks"])


class InitPayload(BaseModel):
    agent_bot_token: str
    base_url: str
    secret: str


@router.post("")
async def socialwiseflow_init(payload: InitPayload) -> dict[str, str]:
    if not settings.chatwit_webhook_secret or payload.secret != settings.chatwit_webhook_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    await save_chatwit_system_config(
        bot_token=payload.agent_bot_token,
        base_url=payload.base_url,
    )
    logger.info("socialwiseflow_init_saved", base_url=payload.base_url)
    return {"status": "ok"}
