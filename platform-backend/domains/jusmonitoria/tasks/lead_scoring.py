"""Taskiq workers for lead scoring."""

import logging
from uuid import UUID

from domains.jusmonitoria.services.crm.lead_scorer import LeadScorer
from domains.jusmonitoria.db.session_compat import session_ctx
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.base import BaseTask

logger = logging.getLogger(__name__)


class LeadScoringTask(BaseTask):
    """Base task for lead scoring operations."""
    
    pass


@broker.task(retry_on_error=True, max_retries=3)
async def score_lead_task(
    tenant_id: str,
    lead_id: str,
    ai_summary: str | None = None,
) -> dict:
    """
    Score a lead using AI analysis.
    
    Args:
        tenant_id: Tenant UUID as string
        lead_id: Lead UUID as string
        ai_summary: Optional AI-generated summary
        
    Returns:
        Dict with lead_id and new score
    """
    logger.info(
        "Starting lead scoring task",
        extra={
            "tenant_id": tenant_id,
            "lead_id": lead_id,
        },
    )
    
    async with session_ctx() as session:
        scorer = LeadScorer(session, UUID(tenant_id))
        
        try:
            lead = await scorer.update_lead_score(
                lead_id=UUID(lead_id),
                ai_summary=ai_summary,
            )
            
            await session.commit()
            
            logger.info(
                "Lead scored successfully",
                extra={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "score": lead.score,
                },
            )
            
            return {
                "lead_id": str(lead.id),
                "score": lead.score,
                "success": True,
            }
        
        except Exception as e:
            logger.error(
                "Failed to score lead",
                extra={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "error": str(e),
                },
                exc_info=True,
            )
            raise


@broker.task(retry_on_error=True, max_retries=2)
async def score_all_tenant_leads_task(tenant_id: str) -> dict:
    """
    Recalculate scores for all active leads in a tenant.
    
    Args:
        tenant_id: Tenant UUID as string
        
    Returns:
        Dict with count of scored leads
    """
    logger.info(
        "Starting bulk lead scoring task",
        extra={"tenant_id": tenant_id},
    )
    
    async with session_ctx() as session:
        scorer = LeadScorer(session, UUID(tenant_id))
        
        try:
            count = await scorer.score_all_leads()
            await session.commit()
            
            logger.info(
                "Bulk lead scoring completed",
                extra={
                    "tenant_id": tenant_id,
                    "count": count,
                },
            )
            
            return {
                "tenant_id": tenant_id,
                "count": count,
                "success": True,
            }
        
        except Exception as e:
            logger.error(
                "Failed to score tenant leads",
                extra={
                    "tenant_id": tenant_id,
                    "error": str(e),
                },
                exc_info=True,
            )
            raise


@broker.task(retry_on_error=True, max_retries=3)
async def handle_lead_event_scoring(event_data: dict) -> dict:
    """
    Handle lead-related events and update score accordingly.
    
    Triggered by:
    - New message received
    - Lead stage changed
    - Timeline event created
    
    Args:
        event_data: Event payload with tenant_id, lead_id, event_type
        
    Returns:
        Dict with scoring result
    """
    tenant_id = event_data.get("tenant_id")
    lead_id = event_data.get("lead_id")
    event_type = event_data.get("event_type")
    
    if not tenant_id or not lead_id:
        logger.warning(
            "Missing required fields in event data",
            extra={"event_data": event_data},
        )
        return {"success": False, "error": "Missing tenant_id or lead_id"}
    
    logger.info(
        "Handling lead event for scoring",
        extra={
            "tenant_id": tenant_id,
            "lead_id": lead_id,
            "event_type": event_type,
        },
    )
    
    # Trigger lead scoring
    await score_lead_task.kiq(
        tenant_id=tenant_id,
        lead_id=lead_id,
        ai_summary=event_data.get("ai_summary"),
    )
    
    return {
        "success": True,
        "lead_id": lead_id,
        "event_type": event_type,
    }
