"""MTF Variable Loader for Flow Engine.

Port of services/flow-engine/mtf-variable-loader.ts.

Pre-loads all MTF Diamante variables for a given inbox,
returning a flat dict[str, str] suitable for injection
as session variables in the FlowExecutor.
"""

from __future__ import annotations

import re

from sqlalchemy import select

from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.mtf_variables import (
    get_cached_variables_for_user,
    get_lote_ativo_formatado,
)
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


def _parse_currency_to_cents(value: str) -> int:
    """Parse a Brazilian currency string to cents."""
    cleaned = re.sub(r"R\$\s*", "", value, flags=re.IGNORECASE).strip()
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        number = float(cleaned)
        return round(number * 100) if "." in cleaned else round(number)
    except ValueError:
        return 0


async def load_mtf_variables_for_inbox(prisma_inbox_id: str) -> dict[str, str]:
    """Load all MTF Diamante variables for an inbox as a flat dict.

    Returns empty dict if inbox has no user or user has no MTF config.
    """
    try:
        async with session_ctx() as session:
            stmt = select(ChatwitInbox).where(ChatwitInbox.id == prisma_inbox_id)
            result = await session.execute(stmt)
            inbox = result.scalar_one_or_none()

        if not inbox or not inbox.usuario_chatwit:
            logger.debug("mtf_loader_no_user", prisma_inbox_id=prisma_inbox_id)
            return {}

        user_id = inbox.usuario_chatwit.app_user_id
        if not user_id:
            logger.debug("mtf_loader_no_app_user_id", prisma_inbox_id=prisma_inbox_id)
            return {}

        # Normal + lote variables (Redis cached, 10min TTL)
        variables = await get_cached_variables_for_user(user_id)
        result_dict: dict[str, str] = {}

        for v in variables:
            result_dict[v.chave] = v.valor

        # Fresh read of lote_ativo (changes more frequently)
        try:
            result_dict["lote_ativo"] = await get_lote_ativo_formatado(user_id)
        except Exception as e:
            logger.warning("mtf_loader_lote_ativo_error", user_id=user_id, error=str(e))

        # Derive centavos versions for payment integration
        for key, value in dict(result_dict).items():
            if isinstance(value, str) and ("R$" in value or re.match(r"^\d+[,.]?\d*$", value)):
                try:
                    cents = _parse_currency_to_cents(value)
                    if cents > 0:
                        result_dict[f"{key}_centavos"] = str(cents)
                except Exception:
                    pass

        logger.info(
            "mtf_loader_loaded",
            user_id=user_id,
            prisma_inbox_id=prisma_inbox_id,
            variable_count=len(result_dict),
            keys=list(result_dict.keys()),
        )
        return result_dict

    except Exception as exc:
        logger.error("mtf_loader_error", prisma_inbox_id=prisma_inbox_id, error=str(exc))
        return {}
