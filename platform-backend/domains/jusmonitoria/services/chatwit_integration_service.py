"""Service for managing Chatwit integration per tenant.

Handles: token validation, webhook registration, connect/disconnect lifecycle.
"""

import hashlib
import secrets
from uuid import UUID

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import get_settings
from domains.jusmonitoria.crypto import decrypt, encrypt
from domains.jusmonitoria.db.models.tenant import Tenant

logger = structlog.get_logger(__name__)
settings = get_settings()

# Events the webhook subscribes to
WEBHOOK_SUBSCRIPTIONS = [
    "contact_created",
    "contact_updated",
    "message_created",
    "conversation_updated",
    "conversation_resolved",
]


class ChatwitIntegrationError(Exception):
    """Raised when Chatwit integration operations fail."""


async def _chatwit_api_get(
    base_url: str,
    path: str,
    access_token: str,
    timeout: float = 10.0,
) -> dict:
    """Make authenticated GET to Chatwit API."""
    url = f"{base_url}{path}"
    headers = {"api_access_token": access_token, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def _chatwit_api_post(
    base_url: str,
    path: str,
    access_token: str,
    json_body: dict,
    timeout: float = 10.0,
) -> dict:
    """Make authenticated POST to Chatwit API."""
    url = f"{base_url}{path}"
    headers = {"api_access_token": access_token, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=json_body, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def _chatwit_api_delete(
    base_url: str,
    path: str,
    access_token: str,
    timeout: float = 10.0,
) -> None:
    """Make authenticated DELETE to Chatwit API."""
    url = f"{base_url}{path}"
    headers = {"api_access_token": access_token}
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.delete(url, headers=headers)
        resp.raise_for_status()


async def validate_token(base_url: str, access_token: str) -> dict:
    """Validate ACCESS_TOKEN against Chatwit and return account info.

    Calls GET /api/v1/profile with api_access_token header.
    Response format: {account_id: 3, name: "Dra.Amanda", accounts: [{id: 3, name: "DraAmandaSousa", ...}], ...}
    """
    try:
        data = await _chatwit_api_get(base_url, "/api/v1/profile", access_token)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            raise ChatwitIntegrationError("Token inválido ou expirado") from exc
        raise ChatwitIntegrationError(
            f"Erro ao validar token: HTTP {exc.response.status_code}"
        ) from exc
    except httpx.RequestError as exc:
        raise ChatwitIntegrationError(
            f"Não foi possível conectar ao Chatwit: {exc}"
        ) from exc

    # /api/v1/profile returns flat: {account_id, name, accounts: [{id, name, ...}]}
    accounts = data.get("accounts", [])
    if accounts:
        account = accounts[0]
        return {
            "account_id": account.get("id"),
            "account_name": account.get("name", ""),
        }

    # Fallback: direct account_id from root
    account_id = data.get("account_id")
    if account_id:
        return {
            "account_id": account_id,
            "account_name": data.get("name", ""),
        }

    raise ChatwitIntegrationError("Nenhuma conta encontrada para este token")


async def register_webhook(
    base_url: str,
    access_token: str,
    account_id: int,
) -> int:
    """Register a standard webhook in Chatwit for this account.

    Returns the webhook ID for later management.
    """
    webhook_url = f"{settings.backend_public_url}/api/v1/integrations/chatwit/webhook"

    body = {
        "webhook": {
            "url": webhook_url,
            "subscriptions": WEBHOOK_SUBSCRIPTIONS,
            "include_access_token": True,
        },
    }

    try:
        data = await _chatwit_api_post(
            base_url,
            f"/api/v1/accounts/{account_id}/webhooks",
            access_token,
            body,
        )
    except httpx.HTTPStatusError as exc:
        # 422 = webhook URL already exists for this account
        if exc.response.status_code == 422:
            logger.info(
                "chatwit_webhook_already_exists",
                account_id=account_id,
                webhook_url=webhook_url,
            )
            # Try to find existing webhook and return its ID
            return await _find_existing_webhook(base_url, access_token, account_id, webhook_url)
        raise ChatwitIntegrationError(
            f"Erro ao registrar webhook: HTTP {exc.response.status_code}"
        ) from exc

    webhook_id = data.get("payload", {}).get("id") or data.get("id")
    if not webhook_id:
        logger.warning("chatwit_webhook_created_no_id", response=data)
        return 0

    logger.info(
        "chatwit_webhook_registered",
        account_id=account_id,
        webhook_id=webhook_id,
        webhook_url=webhook_url,
    )
    return webhook_id


async def _find_existing_webhook(
    base_url: str,
    access_token: str,
    account_id: int,
    target_url: str,
) -> int:
    """Find an existing webhook by URL and return its ID."""
    try:
        data = await _chatwit_api_get(
            base_url,
            f"/api/v1/accounts/{account_id}/webhooks",
            access_token,
        )
        webhooks = data.get("payload", {}).get("webhooks", []) if isinstance(data, dict) else data
        if isinstance(webhooks, list):
            for wh in webhooks:
                if wh.get("url") == target_url:
                    return wh.get("id", 0)
    except Exception:
        logger.warning("chatwit_find_webhook_failed", account_id=account_id)
    return 0


async def connect(
    access_token: str,
    base_url: str,
    tenant_id: UUID,
    session: AsyncSession,
) -> dict:
    """Connect a tenant to Chatwit.

    1. Validate token against Chatwit API
    2. Check uniqueness (no other tenant with same token)
    3. Register standard webhook
    4. Store encrypted token + hash + account_id + webhook_id
    """
    # 1. Validate
    account_info = await validate_token(base_url, access_token)
    account_id = account_info["account_id"]
    account_name = account_info["account_name"]

    # 2. Check uniqueness
    token_hash = hashlib.sha256(access_token.encode()).hexdigest()
    existing = await session.execute(
        select(Tenant).where(
            Tenant.chatwit_access_token_hash == token_hash,
            Tenant.id != tenant_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ChatwitIntegrationError(
            "Este token já está vinculado a outro escritório"
        )

    # 3. Register webhook
    webhook_id = await register_webhook(base_url, access_token, account_id)

    # 4. Store on tenant
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise ChatwitIntegrationError("Tenant não encontrado")

    tenant.chatwit_access_token_encrypted = encrypt(access_token)
    tenant.chatwit_access_token_hash = token_hash
    tenant.chatwit_account_id = account_id
    tenant.chatwit_webhook_id = webhook_id

    # Also store in settings for backward compat
    tenant_settings = dict(tenant.settings) if tenant.settings else {}
    tenant_settings["chatwit_base_url"] = base_url
    tenant_settings["chatwit_account_name"] = account_name
    tenant.settings = tenant_settings

    await session.flush()

    logger.info(
        "chatwit_tenant_connected",
        tenant_id=str(tenant_id),
        account_id=account_id,
        account_name=account_name,
        webhook_id=webhook_id,
    )

    return {
        "status": "connected",
        "account_id": account_id,
        "account_name": account_name,
    }


async def disconnect(tenant_id: UUID, session: AsyncSession) -> None:
    """Disconnect a tenant from Chatwit.

    1. Delete webhook from Chatwit
    2. Clear token fields from tenant
    """
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise ChatwitIntegrationError("Tenant não encontrado")

    # Try to delete webhook from Chatwit
    if tenant.chatwit_access_token_encrypted and tenant.chatwit_webhook_id:
        try:
            token = decrypt(tenant.chatwit_access_token_encrypted)
            base_url = (tenant.settings or {}).get(
                "chatwit_base_url", "https://chatwit.witdev.com.br"
            )
            await _chatwit_api_delete(
                base_url,
                f"/api/v1/accounts/{tenant.chatwit_account_id}/webhooks/{tenant.chatwit_webhook_id}",
                token,
            )
            logger.info(
                "chatwit_webhook_deleted",
                tenant_id=str(tenant_id),
                webhook_id=tenant.chatwit_webhook_id,
            )
        except Exception as exc:
            logger.warning(
                "chatwit_webhook_delete_failed",
                tenant_id=str(tenant_id),
                error=str(exc),
            )

    # Clear fields
    tenant.chatwit_access_token_encrypted = None
    tenant.chatwit_access_token_hash = None
    tenant.chatwit_webhook_id = None
    # Keep chatwit_account_id for historical reference

    tenant_settings = dict(tenant.settings) if tenant.settings else {}
    tenant_settings.pop("chatwit_account_name", None)
    tenant.settings = tenant_settings

    await session.flush()

    logger.info("chatwit_tenant_disconnected", tenant_id=str(tenant_id))


async def get_status(tenant_id: UUID, session: AsyncSession) -> dict:
    """Get Chatwit integration status for a tenant."""
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        return {"connected": False, "account_id": None, "account_name": None}

    connected = tenant.chatwit_access_token_hash is not None
    account_name = (tenant.settings or {}).get("chatwit_account_name") if connected else None

    return {
        "connected": connected,
        "account_id": tenant.chatwit_account_id if connected else None,
        "account_name": account_name,
    }
