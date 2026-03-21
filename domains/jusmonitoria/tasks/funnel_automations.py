"""Taskiq workers for funnel automations."""

import logging
from uuid import UUID

from domains.jusmonitoria.services.chatwit_client import ChatwitService
from domains.jusmonitoria.services.crm.funnel_automations import FunnelAutomations
from platform_core.db.sessions import session_ctx
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.base import BaseTask

logger = logging.getLogger(__name__)


class FunnelAutomationTask(BaseTask):
    """Base task for funnel automation operations."""
    
    pass


@broker.task(retry_on_error=True, max_retries=3)
async def process_new_lead_automations(
    tenant_id: str,
    lead_id: str,
    ai_summary: str | None = None,
    chatwit_api_key: str | None = None,
) -> dict:
    """
    Process all automations for a newly created lead.
    
    Args:
        tenant_id: Tenant UUID as string
        lead_id: Lead UUID as string
        ai_summary: Optional AI-generated summary
        chatwit_api_key: Optional Chatwit API key for messaging
        
    Returns:
        Dict with automation results
    """
    logger.info(
        "Starting new lead automations",
        extra={
            "tenant_id": tenant_id,
            "lead_id": lead_id,
        },
    )
    
    async with session_ctx() as session:
        # Initialize Chatwit service if API key provided
        chatwit_service = None
        if chatwit_api_key:
            chatwit_service = ChatwitService(
                api_key=chatwit_api_key,
            )
        
        automations = FunnelAutomations(
            session=session,
            tenant_id=UUID(tenant_id),
            chatwit_service=chatwit_service,
        )
        
        try:
            results = await automations.process_new_lead(
                lead_id=UUID(lead_id),
                ai_summary=ai_summary,
            )
            
            await session.commit()
            
            logger.info(
                "New lead automations completed",
                extra={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "results": results,
                },
            )
            
            return results
        
        except Exception as e:
            logger.error(
                "Failed to process new lead automations",
                extra={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "error": str(e),
                },
                exc_info=True,
            )
            raise


@broker.task(retry_on_error=True, max_retries=3)
async def process_score_update_automations(
    tenant_id: str,
    lead_id: str,
    old_score: int,
    new_score: int,
) -> dict:
    """
    Process automations triggered by lead score update.
    
    Args:
        tenant_id: Tenant UUID as string
        lead_id: Lead UUID as string
        old_score: Previous score
        new_score: New score
        
    Returns:
        Dict with automation results
    """
    logger.info(
        "Starting score update automations",
        extra={
            "tenant_id": tenant_id,
            "lead_id": lead_id,
            "old_score": old_score,
            "new_score": new_score,
        },
    )
    
    async with session_ctx() as session:
        automations = FunnelAutomations(
            session=session,
            tenant_id=UUID(tenant_id),
        )
        
        try:
            await automations.process_score_update(
                lead_id=UUID(lead_id),
                old_score=old_score,
                new_score=new_score,
            )
            
            await session.commit()
            
            logger.info(
                "Score update automations completed",
                extra={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                },
            )
            
            return {
                "success": True,
                "lead_id": lead_id,
                "old_score": old_score,
                "new_score": new_score,
            }
        
        except Exception as e:
            logger.error(
                "Failed to process score update automations",
                extra={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "error": str(e),
                },
                exc_info=True,
            )
            raise


@broker.task(retry_on_error=True, max_retries=2)
async def send_follow_up_reminder(
    tenant_id: str,
    lead_id: str,
    chatwit_api_key: str | None = None,
) -> dict:
    """
    Send follow-up reminder for a lead.
    
    Args:
        tenant_id: Tenant UUID as string
        lead_id: Lead UUID as string
        chatwit_api_key: Optional Chatwit API key for messaging
        
    Returns:
        Dict with result
    """
    logger.info(
        "Sending follow-up reminder",
        extra={
            "tenant_id": tenant_id,
            "lead_id": lead_id,
        },
    )
    
    async with session_ctx() as session:
        from domains.jusmonitoria.db.repositories.lead import LeadRepository
        
        repo = LeadRepository(session, UUID(tenant_id))
        lead = await repo.get(UUID(lead_id))
        
        if not lead:
            logger.warning(
                "Lead not found for follow-up",
                extra={"lead_id": lead_id},
            )
            return {"success": False, "error": "Lead not found"}
        
        # Send reminder via Chatwit if available
        if chatwit_api_key and lead.chatwit_contact_id:
            chatwit_service = ChatwitService(
                api_key=chatwit_api_key,
            )
            
            message = (
                f"Olá {lead.full_name}! 👋\n\n"
                "Estamos acompanhando seu caso e gostaríamos de saber "
                "se você tem alguma dúvida ou precisa de mais informações.\n\n"
                "Nossa equipe está à disposição para ajudar!"
            )
            
            try:
                await chatwit_service.send_message(
                    contact_id=lead.chatwit_contact_id,
                    message=message,
                )
                
                logger.info(
                    "Follow-up reminder sent",
                    extra={
                        "tenant_id": tenant_id,
                        "lead_id": lead_id,
                    },
                )
                
                return {
                    "success": True,
                    "lead_id": lead_id,
                    "message_sent": True,
                }
            
            except Exception as e:
                logger.error(
                    "Failed to send follow-up reminder",
                    extra={
                        "tenant_id": tenant_id,
                        "lead_id": lead_id,
                        "error": str(e),
                    },
                    exc_info=True,
                )
                raise
        
        return {
            "success": True,
            "lead_id": lead_id,
            "message_sent": False,
            "reason": "No Chatwit integration",
        }
