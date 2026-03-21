"""TaskIQ worker for Socialwise Flow Campaign jobs.

Port of worker/WebhookWorkerTasks/flow-campaign.task.ts + lib/queue/campaign-orchestrator.ts.

Three job types: EXECUTE_CONTACT, PROCESS_BATCH, CAMPAIGN_CONTROL.
Plus campaign orchestration logic (start, pause, resume, cancel, progress, completion).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update

from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.models.flow import Flow
from domains.socialwise.db.models.flow_campaign import (
    FlowCampaign,
    FlowCampaignContact,
    FlowCampaignContactStatus,
    FlowCampaignStatus,
)
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.chatwit_config import get_chatwit_system_config
from domains.socialwise.services.flow.conversation_resolver import ChatwitConversationResolver
from domains.socialwise.services.flow.delivery_service import DeliveryContext
from domains.socialwise.services.flow.orchestrator import FlowOrchestrator
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants (from campaign-orchestrator.ts)
# ---------------------------------------------------------------------------

BATCH_SIZE = 50
CHANNEL_RATE_LIMITS: dict[str, dict[str, int]] = {
    "whatsapp": {"perMinute": 30, "perHour": 1000},
    "instagram": {"perMinute": 20, "perHour": 500},
    "facebook": {"perMinute": 25, "perHour": 800},
    "default": {"perMinute": 20, "perHour": 400},
}


# ---------------------------------------------------------------------------
# Campaign orchestration helpers
# ---------------------------------------------------------------------------

async def check_campaign_completion(campaign_id: str) -> bool:
    """Check if all contacts have been processed and mark campaign as complete."""
    async with session_ctx() as session:
        pending_count = (await session.execute(
            select(func.count(FlowCampaignContact.id)).where(
                FlowCampaignContact.campaign_id == campaign_id,
                FlowCampaignContact.status.in_([
                    FlowCampaignContactStatus.PENDING,
                    FlowCampaignContactStatus.QUEUED,
                ]),
            ),
        )).scalar_one()

        if pending_count == 0:
            await _complete_campaign(session, campaign_id)
            await session.commit()
            return True

    return False


async def _complete_campaign(session: Any, campaign_id: str) -> None:
    """Mark a campaign as completed with final counts."""
    # Compute final counts
    counts_result = await session.execute(
        select(FlowCampaignContact.status, func.count(FlowCampaignContact.id))
        .where(FlowCampaignContact.campaign_id == campaign_id)
        .group_by(FlowCampaignContact.status),
    )
    counts = {
        (row[0].value if isinstance(row[0], FlowCampaignContactStatus) else str(row[0])): row[1]
        for row in counts_result.all()
    }

    await session.execute(
        update(FlowCampaign)
        .where(FlowCampaign.id == campaign_id)
        .values(
            status=FlowCampaignStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
            sent_count=counts.get("SENT", 0),
            failed_count=counts.get("FAILED", 0),
            skipped_count=counts.get("SKIPPED", 0),
        ),
    )

    logger.info(
        "campaign_completed",
        campaign_id=campaign_id,
        sent=counts.get("SENT", 0),
        failed=counts.get("FAILED", 0),
        skipped=counts.get("SKIPPED", 0),
    )


async def _process_batch(
    campaign_id: str,
    contact_ids: list[str],
    flow_id: str,
    inbox_id: str,
) -> dict[str, int]:
    """Process a batch of contacts: mark as QUEUED and enqueue individual jobs."""
    success = 0
    failed = 0

    async with session_ctx() as session:
        for contact_db_id in contact_ids:
            try:
                contact_result = await session.execute(
                    select(FlowCampaignContact).where(FlowCampaignContact.id == contact_db_id),
                )
                contact = contact_result.scalar_one_or_none()
                if not contact:
                    failed += 1
                    continue

                # Fetch campaign variables
                campaign_result = await session.execute(
                    select(FlowCampaign.variables).where(FlowCampaign.id == campaign_id),
                )
                campaign_vars = campaign_result.scalar_one_or_none() or {}

                # Mark as QUEUED
                await session.execute(
                    update(FlowCampaignContact)
                    .where(FlowCampaignContact.id == contact_db_id)
                    .values(status=FlowCampaignContactStatus.QUEUED),
                )

                # Enqueue individual EXECUTE_CONTACT task
                merged_vars = {**(campaign_vars if isinstance(campaign_vars, dict) else {}), **(contact.variables or {})}
                await process_flow_campaign_task.kiq({
                    "jobType": "EXECUTE_CONTACT",
                    "campaignId": campaign_id,
                    "contactId": contact_db_id,
                    "contactPhone": contact.contact_phone,
                    "contactName": contact.contact_name,
                    "flowId": flow_id,
                    "inboxId": inbox_id,
                    "variables": merged_vars,
                })
                success += 1

            except Exception as exc:
                logger.error("campaign_batch_contact_error", contact_id=contact_db_id, error=str(exc))
                failed += 1

        await session.commit()

    return {"success": success, "failed": failed}


# ---------------------------------------------------------------------------
# Job handlers
# ---------------------------------------------------------------------------

async def _handle_execute_contact(job_data: dict[str, Any]) -> dict[str, Any]:
    """Execute a flow for a single campaign contact."""
    campaign_id = job_data["campaignId"]
    contact_id = job_data["contactId"]
    contact_phone = job_data.get("contactPhone")
    contact_name = job_data.get("contactName")
    flow_id = job_data["flowId"]
    inbox_id = job_data["inboxId"]
    variables = job_data.get("variables", {})

    # Load inbox data
    async with session_ctx() as session:
        inbox_result = await session.execute(
            select(ChatwitInbox).where(ChatwitInbox.id == inbox_id),
        )
        inbox = inbox_result.scalar_one_or_none()

    if not inbox or not inbox.usuario_chatwit:
        raise RuntimeError(f"Inbox {inbox_id} not found or has no associated account")

    # Bot token + base URL from SystemConfig
    chatwit_config = await get_chatwit_system_config()

    if not contact_phone:
        # Mark as SKIPPED
        async with session_ctx() as session:
            await session.execute(
                update(FlowCampaignContact)
                .where(FlowCampaignContact.id == contact_id)
                .values(status=FlowCampaignContactStatus.SKIPPED, error_message="Contato sem telefone"),
            )
            await session.execute(
                update(FlowCampaign)
                .where(FlowCampaign.id == campaign_id)
                .values(skipped_count=FlowCampaign.skipped_count + 1),
            )
            await session.commit()
        await check_campaign_completion(campaign_id)
        return {"success": True, "jobType": "EXECUTE_CONTACT", "campaignId": campaign_id, "contactId": contact_id}

    # Resolve contact + conversation in Chatwit
    resolver = ChatwitConversationResolver(chatwit_config.base_url, chatwit_config.bot_token)
    resolved = await resolver.resolve(
        int(inbox.usuario_chatwit.chatwit_account_id or 0),
        int(inbox.inbox_id),
        contact_phone,
        contact_name or None,
    )

    logger.info(
        "campaign_contact_conversation_resolved",
        contact_id=resolved.contact_id,
        conversation_id=resolved.conversation_id,
        display_id=resolved.display_id,
        contact_phone=contact_phone,
    )

    delivery_context = DeliveryContext(
        account_id=int(inbox.usuario_chatwit.chatwit_account_id or 0),
        conversation_id=resolved.conversation_id,
        conversation_display_id=resolved.display_id,
        inbox_id=int(inbox.inbox_id),
        contact_id=resolved.contact_id,
        contact_name=contact_name or "",
        contact_phone=contact_phone or "",
        channel_type=inbox.channel_type or "whatsapp",
        prisma_inbox_id=inbox.id,
        chatwit_access_token=chatwit_config.bot_token,
        chatwit_base_url=chatwit_config.base_url,
    )

    orchestrator = FlowOrchestrator()
    flow_result = await orchestrator.execute_flow_by_id(
        flow_id,
        delivery_context,
        force_async=True,
        initial_variables=variables if isinstance(variables, dict) else None,
    )

    if flow_result.error:
        async with session_ctx() as session:
            await session.execute(
                update(FlowCampaignContact)
                .where(FlowCampaignContact.id == contact_id)
                .values(status=FlowCampaignContactStatus.FAILED, error_message=flow_result.error),
            )
            await session.execute(
                update(FlowCampaign)
                .where(FlowCampaign.id == campaign_id)
                .values(failed_count=FlowCampaign.failed_count + 1),
            )
            await session.commit()
        await check_campaign_completion(campaign_id)
        return {
            "success": False,
            "jobType": "EXECUTE_CONTACT",
            "campaignId": campaign_id,
            "contactId": contact_id,
            "error": flow_result.error,
        }

    async with session_ctx() as session:
        await session.execute(
            update(FlowCampaignContact)
            .where(FlowCampaignContact.id == contact_id)
            .values(
                status=FlowCampaignContactStatus.SENT,
                sent_at=datetime.now(timezone.utc),
                session_id=flow_result.session_id,
            ),
        )
        await session.execute(
            update(FlowCampaign)
            .where(FlowCampaign.id == campaign_id)
            .values(sent_count=FlowCampaign.sent_count + 1),
        )
        await session.commit()

    await check_campaign_completion(campaign_id)

    return {
        "success": True,
        "jobType": "EXECUTE_CONTACT",
        "campaignId": campaign_id,
        "contactId": contact_id,
        "conversationId": resolved.conversation_id,
        "sessionId": flow_result.session_id,
    }


async def _handle_process_batch(job_data: dict[str, Any]) -> dict[str, Any]:
    campaign_id = job_data["campaignId"]
    batch_index = job_data.get("batchIndex", 0)
    contact_ids = job_data["contactIds"]
    flow_id = job_data["flowId"]
    inbox_id = job_data["inboxId"]

    logger.info(
        "campaign_processing_batch",
        campaign_id=campaign_id,
        batch_index=batch_index,
        contact_count=len(contact_ids),
    )

    result = await _process_batch(campaign_id, contact_ids, flow_id, inbox_id)

    return {
        "success": True,
        "jobType": "PROCESS_BATCH",
        "campaignId": campaign_id,
        "batchIndex": batch_index,
        **result,
    }


async def _handle_campaign_control(job_data: dict[str, Any]) -> dict[str, Any]:
    campaign_id = job_data["campaignId"]
    action = job_data["action"]
    reason = job_data.get("reason")

    logger.info("campaign_control", campaign_id=campaign_id, action=action, reason=reason)

    if action == "pause":
        async with session_ctx() as session:
            await session.execute(
                update(FlowCampaign)
                .where(FlowCampaign.id == campaign_id)
                .values(status=FlowCampaignStatus.PAUSED, paused_at=datetime.now(timezone.utc)),
            )
            await session.commit()

    elif action == "cancel":
        async with session_ctx() as session:
            await session.execute(
                update(FlowCampaign)
                .where(FlowCampaign.id == campaign_id)
                .values(status=FlowCampaignStatus.CANCELLED, completed_at=datetime.now(timezone.utc)),
            )
            # Mark pending contacts as SKIPPED
            await session.execute(
                update(FlowCampaignContact)
                .where(
                    FlowCampaignContact.campaign_id == campaign_id,
                    FlowCampaignContact.status.in_([
                        FlowCampaignContactStatus.PENDING,
                        FlowCampaignContactStatus.QUEUED,
                    ]),
                )
                .values(status=FlowCampaignContactStatus.SKIPPED, error_message=reason or "Campanha cancelada"),
            )
            await session.commit()

    elif action == "resume":
        async with session_ctx() as session:
            await session.execute(
                update(FlowCampaign)
                .where(FlowCampaign.id == campaign_id)
                .values(status=FlowCampaignStatus.RUNNING, paused_at=None),
            )
            await session.commit()

    elif action == "complete":
        await check_campaign_completion(campaign_id)

    return {"success": True, "jobType": "CAMPAIGN_CONTROL", "campaignId": campaign_id, "action": action}


# ---------------------------------------------------------------------------
# Main task processor
# ---------------------------------------------------------------------------

_HANDLERS: dict[str, Any] = {
    "EXECUTE_CONTACT": _handle_execute_contact,
    "PROCESS_BATCH": _handle_process_batch,
    "CAMPAIGN_CONTROL": _handle_campaign_control,
}


@broker.task(retry_on_error=True, max_retries=3)
async def process_flow_campaign_task(job_data: dict[str, Any]) -> dict[str, Any]:
    """Main FlowCampaign queue processor. Routes to the appropriate handler."""
    start = time.monotonic()
    job_type = job_data.get("jobType", "UNKNOWN")
    campaign_id = job_data.get("campaignId", "")

    logger.info(
        "flow_campaign_processing",
        job_type=job_type,
        campaign_id=campaign_id,
    )

    handler = _HANDLERS.get(job_type)
    if not handler:
        raise ValueError(f"Unknown campaign job type: {job_type}")

    try:
        result = await handler(job_data)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        result["processingTimeMs"] = elapsed_ms
        logger.info(
            "flow_campaign_completed",
            job_type=job_type,
            campaign_id=campaign_id,
            processing_time_ms=elapsed_ms,
        )
        return result
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "flow_campaign_error",
            job_type=job_type,
            campaign_id=campaign_id,
            error=str(exc),
            processing_time_ms=elapsed_ms,
        )

        # On last attempt for EXECUTE_CONTACT, mark as FAILED
        if job_type == "EXECUTE_CONTACT":
            contact_id = job_data.get("contactId")
            if contact_id:
                try:
                    async with session_ctx() as session:
                        await session.execute(
                            update(FlowCampaignContact)
                            .where(FlowCampaignContact.id == contact_id)
                            .values(
                                status=FlowCampaignContactStatus.FAILED,
                                error_message=str(exc)[:500],
                            ),
                        )
                        await session.execute(
                            update(FlowCampaign)
                            .where(FlowCampaign.id == campaign_id)
                            .values(failed_count=FlowCampaign.failed_count + 1),
                        )
                        await session.commit()
                    await check_campaign_completion(campaign_id)
                except Exception as update_err:
                    logger.error("campaign_contact_fail_update_error", contact_id=contact_id, error=str(update_err))

        raise
