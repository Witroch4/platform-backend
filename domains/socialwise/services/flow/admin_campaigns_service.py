"""Business logic for the Campaigns admin group.

Port of:
- lib/queue/campaign-orchestrator.ts  (start, pause, resume, cancel, progress, batch)
- app/api/admin/mtf-diamante/campaigns/route.ts (list, create)
- app/api/admin/mtf-diamante/campaigns/[campaignId]/route.ts (detail, update, delete, actions)
- app/api/admin/mtf-diamante/campaigns/[campaignId]/contacts/route.ts (list, add, remove)
- app/api/admin/mtf-diamante/campaigns/[campaignId]/progress/route.ts (progress)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.flow import Flow
from domains.socialwise.db.models.flow_campaign import (
    FlowCampaign,
    FlowCampaignContact,
    FlowCampaignContactStatus,
    FlowCampaignStatus,
)
from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants (from campaign-orchestrator.ts)
# ---------------------------------------------------------------------------

BATCH_SIZE = 50
BACKPRESSURE_THRESHOLD = 1000

CHANNEL_RATE_LIMITS: dict[str, dict[str, int]] = {
    "whatsapp": {"perMinute": 30, "perHour": 1000},
    "instagram": {"perMinute": 20, "perHour": 500},
    "facebook": {"perMinute": 25, "perHour": 800},
    "default": {"perMinute": 20, "perHour": 400},
}


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class CampaignServiceError(Exception):
    """Base error for campaign service operations."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


# ---------------------------------------------------------------------------
# List campaigns
# ---------------------------------------------------------------------------


async def list_campaigns(
    session: AsyncSession,
    inbox_id: str,
    status_filter: str | None = None,
) -> list[dict[str, Any]]:
    """List campaigns for a given inbox, with optional status filter."""
    where_clauses = [FlowCampaign.inbox_id == inbox_id]
    if status_filter:
        where_clauses.append(FlowCampaign.status == FlowCampaignStatus(status_filter))

    result = await session.execute(
        select(FlowCampaign)
        .options(selectinload(FlowCampaign.flow), selectinload(FlowCampaign.contacts))
        .where(*where_clauses)
        .order_by(FlowCampaign.created_at.desc()),
    )
    campaigns = result.scalars().all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "flowId": c.flow_id,
            "flowName": c.flow.name if c.flow else None,
            "inboxId": c.inbox_id,
            "status": c.status.value if isinstance(c.status, FlowCampaignStatus) else str(c.status),
            "totalContacts": c.total_contacts,
            "sentCount": c.sent_count,
            "failedCount": c.failed_count,
            "skippedCount": c.skipped_count,
            "rateLimit": c.rate_limit,
            "contactCount": len(c.contacts) if c.contacts else 0,
            "scheduledAt": c.scheduled_at.isoformat() if c.scheduled_at else None,
            "startedAt": c.started_at.isoformat() if c.started_at else None,
            "completedAt": c.completed_at.isoformat() if c.completed_at else None,
            "createdAt": c.created_at.isoformat() if c.created_at else None,
            "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in campaigns
    ]


# ---------------------------------------------------------------------------
# Create campaign
# ---------------------------------------------------------------------------


async def create_campaign(
    session: AsyncSession,
    *,
    name: str,
    flow_id: str,
    inbox_id: str,
    rate_limit: int = 30,
    variables: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a new campaign in DRAFT status."""
    # Validate flow
    flow_result = await session.execute(
        select(Flow).where(Flow.id == flow_id),
    )
    flow = flow_result.scalar_one_or_none()

    if not flow:
        raise CampaignServiceError("Flow não encontrado", 404)
    if not flow.is_campaign:
        raise CampaignServiceError("Este flow não é de campanha. Apenas flows de campanha podem ser usados.")
    if not flow.is_active:
        raise CampaignServiceError("O flow está desativado")
    if flow.inbox_id != inbox_id:
        raise CampaignServiceError("Flow não pertence a esta inbox")

    campaign = FlowCampaign(
        name=name,
        flow_id=flow_id,
        inbox_id=inbox_id,
        status=FlowCampaignStatus.DRAFT,
        rate_limit=rate_limit,
        variables=variables or {},
    )
    session.add(campaign)
    await session.flush()

    return {
        "id": campaign.id,
        "name": campaign.name,
        "flowId": campaign.flow_id,
        "inboxId": campaign.inbox_id,
        "status": campaign.status.value,
        "rateLimit": campaign.rate_limit,
        "createdAt": campaign.created_at.isoformat() if campaign.created_at else None,
    }


# ---------------------------------------------------------------------------
# Campaign detail
# ---------------------------------------------------------------------------


async def get_campaign_detail(
    session: AsyncSession,
    campaign_id: str,
) -> dict[str, Any]:
    """Get full campaign details including recent contacts."""
    result = await session.execute(
        select(FlowCampaign)
        .options(selectinload(FlowCampaign.flow), selectinload(FlowCampaign.contacts))
        .where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise CampaignServiceError("Campanha não encontrada", 404)

    # Limit contacts to 200 most recent (by id desc — matches TS behavior)
    contacts_sorted = sorted(campaign.contacts or [], key=lambda c: c.id, reverse=True)[:200]

    return {
        "id": campaign.id,
        "name": campaign.name,
        "flowId": campaign.flow_id,
        "flowName": campaign.flow.name if campaign.flow else None,
        "inboxId": campaign.inbox_id,
        "status": campaign.status.value if isinstance(campaign.status, FlowCampaignStatus) else str(campaign.status),
        "totalContacts": campaign.total_contacts,
        "sentCount": campaign.sent_count,
        "failedCount": campaign.failed_count,
        "skippedCount": campaign.skipped_count,
        "rateLimit": campaign.rate_limit,
        "variables": campaign.variables,
        "contactCount": len(campaign.contacts) if campaign.contacts else 0,
        "contacts": [
            {
                "id": ct.id,
                "contactId": ct.contact_id,
                "contactPhone": ct.contact_phone,
                "contactName": ct.contact_name,
                "status": ct.status.value if isinstance(ct.status, FlowCampaignContactStatus) else str(ct.status),
                "sentAt": ct.sent_at.isoformat() if ct.sent_at else None,
                "errorMessage": ct.error_message,
                "retryCount": ct.retry_count,
            }
            for ct in contacts_sorted
        ],
        "scheduledAt": campaign.scheduled_at.isoformat() if campaign.scheduled_at else None,
        "startedAt": campaign.started_at.isoformat() if campaign.started_at else None,
        "completedAt": campaign.completed_at.isoformat() if campaign.completed_at else None,
        "createdAt": campaign.created_at.isoformat() if campaign.created_at else None,
        "updatedAt": campaign.updated_at.isoformat() if campaign.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Update campaign (DRAFT only)
# ---------------------------------------------------------------------------


async def update_campaign(
    session: AsyncSession,
    campaign_id: str,
    *,
    name: str | None = None,
    rate_limit: int | None = None,
    variables: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Update a campaign. Only DRAFT campaigns can be edited."""
    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise CampaignServiceError("Campanha não encontrada", 404)
    if campaign.status != FlowCampaignStatus.DRAFT:
        raise CampaignServiceError("Só é possível editar campanhas em rascunho")

    update_values: dict[str, Any] = {}
    if name is not None:
        update_values["name"] = name
    if rate_limit is not None:
        update_values["rate_limit"] = rate_limit
    if variables is not None:
        update_values["variables"] = variables

    if update_values:
        await session.execute(
            update(FlowCampaign).where(FlowCampaign.id == campaign_id).values(**update_values),
        )
        await session.flush()

    # Re-fetch for response
    result = await session.execute(select(FlowCampaign).where(FlowCampaign.id == campaign_id))
    updated = result.scalar_one()

    return {
        "id": updated.id,
        "name": updated.name,
        "flowId": updated.flow_id,
        "inboxId": updated.inbox_id,
        "status": updated.status.value,
        "rateLimit": updated.rate_limit,
        "variables": updated.variables,
        "createdAt": updated.created_at.isoformat() if updated.created_at else None,
        "updatedAt": updated.updated_at.isoformat() if updated.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Delete campaign (DRAFT or CANCELLED only)
# ---------------------------------------------------------------------------


async def delete_campaign(
    session: AsyncSession,
    campaign_id: str,
) -> None:
    """Delete a campaign. Only DRAFT or CANCELLED campaigns can be deleted."""
    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise CampaignServiceError("Campanha não encontrada", 404)
    if campaign.status not in (FlowCampaignStatus.DRAFT, FlowCampaignStatus.CANCELLED):
        raise CampaignServiceError("Só é possível excluir campanhas em rascunho ou canceladas")

    # Delete contacts first, then campaign
    await session.execute(
        delete(FlowCampaignContact).where(FlowCampaignContact.campaign_id == campaign_id),
    )
    await session.execute(
        delete(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )


# ---------------------------------------------------------------------------
# Campaign actions: start, pause, resume, cancel
# ---------------------------------------------------------------------------


async def start_campaign(
    session: AsyncSession,
    campaign_id: str,
) -> dict[str, Any]:
    """Start a campaign by enqueueing all pending contacts in batches."""
    from domains.socialwise.tasks.flow_campaign import process_flow_campaign_task

    result = await session.execute(
        select(FlowCampaign)
        .options(selectinload(FlowCampaign.flow), selectinload(FlowCampaign.contacts))
        .where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise CampaignServiceError("Campanha não encontrada", 404)
    if campaign.status not in (FlowCampaignStatus.DRAFT, FlowCampaignStatus.SCHEDULED):
        raise CampaignServiceError(f"Campanha em status inválido: {campaign.status.value}")
    if not campaign.flow or not campaign.flow.is_active:
        raise CampaignServiceError("Flow não está ativo")

    # Filter pending contacts
    pending_contacts = [
        c for c in (campaign.contacts or [])
        if c.status == FlowCampaignContactStatus.PENDING
    ]
    total_contacts = len(pending_contacts)

    if total_contacts == 0:
        raise CampaignServiceError("Nenhum contato pendente")

    # Update status to RUNNING
    await session.execute(
        update(FlowCampaign)
        .where(FlowCampaign.id == campaign_id)
        .values(
            status=FlowCampaignStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
            total_contacts=total_contacts,
        ),
    )
    await session.flush()

    # Create batches
    contact_ids = [c.id for c in pending_contacts]
    batches: list[list[str]] = []
    for i in range(0, total_contacts, BATCH_SIZE):
        batches.append(contact_ids[i : i + BATCH_SIZE])

    # Enqueue batches via TaskIQ
    for idx, batch in enumerate(batches):
        await process_flow_campaign_task.kiq({
            "jobType": "PROCESS_BATCH",
            "campaignId": campaign_id,
            "batchIndex": idx,
            "contactIds": batch,
            "flowId": campaign.flow_id,
            "inboxId": campaign.inbox_id,
        })

    logger.info(
        "campaign_started",
        campaign_id=campaign_id,
        total_contacts=total_contacts,
        batches_created=len(batches),
    )

    return {
        "success": True,
        "campaignId": campaign_id,
        "totalContacts": total_contacts,
        "batchesCreated": len(batches),
    }


async def pause_campaign(
    session: AsyncSession,
    campaign_id: str,
) -> bool:
    """Pause a running campaign."""
    from domains.socialwise.tasks.flow_campaign import process_flow_campaign_task

    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign or campaign.status != FlowCampaignStatus.RUNNING:
        return False

    await process_flow_campaign_task.kiq({
        "jobType": "CAMPAIGN_CONTROL",
        "campaignId": campaign_id,
        "action": "pause",
    })

    await session.execute(
        update(FlowCampaign)
        .where(FlowCampaign.id == campaign_id)
        .values(status=FlowCampaignStatus.PAUSED, paused_at=datetime.now(timezone.utc)),
    )

    logger.info("campaign_paused", campaign_id=campaign_id)
    return True


async def resume_campaign(
    session: AsyncSession,
    campaign_id: str,
) -> bool:
    """Resume a paused campaign."""
    from domains.socialwise.tasks.flow_campaign import process_flow_campaign_task

    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign or campaign.status != FlowCampaignStatus.PAUSED:
        return False

    await process_flow_campaign_task.kiq({
        "jobType": "CAMPAIGN_CONTROL",
        "campaignId": campaign_id,
        "action": "resume",
    })

    await session.execute(
        update(FlowCampaign)
        .where(FlowCampaign.id == campaign_id)
        .values(status=FlowCampaignStatus.RUNNING, paused_at=None),
    )

    logger.info("campaign_resumed", campaign_id=campaign_id)
    return True


async def cancel_campaign(
    session: AsyncSession,
    campaign_id: str,
    reason: str | None = None,
) -> bool:
    """Cancel a campaign and skip all pending contacts."""
    from domains.socialwise.tasks.flow_campaign import process_flow_campaign_task

    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign or campaign.status in (FlowCampaignStatus.COMPLETED, FlowCampaignStatus.CANCELLED):
        return False

    await process_flow_campaign_task.kiq({
        "jobType": "CAMPAIGN_CONTROL",
        "campaignId": campaign_id,
        "action": "cancel",
        "reason": reason,
    })

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
        .values(
            status=FlowCampaignContactStatus.SKIPPED,
            error_message=reason or "Campanha cancelada",
        ),
    )

    logger.info("campaign_cancelled", campaign_id=campaign_id, reason=reason)
    return True


# ---------------------------------------------------------------------------
# Campaign progress
# ---------------------------------------------------------------------------


async def get_campaign_progress(
    session: AsyncSession,
    campaign_id: str,
) -> dict[str, Any] | None:
    """Get real-time progress of a campaign."""
    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        return None

    pending_count = campaign.total_contacts - campaign.sent_count - campaign.failed_count - campaign.skipped_count
    total = campaign.total_contacts
    progress_percent = (
        round(((campaign.sent_count + campaign.failed_count + campaign.skipped_count) / total) * 100)
        if total > 0
        else 0
    )

    # Estimate remaining time
    estimated_time_remaining: int | None = None
    status_val = campaign.status.value if isinstance(campaign.status, FlowCampaignStatus) else str(campaign.status)
    if status_val == "RUNNING" and campaign.started_at and pending_count > 0:
        elapsed_ms = (datetime.now(timezone.utc) - campaign.started_at).total_seconds() * 1000
        processed = campaign.sent_count + campaign.failed_count
        if processed > 0:
            avg_time_per_contact = elapsed_ms / processed
            estimated_time_remaining = round((avg_time_per_contact * pending_count) / 1000)

    return {
        "campaignId": campaign.id,
        "status": status_val,
        "totalContacts": campaign.total_contacts,
        "sentCount": campaign.sent_count,
        "failedCount": campaign.failed_count,
        "skippedCount": campaign.skipped_count,
        "pendingCount": max(pending_count, 0),
        "progressPercent": progress_percent,
        "estimatedTimeRemaining": estimated_time_remaining,
    }


# ---------------------------------------------------------------------------
# Contacts CRUD
# ---------------------------------------------------------------------------


async def list_campaign_contacts(
    session: AsyncSession,
    campaign_id: str,
    *,
    status_filter: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> dict[str, Any]:
    """List contacts of a campaign with pagination."""
    where_clauses = [FlowCampaignContact.campaign_id == campaign_id]
    if status_filter:
        where_clauses.append(FlowCampaignContact.status == FlowCampaignContactStatus(status_filter))

    contacts_q = (
        select(FlowCampaignContact)
        .where(*where_clauses)
        .order_by(FlowCampaignContact.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    count_q = select(func.count(FlowCampaignContact.id)).where(*where_clauses)

    contacts_result, count_result = await session.execute(contacts_q), await session.execute(count_q)
    contacts = contacts_result.scalars().all()
    total = count_result.scalar_one()

    return {
        "data": [
            {
                "id": ct.id,
                "campaignId": ct.campaign_id,
                "contactId": ct.contact_id,
                "contactPhone": ct.contact_phone,
                "contactName": ct.contact_name,
                "status": ct.status.value if isinstance(ct.status, FlowCampaignContactStatus) else str(ct.status),
                "sessionId": ct.session_id,
                "sentAt": ct.sent_at.isoformat() if ct.sent_at else None,
                "errorMessage": ct.error_message,
                "retryCount": ct.retry_count,
                "variables": ct.variables,
            }
            for ct in contacts
        ],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": max(1, -(-total // limit)),  # ceil division
        },
    }


async def add_contacts_to_campaign(
    session: AsyncSession,
    campaign_id: str,
    *,
    contacts: list[dict[str, Any]] | None = None,
    select_all: bool = False,
) -> dict[str, Any]:
    """Add contacts to a DRAFT campaign. Deduplicates by phone."""
    # Verify DRAFT status
    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise CampaignServiceError("Campanha não encontrada", 404)
    if campaign.status != FlowCampaignStatus.DRAFT:
        raise CampaignServiceError("Só é possível adicionar contatos a campanhas em rascunho")

    # Get existing phones for dedup
    existing_result = await session.execute(
        select(FlowCampaignContact.contact_phone).where(
            FlowCampaignContact.campaign_id == campaign_id,
        ),
    )
    existing_phones: set[str] = {r[0] for r in existing_result.all() if r[0]}

    contacts_to_insert: list[dict[str, Any]] = []
    total_input = 0

    if select_all:
        # Fetch all leads with phone
        leads_result = await session.execute(
            select(LeadOabData)
            .options(selectinload(LeadOabData.lead))
            .join(Lead, LeadOabData.lead_id == Lead.id)
            .where(Lead.phone.isnot(None), Lead.phone != ""),
        )
        leads = leads_result.scalars().all()
        total_input = len(leads)

        for lead_oab in leads:
            lead = lead_oab.lead
            if lead and lead.phone and lead.phone not in existing_phones:
                contacts_to_insert.append({
                    "contactId": lead_oab.id,
                    "contactPhone": lead.phone,
                    "contactName": lead_oab.nome_real or lead.name or "",
                    "variables": {},
                })
    elif contacts:
        total_input = len(contacts)
        for c in contacts:
            phone = c.get("contactPhone", "")
            if phone and phone not in existing_phones:
                contacts_to_insert.append({
                    "contactId": c.get("contactId", ""),
                    "contactPhone": phone,
                    "contactName": c.get("contactName", ""),
                    "variables": c.get("variables", {}),
                })

    if not contacts_to_insert:
        return {"added": 0, "skipped": total_input}

    # Bulk insert
    for c in contacts_to_insert:
        contact_obj = FlowCampaignContact(
            campaign_id=campaign_id,
            contact_id=c["contactId"],
            contact_phone=c["contactPhone"],
            contact_name=c["contactName"],
            status=FlowCampaignContactStatus.PENDING,
            variables=c["variables"],
        )
        session.add(contact_obj)

    await session.flush()

    return {
        "added": len(contacts_to_insert),
        "skipped": total_input - len(contacts_to_insert),
    }


async def remove_contacts_from_campaign(
    session: AsyncSession,
    campaign_id: str,
    contact_ids: list[str],
) -> dict[str, Any]:
    """Remove contacts from a DRAFT campaign."""
    # Verify DRAFT
    result = await session.execute(
        select(FlowCampaign).where(FlowCampaign.id == campaign_id),
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise CampaignServiceError("Campanha não encontrada", 404)
    if campaign.status != FlowCampaignStatus.DRAFT:
        raise CampaignServiceError("Só é possível remover contatos de campanhas em rascunho")

    del_result = await session.execute(
        delete(FlowCampaignContact).where(
            FlowCampaignContact.campaign_id == campaign_id,
            FlowCampaignContact.id.in_(contact_ids),
        ),
    )

    return {"removed": del_result.rowcount}
