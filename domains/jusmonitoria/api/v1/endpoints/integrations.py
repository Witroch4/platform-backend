"""Integration management endpoints (Instagram, Chatwit, etc.)."""

import base64
import hashlib
import hmac
import logging
import secrets
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from domains.jusmonitoria.auth.dependencies import CurrentUser
from domains.jusmonitoria.services.instagram_oauth import (
    encrypt_token,
    exchange_code_for_token,
    fetch_instagram_profile,
    get_authorization_url,
)
from domains.jusmonitoria.services.chatwit_client import sync_identifier_to_chatwit
from domains.jusmonitoria.services.chatwit_tenant_resolver import (
    resolve_tenant_by_access_token,
    resolve_tenant_by_chatwit_account,
)
from domains.jusmonitoria.services.payment_webhook_service import PaymentWebhookService
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.lead import Lead, LeadSource, LeadStage, LeadStatus
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.db.repositories.user_integration_repository import UserIntegrationRepository
from domains.jusmonitoria.db.models.tenant import Tenant
from domains.jusmonitoria.services import chatwit_integration_service
from domains.jusmonitoria.services.chatwit_integration_service import ChatwitIntegrationError
from domains.jusmonitoria.schemas.chatwit import (
    ChatwitConnectRequest,
    ChatwitConnectResponse,
    ChatwitContactEventPayload,
    ChatwitConversationResolvedPayload,
    ChatwitInitPayload,
    ChatwitInitResponse,
    ChatwitStandardWebhookPayload,
    ChatwitStatusResponse,
    ChatwitWebhookPayload,
    ChatwitWebhookResponse,
)
from domains.jusmonitoria.schemas.payment_webhook import (
    ChatwitPaymentConfirmedPayload,
    ChatwitPaymentWebhookPayload,
    PaymentWebhookResponse,
)
from domains.jusmonitoria.tasks.events.bus import publish
from domains.jusmonitoria.tasks.events.types import (
    EventType,
    MessageReceivedEvent,
    PaymentFailedEvent,
    PaymentReceivedEvent,
    WebhookReceivedEvent,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/instagram/authorize")
async def instagram_authorize(user: CurrentUser) -> RedirectResponse:
    """
    Initiate Instagram OAuth flow.

    Generates a CSRF state token encoding user_id:tenant_id:random
    and redirects to Instagram authorization page.
    """
    random_part = secrets.token_urlsafe(16)
    state_plain = f"{user.id}:{user.tenant_id}:{random_part}"
    state = base64.urlsafe_b64encode(state_plain.encode()).decode()

    auth_url = get_authorization_url(state=state)
    logger.info(
        "Instagram OAuth initiated",
        extra={"user_id": str(user.id), "tenant_id": str(user.tenant_id)},
    )
    return RedirectResponse(url=auth_url)


@router.get("/instagram/callback")
async def instagram_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    Handle Instagram OAuth callback.

    Called by the frontend page after Instagram redirects back.
    Decodes user context from the state parameter.
    """
    # Decode state to get user_id and tenant_id
    try:
        decoded = base64.urlsafe_b64decode(state.encode()).decode()
        parts = decoded.split(":")
        user_id = uuid_mod.UUID(parts[0])
        tenant_id = uuid_mod.UUID(parts[1])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado OAuth inválido",
        )

    # Exchange code for token
    try:
        token_data = await exchange_code_for_token(code)
    except Exception as e:
        logger.error("instagram_token_exchange_failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falha ao trocar código pelo token do Instagram",
        )

    # Fetch Instagram profile
    access_token = token_data["access_token"]
    try:
        ig_profile = await fetch_instagram_profile(access_token)
    except Exception as e:
        logger.error("instagram_profile_fetch_failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falha ao buscar perfil do Instagram",
        )

    # Encrypt and store the token
    encrypted_token = encrypt_token(access_token)
    expires_in = token_data.get("expires_in", 5184000)  # Default 60 days
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    integration_repo = UserIntegrationRepository(session, tenant_id)
    existing = await integration_repo.get_by_user_and_type(user_id, "instagram")

    if existing:
        await integration_repo.update(
            existing.id,
            access_token_encrypted=encrypted_token,
            token_expires_at=expires_at,
            external_user_id=ig_profile.get("id"),
            external_username=ig_profile.get("username"),
            external_profile_picture_url=ig_profile.get("profile_picture_url"),
            is_active=True,
        )
    else:
        await integration_repo.create(
            user_id=user_id,
            integration_type="instagram",
            access_token_encrypted=encrypted_token,
            token_expires_at=expires_at,
            external_user_id=ig_profile.get("id"),
            external_username=ig_profile.get("username"),
            external_profile_picture_url=ig_profile.get("profile_picture_url"),
            is_active=True,
        )

    await session.commit()

    logger.info(
        "Instagram connected",
        extra={
            "user_id": str(user_id),
            "ig_username": ig_profile.get("username"),
        },
    )

    return {
        "status": "connected",
        "username": ig_profile.get("username"),
        "profile_picture_url": ig_profile.get("profile_picture_url"),
    }


@router.get("/instagram")
async def get_instagram_integration(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Get current user's Instagram integration status."""
    integration_repo = UserIntegrationRepository(session, user.tenant_id)
    integration = await integration_repo.get_by_user_and_type(user.id, "instagram")

    if not integration or not integration.is_active:
        return {"connected": False}

    return {
        "connected": True,
        "username": integration.external_username,
        "profile_picture_url": integration.external_profile_picture_url,
        "token_expires_at": (
            integration.token_expires_at.isoformat()
            if integration.token_expires_at
            else None
        ),
    }


@router.delete("/instagram", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_instagram(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> None:
    """Disconnect Instagram integration."""
    integration_repo = UserIntegrationRepository(session, user.tenant_id)
    integration = await integration_repo.get_by_user_and_type(user.id, "instagram")

    if integration:
        await integration_repo.update(
            integration.id,
            is_active=False,
            access_token_encrypted=None,
        )
        await session.commit()

        logger.info(
            "Instagram disconnected",
            extra={"user_id": str(user.id)},
        )


# ──────────────────────────────────────────────────────────────────────
# CHATWIT UNIFIED WEBHOOK — Receives ALL events from Chatwit
# ──────────────────────────────────────────────────────────────────────

def _verify_chatwit_signature(payload: bytes, signature: str) -> bool:
    """Verify HMAC SHA256 signature from Chatwit webhook."""
    if not settings.chatwit_webhook_secret:
        logger.warning("chatwit_webhook_secret_not_configured — allowing in dev")
        return True

    expected = hmac.new(
        settings.chatwit_webhook_secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


@router.post(
    "/chatwit",
    status_code=status.HTTP_200_OK,
    summary="Unified Chatwit webhook receiver",
    description=(
        "Single omnipotent endpoint that receives ALL Chatwit webhooks "
        "(messages, tags, payments, leads, etc.) and routes them to "
        "the appropriate internal handlers."
    ),
)
async def chatwit_unified_webhook(
    request: Request,
    session: AsyncSession = Depends(get_jusmonitoria_session),
    x_chatwit_signature: str | None = Header(None, alias="X-Chatwit-Signature"),
    x_chatwit_secret: str | None = Header(None, alias="X-Chatwit-Secret"),
) -> dict[str, Any]:
    """
    Unified Chatwit integration endpoint.

    Receives all webhook events and dispatches them:
    - payment.completed / payment.failed / payment.refunded → Financial system
    - message.received → Message event bus
    - tag.added / tag.removed → Tag event bus
    - lead.created / contact.created → Lead creation flow (future)

    Quick response (< 5s) to avoid Chatwit timeouts.
    """
    # 1. Read raw body for signature verification
    body = await request.body()

    # 2. Verify HMAC signature (X-Chatwit-Signature) or raw secret (X-Chatwit-Secret)
    if x_chatwit_signature:
        if not _verify_chatwit_signature(body, x_chatwit_signature):
            logger.warning("chatwit_unified_invalid_signature")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature",
            )
    elif x_chatwit_secret:
        configured = settings.chatwit_webhook_secret
        if configured and not hmac.compare_digest(x_chatwit_secret, configured):
            logger.warning("chatwit_unified_invalid_secret")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook secret",
            )
    else:
        logger.warning("chatwit_unified_no_auth")

    # 3. Parse raw payload
    try:
        payload_dict: dict[str, Any] = await request.json()
    except Exception as e:
        logger.error("chatwit_unified_parse_error", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON payload: {e}",
        )

    # 3b. Detect Agent Bot callback format (session_id + context + metadata.event_name)
    #     and normalize to the internal {event_type, data, metadata} format.
    if "session_id" in payload_dict and "context" in payload_dict:
        ctx = payload_dict.get("context", {})
        meta = payload_dict.get("metadata", {})
        raw_event = meta.get("event_name", "unknown")
        normalized_event = _STANDARD_EVENT_MAP.get(raw_event, raw_event)

        logger.info(
            "chatwit_agent_bot_callback_normalized",
            extra={"raw_event": raw_event, "normalized_event": normalized_event},
        )

        contact = ctx.get("contact", {})
        conversation = ctx.get("conversation", {})
        message = ctx.get("message", {})
        inbox = ctx.get("inbox", {})

        metadata_block = {
            "account_id": meta.get("account_id", 0),
            "chatwit_base_url": meta.get("chatwit_base_url", ""),
            "chatwit_agent_bot_token": meta.get("chatwit_agent_bot_token", ""),
            "timestamp": meta.get("timestamp", datetime.now(timezone.utc).isoformat()),
        }

        if normalized_event in ("contact.created", "contact.updated"):
            payload_dict = {
                "event_type": normalized_event,
                "data": {
                    "id": contact.get("id", 0),
                    "name": contact.get("name", ""),
                    "email": contact.get("email"),
                    "phone_number": contact.get("phone_number"),
                    "identifier": contact.get("identifier"),
                    "custom_attributes": contact.get("custom_attributes", {}),
                    "account": {"id": meta.get("account_id", 0)},
                },
                "metadata": metadata_block,
            }
        elif normalized_event == "message.received":
            payload_dict = {
                "event_type": "message.received",
                "timestamp": metadata_block["timestamp"],
                "contact": {
                    "id": str(contact.get("id", "")),
                    "name": contact.get("name", ""),
                    "phone": contact.get("phone_number", ""),
                    "email": contact.get("email"),
                    "tags": contact.get("label_list", []),
                    "custom_fields": contact.get("custom_attributes", {}),
                },
                "message": {
                    "id": str(message.get("id", "")),
                    "direction": "inbound",
                    "content": message.get("content") or payload_dict.get("message", ""),
                    "media_url": None,
                    "channel": (inbox.get("channel_type", "whatsapp")).split("::")[-1].lower(),
                },
                "metadata": {
                    "account_id": meta.get("account_id", 0),
                    "conversation_id": conversation.get("id") or meta.get("conversation_id"),
                    "chatwit_base_url": meta.get("chatwit_base_url", ""),
                    "chatwit_agent_bot_token": meta.get("chatwit_agent_bot_token", ""),
                },
            }
        elif normalized_event == "conversation.resolved":
            payload_dict = {
                "event_type": "conversation.resolved",
                "data": {"conversation": {**conversation, "contact": contact}},
                "metadata": metadata_block,
            }
        else:
            payload_dict["event_type"] = normalized_event

    event_type = payload_dict.get("event_type", "unknown")
    logger.info(
        "chatwit_unified_webhook_received",
        extra={"event_type": event_type},
    )

    # 4. Route to appropriate handler based on event_type
    if event_type.startswith("payment."):
        return await _handle_payment_event(event_type, payload_dict, session)
    elif event_type == "message.received":
        return await _handle_message_event(payload_dict, session)
    elif event_type in ("tag.added", "tag.removed"):
        return await _handle_tag_event(event_type, payload_dict, session)
    elif event_type in ("contact.created", "contact.updated"):
        return await _handle_contact_event(event_type, payload_dict, session)
    elif event_type == "conversation.resolved":
        return await _handle_conversation_resolved(payload_dict, session)
    elif event_type == "lead.created":
        return await _handle_contact_event(event_type, payload_dict, session)
    else:
        # Unknown event — log and acknowledge
        logger.info(
            "chatwit_unified_unknown_event",
            extra={"event_type": event_type},
        )
        return {
            "status": "received",
            "event_type": event_type,
            "message": "Evento recebido mas sem handler específico",
        }


async def _handle_payment_event(
    event_type: str,
    payload_dict: dict[str, Any],
    session: AsyncSession,
) -> dict[str, Any]:
    """Handle payment webhook events (confirmed, completed, failed, refunded)."""

    # ── payment.confirmed (InfinitePay via Chatwit — contract-aligned) ──
    if event_type == "payment.confirmed":
        try:
            payload = ChatwitPaymentConfirmedPayload(**payload_dict)
        except Exception as e:
            logger.error("chatwit_payment_confirmed_parse_error", extra={"error": str(e)})
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid payment.confirmed payload: {e}",
            )

        # Resolve tenant
        tenant_id = await resolve_tenant_by_chatwit_account(
            session, payload.metadata.account_id
        )
        if not tenant_id:
            logger.error(
                "payment_confirmed_tenant_not_found",
                account_id=payload.metadata.account_id,
            )
            return {
                "status": "error",
                "message": "Tenant não encontrado para account_id informado",
            }

        service = PaymentWebhookService(session)
        result = await service.process_payment_confirmed(
            payload, tenant_id, metadata_dict=payload.metadata.model_dump()
        )

        # Emit event
        client_id = UUID(result["client_id"]) if result.get("client_id") else None
        fatura_id = UUID(result["fatura_id"]) if result.get("fatura_id") else None
        lancamento_id = UUID(result["lancamento_id"]) if result.get("lancamento_id") else None

        payment_event = PaymentReceivedEvent(
            tenant_id=tenant_id,
            payment_id=payload.data.order_nsu,
            client_id=client_id,
            fatura_id=fatura_id,
            lancamento_id=lancamento_id,
            amount=float(payload.data.paid_amount_brl),
            payment_method=payload.data.capture_method,
        )
        await publish(payment_event)

        return PaymentWebhookResponse(
            status=result["status"],
            event_id=str(payment_event.event_id),
            fatura_id=result.get("fatura_id"),
            lancamento_id=result.get("lancamento_id"),
            message=result["message"],
        ).model_dump()

    # ── payment.completed (legacy schema — backward compat) ──
    try:
        payload_legacy = ChatwitPaymentWebhookPayload(**payload_dict)
    except Exception as e:
        logger.error("chatwit_payment_parse_error", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payment payload: {e}",
        )

    if event_type == "payment.completed" and payload_legacy.payment_status == "completed":
        service = PaymentWebhookService(session)
        result = await service.process_payment(payload_legacy)

        tenant_id = (
            UUID(result["tenant_id"])
            if result.get("tenant_id")
            else UUID("00000000-0000-0000-0000-000000000000")
        )
        client_id = UUID(result["client_id"]) if result.get("client_id") else None
        fatura_id = UUID(result["fatura_id"]) if result.get("fatura_id") else None
        lancamento_id = UUID(result["lancamento_id"]) if result.get("lancamento_id") else None

        payment_event = PaymentReceivedEvent(
            tenant_id=tenant_id,
            payment_id=payload_legacy.payment_id,
            client_id=client_id,
            fatura_id=fatura_id,
            lancamento_id=lancamento_id,
            amount=float(payload_legacy.amount),
            payment_method=payload_legacy.payment_method,
        )
        await publish(payment_event)

        return PaymentWebhookResponse(
            status=result["status"],
            event_id=str(payment_event.event_id),
            fatura_id=result.get("fatura_id"),
            lancamento_id=result.get("lancamento_id"),
            message=result["message"],
        ).model_dump()

    elif event_type == "payment.failed":
        logger.warning(
            "chatwit_payment_failed",
            extra={
                "payment_id": payload_legacy.payment_id,
                "amount": str(payload_legacy.amount),
            },
        )
        failed_event = PaymentFailedEvent(
            tenant_id=UUID("00000000-0000-0000-0000-000000000000"),
            payment_id=payload_legacy.payment_id,
            amount=float(payload_legacy.amount),
            error="Payment failed at provider",
        )
        await publish(failed_event)
        return {
            "status": "received",
            "event_type": event_type,
            "message": "Pagamento falhou — registrado para acompanhamento",
        }

    elif event_type == "payment.refunded":
        logger.info(
            "chatwit_payment_refunded",
            extra={
                "payment_id": payload_legacy.payment_id,
                "amount": str(payload_legacy.amount),
            },
        )
        return {
            "status": "received",
            "event_type": event_type,
            "message": "Reembolso registrado — necessita processamento manual",
        }

    return {"status": "received", "event_type": event_type}


async def _handle_message_event(
    payload_dict: dict[str, Any],
    session: AsyncSession,
    *,
    resolved_tenant_id: Optional[UUID] = None,
) -> dict[str, Any]:
    """Handle message.received events — forwards to existing message flow."""
    try:
        payload = ChatwitWebhookPayload(**payload_dict)
    except Exception as e:
        logger.error("chatwit_message_parse_error", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid message payload: {e}",
        )

    # Use pre-resolved tenant_id (from standard webhook) or resolve by account_id
    tenant_id = resolved_tenant_id
    if not tenant_id:
        account_id = payload.metadata.account_id if payload.metadata else None
        if account_id:
            tenant_id = await resolve_tenant_by_chatwit_account(session, account_id)
    if not tenant_id:
        logger.warning("chatwit_message_tenant_not_found")
        tenant_id = UUID("00000000-0000-0000-0000-000000000000")

    # Publish generic webhook event
    webhook_event = WebhookReceivedEvent(
        tenant_id=tenant_id,
        source="chatwit",
        payload=payload_dict,
    )
    await publish(webhook_event)

    # Publish specific message event
    if payload.message:
        message_event = MessageReceivedEvent(
            tenant_id=tenant_id,
            contact_id=payload.contact.id,
            message_id=payload.message.id,
            content=payload.message.content,
            channel=payload.message.channel,
            metadata={
                "contact_name": payload.contact.name,
                "contact_phone": payload.contact.phone,
                "contact_email": payload.contact.email,
                "contact_tags": payload.contact.tags,
                "account_id": account_id,
            },
        )
        await publish(message_event)

    logger.info(
        "chatwit_message_forwarded",
        extra={
            "contact_id": payload.contact.id,
            "message_id": payload.message.id if payload.message else None,
        },
    )

    return ChatwitWebhookResponse(
        status="received",
        event_id=str(webhook_event.event_id),
    ).model_dump()


async def _handle_tag_event(
    event_type: str,
    payload_dict: dict[str, Any],
    session: AsyncSession,
) -> dict[str, Any]:
    """Handle tag.added / tag.removed events."""
    try:
        payload = ChatwitWebhookPayload(**payload_dict)
    except Exception as e:
        logger.error("chatwit_tag_parse_error", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid tag payload: {e}",
        )

    # Resolve tenant from Chatwit account_id
    account_id = payload.metadata.account_id if payload.metadata else None
    tenant_id = None
    if account_id:
        tenant_id = await resolve_tenant_by_chatwit_account(session, account_id)
    if not tenant_id:
        logger.warning("chatwit_tag_tenant_not_found", extra={"account_id": account_id})
        tenant_id = UUID("00000000-0000-0000-0000-000000000000")

    webhook_event = WebhookReceivedEvent(
        tenant_id=tenant_id,
        source="chatwit",
        payload=payload_dict,
    )
    await publish(webhook_event)

    logger.info(
        f"chatwit_{event_type.replace('.', '_')}",
        extra={
            "contact_id": payload.contact.id,
            "tag": payload.tag,
        },
    )

    return ChatwitWebhookResponse(
        status="received",
        event_id=str(webhook_event.event_id),
    ).model_dump()


async def _handle_contact_event(
    event_type: str,
    payload_dict: dict[str, Any],
    session: AsyncSession,
    *,
    resolved_tenant_id: Optional[UUID] = None,
) -> dict[str, Any]:
    """
    Handle contact.created / contact.updated / lead.created events.

    Creates or updates a Lead in the CRM from Chatwit contact data.
    """
    try:
        payload = ChatwitContactEventPayload.model_validate(payload_dict)
    except Exception:
        logger.warning("chatwit_contact_invalid_payload", extra={"event_type": event_type})
        return {"status": "error", "message": "Payload inválido para evento de contato"}

    # Use pre-resolved tenant_id (from standard webhook) or resolve by account_id
    tenant_id = resolved_tenant_id
    if not tenant_id:
        account_id = payload.metadata.account_id
        tenant_id = await resolve_tenant_by_chatwit_account(session, account_id)
    if not tenant_id:
        logger.warning("chatwit_contact_tenant_not_found")
        return {"status": "error", "message": "Tenant não encontrado"}

    lead_repo = LeadRepository(session, tenant_id)
    contact = payload.data
    chatwit_cid = str(contact.id)

    existing = await lead_repo.get_by_chatwit_contact(chatwit_cid)

    if existing:
        # Update existing lead
        update_data: dict[str, Any] = {}
        if contact.name and contact.name != existing.full_name:
            update_data["full_name"] = contact.name
        if contact.email and contact.email != existing.email:
            update_data["email"] = contact.email
        if contact.phone_number and contact.phone_number != existing.phone:
            update_data["phone"] = contact.phone_number
        if contact.custom_attributes:
            merged = {**(existing.lead_metadata or {}), **contact.custom_attributes}
            update_data["lead_metadata"] = merged

        if update_data:
            await lead_repo.update(existing.id, **update_data)
            await session.commit()

        logger.info("chatwit_contact_updated", extra={"lead_id": str(existing.id), "chatwit_contact_id": chatwit_cid})
        return {"status": "updated", "lead_id": str(existing.id)}

    # Create new lead
    lead = await lead_repo.create(
        full_name=contact.name,
        email=contact.email,
        phone=contact.phone_number,
        source=LeadSource.CHATWIT,
        chatwit_contact_id=chatwit_cid,
        stage=LeadStage.NEW,
        status=LeadStatus.ACTIVE,
        score=0,
        lead_metadata=contact.custom_attributes or {},
    )
    await session.commit()

    # Sync identifier to Chatwit (bidirectional link)
    identifier = await sync_identifier_to_chatwit(
        entity_id=str(lead.id),
        chatwit_contact_id=chatwit_cid,
        metadata=payload.metadata.model_dump(),
        entity_type="lead",
    )

    # Publish event for async processing (AI scoring, etc.)
    await publish(WebhookReceivedEvent(
        tenant_id=tenant_id,
        source="chatwit",
        payload=payload_dict,
    ))

    logger.info(
        "chatwit_contact_created",
        extra={"lead_id": str(lead.id), "chatwit_contact_id": chatwit_cid, "identifier": identifier},
    )
    return {"status": "created", "lead_id": str(lead.id), "identifier": identifier}


async def _handle_conversation_resolved(
    payload_dict: dict[str, Any],
    session: AsyncSession,
    *,
    resolved_tenant_id: Optional[UUID] = None,
) -> dict[str, Any]:
    """
    Handle conversation.resolved events.

    Updates lead metadata with conversation resolution info.
    """
    try:
        payload = ChatwitConversationResolvedPayload.model_validate(payload_dict)
    except Exception:
        logger.warning("chatwit_conversation_invalid_payload")
        return {"status": "error", "message": "Payload inválido para conversation.resolved"}

    # Use pre-resolved tenant_id (from standard webhook) or resolve by account_id
    tenant_id = resolved_tenant_id
    if not tenant_id:
        account_id = payload.metadata.account_id
        tenant_id = await resolve_tenant_by_chatwit_account(session, account_id)
    if not tenant_id:
        logger.warning("chatwit_conversation_tenant_not_found")
        return {"status": "error", "message": "Tenant não encontrado"}

    # Extract contact ID from conversation data
    conv_data = payload.data.conversation
    contact_info = conv_data.get("contact", {})
    chatwit_cid = str(contact_info.get("id", ""))

    if not chatwit_cid or chatwit_cid == "":
        logger.info("chatwit_conversation_resolved_no_contact")
        return {"status": "received", "message": "Conversa resolvida sem contato vinculado"}

    lead_repo = LeadRepository(session, tenant_id)
    lead = await lead_repo.get_by_chatwit_contact(chatwit_cid)

    if lead:
        meta = dict(lead.lead_metadata or {})
        meta["last_conversation_resolved_at"] = datetime.now(timezone.utc).isoformat()
        meta["conversation_id"] = conv_data.get("id")
        await lead_repo.update(lead.id, lead_metadata=meta)
        await session.commit()
        logger.info("chatwit_conversation_resolved", extra={"lead_id": str(lead.id)})
        return {"status": "updated", "lead_id": str(lead.id)}

    logger.info("chatwit_conversation_resolved_lead_not_found", extra={"chatwit_contact_id": chatwit_cid})
    return {"status": "received", "message": "Lead não encontrado para este contato"}


# ── Chatwit /init endpoint ──────────────────────────────────────────────────


@router.post("/chatwit/init", response_model=ChatwitInitResponse)
async def chatwit_init(
    payload: ChatwitInitPayload,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> ChatwitInitResponse:
    """
    Called by Chatwit on agent-bot startup.

    Stores the bot token so we can send async replies later.
    Verifies via shared secret from settings.
    """
    if payload.secret != settings.chatwit_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Secret inválido",
        )

    # Find tenant by matching Chatwit base_url or store globally
    # For now, update the first tenant that has chatwit_account_id set,
    # or fall back to single-tenant.
    from sqlalchemy import select, update as sa_update

    result = await session.execute(
        select(Tenant).where(Tenant.chatwit_account_id.isnot(None)).limit(1)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        # Fallback: single active tenant
        result = await session.execute(
            select(Tenant).where(Tenant.is_active.is_(True)).limit(1)
        )
        tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum tenant ativo encontrado",
        )

    # Store bot token in tenant settings
    tenant_settings = dict(tenant.settings or {})
    tenant_settings["chatwit_agent_bot_token"] = payload.agent_bot_token
    tenant_settings["chatwit_base_url"] = payload.base_url
    tenant.settings = tenant_settings
    await session.commit()

    logger.info(
        "chatwit_init_success",
        extra={"tenant_id": str(tenant.id), "base_url": payload.base_url},
    )

    return ChatwitInitResponse(status="ok", message="Bot registrado com sucesso")


# ──────────────────────────────────────────────────────────────────────
# CHATWIT STANDARD WEBHOOK — Receives events via standard Chatwit webhook
# with ACCESS_TOKEN for tenant resolution (like SocialWise)
# ──────────────────────────────────────────────────────────────────────

# Mapping from standard Chatwit event names to internal event_type
_STANDARD_EVENT_MAP = {
    "message_created": "message.received",
    "contact_created": "contact.created",
    "contact_updated": "contact.updated",
    "conversation_updated": "conversation.updated",
    "conversation_resolved": "conversation.resolved",
    "conversation_status_changed": "conversation.resolved",
}


@router.post(
    "/chatwit/webhook",
    status_code=status.HTTP_200_OK,
    summary="Standard Chatwit webhook receiver (ACCESS_TOKEN-based)",
)
async def chatwit_standard_webhook(
    request: Request,
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict[str, Any]:
    """
    Receives standard Chatwit webhook payloads (same format SocialWise gets).

    Tenant resolution is via ACCESS_TOKEN in the payload body — no fallbacks.
    """
    try:
        payload_dict: dict[str, Any] = await request.json()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON: {e}",
        )

    access_token = payload_dict.get("ACCESS_TOKEN")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ACCESS_TOKEN ausente no payload",
        )

    # Resolve tenant strictly by token hash
    tenant_id = await resolve_tenant_by_access_token(session, access_token)
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum tenant vinculado a este ACCESS_TOKEN",
        )

    event_name = payload_dict.get("event", "unknown")
    internal_event = _STANDARD_EVENT_MAP.get(event_name, event_name)

    logger.info(
        "chatwit_standard_webhook_received",
        extra={"event": event_name, "internal_event": internal_event},
    )

    # Transform to internal format and delegate to existing handlers
    account_data = payload_dict.get("account", {})
    contact_data = payload_dict.get("contact", {})
    conversation_data = payload_dict.get("conversation", {})
    metadata_block = {
        "account_id": account_data.get("id", 0),
        "chatwit_base_url": "",
        "chatwit_agent_bot_token": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # ── contact.created / contact.updated ──
    if internal_event in ("contact.created", "contact.updated"):
        # Standard Chatwit webhook: for contact events, contact fields may be
        # nested under "contact" OR at the top level of the payload.
        src = contact_data if contact_data.get("id") else payload_dict
        internal_payload = {
            "event_type": internal_event,
            "data": {
                "id": src.get("id", 0),
                "name": src.get("name", ""),
                "email": src.get("email"),
                "phone_number": src.get("phone_number"),
                "identifier": src.get("identifier"),
                "custom_attributes": src.get("custom_attributes", {}),
                "account": account_data,
            },
            "metadata": metadata_block,
        }
        return await _handle_contact_event(internal_event, internal_payload, session, resolved_tenant_id=tenant_id)

    # ── message.received ──
    if internal_event == "message.received":
        # Build internal message format
        sender = payload_dict.get("sender", {})
        internal_payload = {
            "event_type": "message.received",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "contact": {
                "id": str(contact_data.get("id") or sender.get("id", "")),
                "name": contact_data.get("name") or sender.get("name", ""),
                "phone": contact_data.get("phone_number") or sender.get("phone_number", ""),
                "email": contact_data.get("email") or sender.get("email"),
                "tags": contact_data.get("label_list", []),
                "custom_fields": contact_data.get("custom_attributes", {}),
            },
            "message": {
                "id": str(payload_dict.get("id", "")),
                "direction": "inbound",
                "content": payload_dict.get("content", ""),
                "media_url": None,
                "channel": (payload_dict.get("inbox", {}).get("channel_type", "whatsapp")).split("::")[-1].lower(),
            },
            "metadata": {
                "account_id": account_data.get("id", 0),
                "conversation_id": conversation_data.get("id") if conversation_data else None,
            },
        }
        # Handle attachments
        attachments = payload_dict.get("attachments", [])
        if attachments and isinstance(attachments, list):
            internal_payload["message"]["media_url"] = attachments[0].get("data_url")

        return await _handle_message_event(internal_payload, session, resolved_tenant_id=tenant_id)

    # ── conversation.resolved ──
    if internal_event == "conversation.resolved":
        conv = conversation_data or payload_dict.get("conversation", {})
        # Check if it's actually resolved (conversation_status_changed can be any status)
        conv_status = conv.get("status")
        if event_name == "conversation_status_changed" and conv_status != "resolved":
            return {"status": "received", "event_type": event_name, "message": "Status não é resolved, ignorado"}

        internal_payload = {
            "event_type": "conversation.resolved",
            "data": {"conversation": conv},
            "metadata": metadata_block,
        }
        return await _handle_conversation_resolved(internal_payload, session, resolved_tenant_id=tenant_id)

    # ── conversation.updated (check for label changes) ──
    if internal_event == "conversation.updated":
        changed = payload_dict.get("changed_attributes", {})
        labels = conversation_data.get("labels", []) if conversation_data else []
        # Check for jusmonitoria label changes
        jm_labels = [l for l in labels if isinstance(l, str) and l.startswith("jusmonitoria_")]
        if jm_labels:
            logger.info("chatwit_standard_label_detected", extra={"labels": jm_labels})
        return {"status": "received", "event_type": event_name, "message": "Conversation updated processado"}

    # ── payment.* events (forwarded by Chatwit WebhookForwarder) ──
    if internal_event.startswith("payment."):
        # Payment events arrive with contract-aligned format already.
        # Inject metadata if missing (standard webhook has no bot token by default).
        if "metadata" not in payload_dict:
            payload_dict["metadata"] = metadata_block
        elif not payload_dict.get("metadata", {}).get("account_id"):
            payload_dict["metadata"]["account_id"] = account_data.get("id", 0)
        return await _handle_payment_event(internal_event, payload_dict, session)

    # Unknown/unmapped event
    logger.info("chatwit_standard_unmapped_event", extra={"event": event_name})
    return {"status": "received", "event_type": event_name}


# ──────────────────────────────────────────────────────────────────────
# CHATWIT INTEGRATION MANAGEMENT — Connect / Disconnect / Status
# ──────────────────────────────────────────────────────────────────────


@router.post(
    "/chatwit/connect",
    response_model=ChatwitConnectResponse,
    summary="Connect tenant to Chatwit",
)
async def chatwit_connect(
    body: ChatwitConnectRequest,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> ChatwitConnectResponse:
    """
    Validate ACCESS_TOKEN, register webhook in Chatwit, and link to tenant.

    Requires admin role.
    """
    try:
        result = await chatwit_integration_service.connect(
            access_token=body.access_token,
            base_url=body.base_url,
            tenant_id=user.tenant_id,
            session=session,
        )
        await session.commit()
    except ChatwitIntegrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    return ChatwitConnectResponse(**result)


@router.delete(
    "/chatwit/connect",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disconnect tenant from Chatwit",
)
async def chatwit_disconnect(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> None:
    """Remove Chatwit webhook and clear token from tenant."""
    try:
        await chatwit_integration_service.disconnect(user.tenant_id, session)
        await session.commit()
    except ChatwitIntegrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.get(
    "/chatwit/status",
    response_model=ChatwitStatusResponse,
    summary="Get Chatwit integration status",
)
async def chatwit_status(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> ChatwitStatusResponse:
    """Return whether the tenant has an active Chatwit integration."""
    result = await chatwit_integration_service.get_status(user.tenant_id, session)
    return ChatwitStatusResponse(**result)
