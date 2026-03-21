"""Webhook endpoints for external integrations."""

import hashlib
import hmac
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Header, Request, status

from platform_core.config import settings
from domains.jusmonitoria.schemas.chatwit import ChatwitWebhookPayload, ChatwitWebhookResponse
from domains.jusmonitoria.tasks.events.bus import publish
from domains.jusmonitoria.tasks.events.types import (
    EventType,
    MessageReceivedEvent,
    WebhookReceivedEvent,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_chatwit_signature(payload: bytes, signature: str) -> bool:
    """
    Verify HMAC signature from Chatwit webhook.
    
    Args:
        payload: Raw request body
        signature: X-Chatwit-Signature header value
        
    Returns:
        True if signature is valid, False otherwise
    """
    if not settings.chatwit_webhook_secret:
        logger.warning("chatwit_webhook_secret_not_configured")
        return True  # Allow in development
    
    expected_signature = hmac.new(
        settings.chatwit_webhook_secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)


@router.post(
    "/chatwit",
    response_model=ChatwitWebhookResponse,
    status_code=status.HTTP_200_OK,
    summary="Receive Chatwit webhooks",
    description="Endpoint to receive webhooks from Chatwit for message and tag events",
)
async def chatwit_webhook(
    request: Request,
    x_chatwit_signature: str | None = Header(None, alias="X-Chatwit-Signature"),
) -> ChatwitWebhookResponse:
    """
    Receive and process Chatwit webhooks.
    
    This endpoint:
    1. Validates HMAC signature
    2. Parses the webhook payload
    3. Publishes events to the event bus for async processing
    4. Responds quickly (< 5s) to avoid timeouts
    
    Supported events:
    - message.received: New message from contact
    - tag.added: Tag added to contact
    - tag.removed: Tag removed from contact
    """
    # Read raw body for signature verification
    body = await request.body()
    
    # Verify signature
    if x_chatwit_signature:
        if not verify_chatwit_signature(body, x_chatwit_signature):
            logger.warning(
                "chatwit_webhook_invalid_signature",
                signature=x_chatwit_signature,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature",
            )
    else:
        logger.warning("chatwit_webhook_no_signature")
    
    # Parse payload
    try:
        payload_dict: dict[str, Any] = await request.json()
        payload = ChatwitWebhookPayload(**payload_dict)
    except Exception as e:
        logger.error("chatwit_webhook_parse_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid webhook payload: {e}",
        )
    
    # Log webhook received
    logger.info(
        "chatwit_webhook_received",
        event_type=payload.event_type,
        contact_id=payload.contact.id,
        timestamp=payload.timestamp,
    )
    
    # For webhooks, we need to determine tenant_id from the contact
    # This will be handled by the event handlers
    # For now, we use a placeholder UUID that will be resolved later
    from uuid import UUID
    placeholder_tenant_id = UUID("00000000-0000-0000-0000-000000000000")
    
    # Publish generic webhook event
    webhook_event = WebhookReceivedEvent(
        tenant_id=placeholder_tenant_id,
        source="chatwit",
        payload=payload_dict,
    )
    await publish(webhook_event)
    
    # Publish specific events based on type
    if payload.event_type == "message.received" and payload.message:
        message_event = MessageReceivedEvent(
            tenant_id=placeholder_tenant_id,
            contact_id=payload.contact.id,
            message_id=payload.message.id,
            content=payload.message.content,
            channel=payload.message.channel,
            metadata={
                "contact_name": payload.contact.name,
                "contact_phone": payload.contact.phone,
                "contact_email": payload.contact.email,
                "contact_tags": payload.contact.tags,
            },
        )
        await publish(message_event)
        
        logger.info(
            "chatwit_message_received",
            contact_id=payload.contact.id,
            message_id=payload.message.id,
            channel=payload.message.channel,
        )
    
    elif payload.event_type == "tag.added" and payload.tag:
        logger.info(
            "chatwit_tag_added",
            contact_id=payload.contact.id,
            tag=payload.tag,
        )
    
    elif payload.event_type == "tag.removed" and payload.tag:
        logger.info(
            "chatwit_tag_removed",
            contact_id=payload.contact.id,
            tag=payload.tag,
        )
    
    # Return quick response
    return ChatwitWebhookResponse(
        status="received",
        event_id=str(webhook_event.event_id),
    )
