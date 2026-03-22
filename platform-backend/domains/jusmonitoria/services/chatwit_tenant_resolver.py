"""Resolve tenant from Chatwit webhook data — strict multi-tenant isolation."""

import hashlib
from typing import Optional
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.tenant import Tenant

logger = structlog.get_logger(__name__)


async def resolve_tenant_by_access_token(
    session: AsyncSession,
    access_token: str,
) -> Optional[UUID]:
    """Resolve tenant_id by SHA256 hash of the Chatwit ACCESS_TOKEN.

    This is the primary resolution strategy for standard Chatwit webhooks
    (registered with include_access_token=true).
    """
    token_hash = hashlib.sha256(access_token.encode()).hexdigest()

    query = select(Tenant).where(
        Tenant.chatwit_access_token_hash == token_hash,
        Tenant.is_active.is_(True),
    )
    result = await session.execute(query)
    tenant = result.scalar_one_or_none()

    if tenant:
        logger.info(
            "tenant_resolved_by_access_token",
            tenant_id=str(tenant.id),
            chatwit_account_id=tenant.chatwit_account_id,
        )
        return tenant.id

    logger.warning("tenant_not_resolved_by_access_token")
    return None


async def resolve_tenant_by_chatwit_account(
    session: AsyncSession,
    chatwit_account_id: int,
) -> Optional[UUID]:
    """Resolve tenant_id from Chatwit account_id (legacy/bot integration).

    Strict match — no fallback. If no tenant has this account_id, returns None.
    """
    query = select(Tenant).where(
        Tenant.chatwit_account_id == chatwit_account_id,
        Tenant.is_active.is_(True),
    )
    result = await session.execute(query)
    tenant = result.scalar_one_or_none()

    if tenant:
        logger.info(
            "tenant_resolved_by_chatwit_account",
            tenant_id=str(tenant.id),
            chatwit_account_id=chatwit_account_id,
        )
        return tenant.id

    logger.warning(
        "tenant_not_resolved_by_chatwit_account",
        chatwit_account_id=chatwit_account_id,
    )
    return None
