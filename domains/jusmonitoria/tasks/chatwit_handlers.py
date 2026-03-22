"""Chatwit event handlers for webhook processing."""

from datetime import datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.orm.attributes import flag_modified

from domains.jusmonitoria.db.session_compat import AsyncSessionLocal
from domains.jusmonitoria.db.models.lead import Lead, LeadSource, LeadStage, LeadStatus
from domains.jusmonitoria.db.repositories.client_automation import ClientAutomationRepository
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.tasks.events.bus import subscribe
from domains.jusmonitoria.tasks.events.types import EventType

logger = structlog.get_logger(__name__)

AUTOMATION_TAG_CONFIG = {
    "urgente": {"alertas_urgentes": False},
    "automatico": {
        "briefing_matinal": False,
        "alertas_urgentes": False,
        "resumo_semanal": False,
    },
}


def _get_lead_metadata(lead: Lead) -> dict[str, Any]:
    """Return mutable lead metadata across legacy/new field names."""
    if hasattr(lead, "lead_metadata"):
        metadata_attr = "lead_metadata"
    elif hasattr(lead, "metadata"):
        metadata_attr = "metadata"
    else:
        # Default to the current model field name when neither attribute exists yet.
        metadata_attr = "lead_metadata"

    metadata = getattr(lead, metadata_attr, None)

    if metadata is None:
        metadata = {}
        setattr(lead, metadata_attr, metadata)

    return metadata


def _mark_lead_metadata_modified(lead: Lead) -> None:
    """Mark lead metadata dirty so JSONB mutations are persisted."""
    metadata_attr = "lead_metadata" if hasattr(lead, "lead_metadata") else "metadata"
    flag_modified(lead, metadata_attr)


async def _get_or_create_tenant_id(
    chatwit_contact_id: str,
    account_id: int | None = None,
) -> UUID:
    """
    Resolve tenant_id from Chatwit account_id or contact.

    Uses ChatwitTenantResolver for account_id → tenant mapping.
    Falls back to single-tenant mode if no account_id provided.
    """
    if account_id:
        from domains.jusmonitoria.services.chatwit_tenant_resolver import resolve_tenant_by_chatwit_account

        async with AsyncSessionLocal() as session:
            tenant_id = await resolve_tenant_by_chatwit_account(session, account_id)
            if tenant_id:
                return tenant_id
            logger.warning(
                "chatwit_worker_tenant_not_found",
                extra={"account_id": account_id, "contact_id": chatwit_contact_id},
            )

    # Fallback: single-tenant deployments
    from domains.jusmonitoria.services.chatwit_tenant_resolver import resolve_tenant_by_chatwit_account

    async with AsyncSessionLocal() as session:
        tenant_id = await resolve_tenant_by_chatwit_account(session, None)
        if tenant_id:
            return tenant_id

    return UUID("00000000-0000-0000-0000-000000000001")


@subscribe(EventType.MESSAGE_RECEIVED)
async def handle_message_received(event_data: dict[str, Any]) -> None:
    """
    Handle message received from Chatwit.

    Creates or updates lead based on the contact information.

    Args:
        event_data: Message received event data
    """
    try:
        # Extract event data
        contact_id = event_data.get("contact_id")
        message_content = event_data.get("content")
        channel = event_data.get("channel")
        metadata = event_data.get("metadata", {})

        contact_name = metadata.get("contact_name")
        contact_phone = metadata.get("contact_phone")
        contact_email = metadata.get("contact_email")
        contact_tags = metadata.get("contact_tags", [])

        logger.info(
            "processing_message_received",
            contact_id=contact_id,
            channel=channel,
            has_tags=len(contact_tags) > 0,
        )

        # Resolve tenant_id from account_id (preferred) or contact
        account_id = metadata.get("account_id")
        tenant_id = await _get_or_create_tenant_id(contact_id, account_id=account_id)

        # Create database session
        async with AsyncSessionLocal() as session:
            lead_repo = LeadRepository(session, tenant_id)

            # Check if lead already exists
            existing_lead = await lead_repo.get_by_chatwit_contact(contact_id)

            if existing_lead:
                # Update existing lead
                logger.info(
                    "updating_existing_lead",
                    lead_id=str(existing_lead.id),
                    contact_id=contact_id,
                )

                # Update last interaction metadata
                meta = _get_lead_metadata(existing_lead)
                meta["last_message"] = message_content
                meta["last_message_at"] = datetime.utcnow().isoformat()
                meta["last_channel"] = channel
                _mark_lead_metadata_modified(existing_lead)

                await session.commit()

                logger.info(
                    "lead_updated",
                    lead_id=str(existing_lead.id),
                    contact_id=contact_id,
                )
            else:
                # Create new lead
                logger.info(
                    "creating_new_lead",
                    contact_id=contact_id,
                    contact_name=contact_name,
                )

                lead = await lead_repo.create(
                    full_name=contact_name or "Unknown",
                    phone=contact_phone,
                    email=contact_email,
                    source=LeadSource.CHATWIT,
                    chatwit_contact_id=contact_id,
                    stage=LeadStage.NEW,
                    status=LeadStatus.ACTIVE,
                    score=0,
                    lead_metadata={
                        "first_message": message_content,
                        "first_message_at": datetime.utcnow().isoformat(),
                        "channel": channel,
                        "tags": contact_tags,
                    },
                )

                await session.commit()

                # Sync identifier to Chatwit (bidirectional link)
                chatwit_base_url = metadata.get("chatwit_base_url", "")
                chatwit_bot_token = metadata.get("chatwit_agent_bot_token", "")
                if chatwit_base_url and chatwit_bot_token and account_id:
                    from domains.jusmonitoria.services.chatwit_client import sync_identifier_to_chatwit

                    await sync_identifier_to_chatwit(
                        entity_id=str(lead.id),
                        chatwit_contact_id=contact_id,
                        metadata=metadata,
                        entity_type="lead",
                    )

                logger.info(
                    "lead_created",
                    lead_id=str(lead.id),
                    contact_id=contact_id,
                    tenant_id=str(tenant_id),
                )

    except Exception as e:
        logger.error(
            "message_received_handler_failed",
            error=str(e),
            contact_id=event_data.get("contact_id"),
        )
        raise


@subscribe(EventType.WEBHOOK_RECEIVED)
async def handle_webhook_received(event_data: dict[str, Any]) -> None:
    """
    Handle generic webhook received from Chatwit.

    Routes to specific handlers based on event type.

    Args:
        event_data: Webhook event data
    """
    try:
        payload = event_data.get("payload", {})
        event_type = payload.get("event_type")

        logger.info(
            "processing_webhook",
            event_type=event_type,
            source=event_data.get("source"),
        )

        # Route to specific handlers
        if event_type == "tag.added":
            await handle_tag_added(payload)
        elif event_type == "tag.removed":
            await handle_tag_removed(payload)
        else:
            logger.debug(
                "webhook_event_not_handled",
                event_type=event_type,
            )

    except Exception as e:
        logger.error(
            "webhook_handler_failed",
            error=str(e),
            event_type=event_data.get("payload", {}).get("event_type"),
        )
        raise


async def handle_tag_added(payload: dict[str, Any]) -> None:
    """
    Handle tag added to contact.

    Updates lead status based on tag mapping.

    Args:
        payload: Webhook payload with tag information
    """
    try:
        contact = payload.get("contact", {})
        contact_id = contact.get("id")
        tag = payload.get("tag")

        logger.info(
            "processing_tag_added",
            contact_id=contact_id,
            tag=tag,
        )

        # Resolve tenant_id
        account_id = payload.get("metadata", {}).get("account_id")
        tenant_id = await _get_or_create_tenant_id(contact_id, account_id=account_id)

        # Create database session
        async with AsyncSessionLocal() as session:
            lead_repo = LeadRepository(session, tenant_id)

            # Get lead by contact ID
            lead = await lead_repo.get_by_chatwit_contact(contact_id)

            if not lead:
                logger.warning(
                    "lead_not_found_for_tag",
                    contact_id=contact_id,
                    tag=tag,
                )
                return

            # Map tags to lead stages
            tag_to_stage = {
                "qualificado": LeadStage.QUALIFIED,
                "proposta": LeadStage.PROPOSAL,
                "negociacao": LeadStage.NEGOTIATION,
                "convertido": LeadStage.CONVERTED,
                "contatado": LeadStage.CONTACTED,
            }

            # Update stage if tag matches
            new_stage = tag_to_stage.get(tag.lower())
            if new_stage:
                old_stage = lead.stage
                await lead_repo.update_stage(lead.id, new_stage)

                logger.info(
                    "lead_stage_updated_by_tag",
                    lead_id=str(lead.id),
                    contact_id=contact_id,
                    tag=tag,
                    old_stage=old_stage,
                    new_stage=new_stage,
                )

            # Update metadata with tag
            meta = _get_lead_metadata(lead)

            if "tags" not in meta:
                meta["tags"] = []

            if tag not in meta["tags"]:
                meta["tags"].append(tag)
                _mark_lead_metadata_modified(lead)

            await session.commit()

            logger.info(
                "tag_added_processed",
                lead_id=str(lead.id),
                contact_id=contact_id,
                tag=tag,
            )

    except Exception as e:
        logger.error(
            "tag_added_handler_failed",
            error=str(e),
            contact_id=payload.get("contact", {}).get("id"),
            tag=payload.get("tag"),
        )
        raise


async def handle_tag_removed(payload: dict[str, Any]) -> None:
    """
    Handle tag removed from contact.

    Removes automations or updates lead status.

    Args:
        payload: Webhook payload with tag information
    """
    try:
        contact = payload.get("contact", {})
        contact_id = contact.get("id")
        tag = payload.get("tag")
        normalized_tag = (tag or "").lower()

        logger.info(
            "processing_tag_removed",
            contact_id=contact_id,
            tag=tag,
        )

        # Resolve tenant_id
        account_id = payload.get("metadata", {}).get("account_id")
        tenant_id = await _get_or_create_tenant_id(contact_id, account_id=account_id)

        # Create database session
        async with AsyncSessionLocal() as session:
            lead_repo = LeadRepository(session, tenant_id)

            # Get lead by contact ID
            lead = await lead_repo.get_by_chatwit_contact(contact_id)

            if not lead:
                logger.warning(
                    "lead_not_found_for_tag_removal",
                    contact_id=contact_id,
                    tag=tag,
                )
                return

            metadata = _get_lead_metadata(lead)

            # Remove tag from metadata
            if "tags" in metadata and tag in metadata["tags"]:
                metadata["tags"].remove(tag)
                _mark_lead_metadata_modified(lead)

            # Remove pending follow-up automation when the tag is removed
            if normalized_tag in {"follow_up", "automatico"}:
                follow_ups = metadata.get("follow_ups", [])
                malformed_follow_ups = [
                    follow_up for follow_up in follow_ups if not isinstance(follow_up, dict)
                ]
                if malformed_follow_ups:
                    logger.warning(
                        "malformed_follow_up_entries_removed_by_tag",
                        lead_id=str(lead.id),
                        contact_id=contact_id,
                        tag=tag,
                        removed_count=len(malformed_follow_ups),
                    )
                remaining_follow_ups = [
                    follow_up
                    for follow_up in follow_ups
                    if isinstance(follow_up, dict) and follow_up.get("status") != "pending"
                ]
                if len(remaining_follow_ups) != len(follow_ups):
                    metadata["follow_ups"] = remaining_follow_ups
                    _mark_lead_metadata_modified(lead)
                    logger.info(
                        "lead_follow_up_automation_removed_by_tag",
                        lead_id=str(lead.id),
                        contact_id=contact_id,
                        tag=tag,
                        removed_count=len(follow_ups) - len(remaining_follow_ups),
                    )

            automation_config = AUTOMATION_TAG_CONFIG.get(normalized_tag)
            if automation_config and lead.converted_to_client_id:
                automation_repo = ClientAutomationRepository(session, tenant_id)
                await automation_repo.update_config(
                    client_id=lead.converted_to_client_id,
                    **automation_config,
                )
                logger.info(
                    "client_automation_removed_by_tag",
                    lead_id=str(lead.id),
                    client_id=str(lead.converted_to_client_id),
                    contact_id=contact_id,
                    tag=tag,
                    config=automation_config,
                )
            elif automation_config:
                logger.warning(
                    "client_automation_tag_removed_without_converted_client",
                    lead_id=str(lead.id),
                    contact_id=contact_id,
                    tag=tag,
                )

            await session.commit()

            logger.info(
                "tag_removed_processed",
                lead_id=str(lead.id),
                contact_id=contact_id,
                tag=tag,
            )

    except Exception as e:
        logger.error(
            "tag_removed_handler_failed",
            error=str(e),
            contact_id=payload.get("contact", {}).get("id"),
            tag=payload.get("tag"),
        )
        raise
