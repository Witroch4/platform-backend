"""Funnel automation service for lead management."""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.services.chatwit_client import ChatwitService
from domains.jusmonitoria.services.crm.lead_scorer import LeadScorer
from domains.jusmonitoria.services.crm.lead_state_machine import LeadStateMachine
from domains.jusmonitoria.db.models.lead import Lead, LeadStage
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.tasks.events.bus import publish_event
from domains.jusmonitoria.tasks.events.types import EventType

logger = logging.getLogger(__name__)


class FunnelAutomations:
    """
    Automated actions for lead funnel management.
    
    Automations:
    1. Auto-qualify leads with score > 70
    2. Send welcome message via Chatwit
    3. Schedule automatic follow-ups
    4. Notify assigned users of high-value leads
    """
    
    # Configuration
    AUTO_QUALIFY_THRESHOLD = 70
    FOLLOW_UP_DELAY_HOURS = 24
    HIGH_VALUE_THRESHOLD = 80
    
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        chatwit_service: Optional[ChatwitService] = None,
    ):
        """
        Initialize funnel automations.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
            chatwit_service: Optional Chatwit service for messaging
        """
        self.session = session
        self.tenant_id = tenant_id
        self.repo = LeadRepository(session, tenant_id)
        self.state_machine = LeadStateMachine(session, tenant_id)
        self.scorer = LeadScorer(session, tenant_id)
        self.chatwit = chatwit_service
    
    async def process_new_lead(
        self,
        lead_id: UUID,
        ai_summary: Optional[str] = None,
    ) -> dict:
        """
        Process a newly created lead with all automations.
        
        Args:
            lead_id: Lead UUID
            ai_summary: Optional AI-generated summary from triage
            
        Returns:
            Dict with automation results
        """
        lead = await self.repo.get(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        results = {
            "lead_id": str(lead_id),
            "automations": [],
        }
        
        # 1. Calculate initial score
        try:
            await self.scorer.update_lead_score(lead_id, ai_summary)
            await self.session.refresh(lead)
            results["automations"].append({
                "action": "score_calculated",
                "score": lead.score,
                "success": True,
            })
        except Exception as e:
            logger.error(
                "Failed to calculate lead score",
                extra={"lead_id": str(lead_id), "error": str(e)},
                exc_info=True,
            )
            results["automations"].append({
                "action": "score_calculated",
                "success": False,
                "error": str(e),
            })
        
        # 2. Auto-qualify if score is high
        if lead.score >= self.AUTO_QUALIFY_THRESHOLD:
            try:
                await self._auto_qualify_lead(lead)
                results["automations"].append({
                    "action": "auto_qualified",
                    "success": True,
                })
            except Exception as e:
                logger.error(
                    "Failed to auto-qualify lead",
                    extra={"lead_id": str(lead_id), "error": str(e)},
                    exc_info=True,
                )
                results["automations"].append({
                    "action": "auto_qualified",
                    "success": False,
                    "error": str(e),
                })
        
        # 3. Send welcome message
        if self.chatwit and lead.chatwit_contact_id:
            try:
                await self._send_welcome_message(lead)
                results["automations"].append({
                    "action": "welcome_message_sent",
                    "success": True,
                })
            except Exception as e:
                logger.error(
                    "Failed to send welcome message",
                    extra={"lead_id": str(lead_id), "error": str(e)},
                    exc_info=True,
                )
                results["automations"].append({
                    "action": "welcome_message_sent",
                    "success": False,
                    "error": str(e),
                })
        
        # 4. Schedule follow-up
        try:
            await self._schedule_follow_up(lead)
            results["automations"].append({
                "action": "follow_up_scheduled",
                "success": True,
            })
        except Exception as e:
            logger.error(
                "Failed to schedule follow-up",
                extra={"lead_id": str(lead_id), "error": str(e)},
                exc_info=True,
            )
            results["automations"].append({
                "action": "follow_up_scheduled",
                "success": False,
                "error": str(e),
            })
        
        # 5. Notify if high-value lead
        if lead.score >= self.HIGH_VALUE_THRESHOLD:
            try:
                await self._notify_high_value_lead(lead)
                results["automations"].append({
                    "action": "high_value_notification",
                    "success": True,
                })
            except Exception as e:
                logger.error(
                    "Failed to notify high-value lead",
                    extra={"lead_id": str(lead_id), "error": str(e)},
                    exc_info=True,
                )
                results["automations"].append({
                    "action": "high_value_notification",
                    "success": False,
                    "error": str(e),
                })
        
        logger.info(
            "Processed new lead automations",
            extra={
                "lead_id": str(lead_id),
                "tenant_id": str(self.tenant_id),
                "score": lead.score,
                "automations_count": len(results["automations"]),
            },
        )
        
        return results
    
    async def _auto_qualify_lead(self, lead: Lead) -> None:
        """
        Automatically qualify a lead based on score.
        
        Args:
            lead: Lead instance
        """
        if lead.stage == LeadStage.NEW:
            await self.state_machine.transition(
                lead_id=lead.id,
                to_stage=LeadStage.QUALIFIED,
                reason=f"Auto-qualified with score {lead.score}",
            )
            
            logger.info(
                "Auto-qualified lead",
                extra={
                    "lead_id": str(lead.id),
                    "tenant_id": str(self.tenant_id),
                    "score": lead.score,
                },
            )
    
    async def _send_welcome_message(self, lead: Lead) -> None:
        """
        Send welcome message via Chatwit.
        
        Args:
            lead: Lead instance
        """
        if not self.chatwit or not lead.chatwit_contact_id:
            return
        
        # Customize message based on score
        if lead.score >= self.HIGH_VALUE_THRESHOLD:
            message = (
                f"Olá {lead.full_name}! 👋\n\n"
                "Recebemos sua mensagem e nossa equipe já está analisando seu caso. "
                "Identificamos que sua situação requer atenção prioritária.\n\n"
                "Um de nossos advogados entrará em contato em breve para "
                "discutir os próximos passos.\n\n"
                "Estamos à disposição!"
            )
        else:
            message = (
                f"Olá {lead.full_name}! 👋\n\n"
                "Obrigado por entrar em contato conosco. "
                "Recebemos sua mensagem e em breve retornaremos.\n\n"
                "Enquanto isso, se tiver mais informações sobre seu caso, "
                "fique à vontade para compartilhar.\n\n"
                "Estamos à disposição!"
            )
        
        await self.chatwit.send_message(
            contact_id=lead.chatwit_contact_id,
            message=message,
        )
        
        # Create timeline event
        event = TimelineEvent(
            tenant_id=self.tenant_id,
            entity_type="lead",
            entity_id=lead.id,
            event_type="message_sent",
            title="Mensagem de boas-vindas enviada",
            description=message,
            source="automation",
            metadata={"automation": "welcome_message"},
        )
        self.session.add(event)
        
        logger.info(
            "Sent welcome message",
            extra={
                "lead_id": str(lead.id),
                "tenant_id": str(self.tenant_id),
                "contact_id": lead.chatwit_contact_id,
            },
        )
    
    async def _schedule_follow_up(self, lead: Lead) -> None:
        """
        Schedule automatic follow-up for lead.
        
        Args:
            lead: Lead instance
        """
        follow_up_time = datetime.utcnow() + timedelta(hours=self.FOLLOW_UP_DELAY_HOURS)
        
        # Store follow-up info in metadata
        if "follow_ups" not in lead.metadata:
            lead.metadata["follow_ups"] = []
        
        lead.metadata["follow_ups"].append({
            "scheduled_at": follow_up_time.isoformat(),
            "status": "pending",
            "type": "initial_contact",
        })
        
        # Mark the metadata as modified for SQLAlchemy to detect the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(lead, "metadata")
        
        # Publish event for follow-up scheduler
        await publish_event(
            event_type=EventType.LEAD_CREATED,
            tenant_id=self.tenant_id,
            payload={
                "lead_id": str(lead.id),
                "follow_up_at": follow_up_time.isoformat(),
                "action": "schedule_follow_up",
            },
        )
        
        logger.info(
            "Scheduled follow-up",
            extra={
                "lead_id": str(lead.id),
                "tenant_id": str(self.tenant_id),
                "follow_up_time": follow_up_time.isoformat(),
            },
        )
    
    async def _notify_high_value_lead(self, lead: Lead) -> None:
        """
        Notify team about high-value lead.
        
        Args:
            lead: Lead instance
        """
        # Publish notification event
        await publish_event(
            event_type=EventType.LEAD_QUALIFIED,
            tenant_id=self.tenant_id,
            payload={
                "lead_id": str(lead.id),
                "lead_name": lead.full_name,
                "score": lead.score,
                "priority": "high",
                "assigned_to": str(lead.assigned_to) if lead.assigned_to else None,
                "notification_type": "high_value_lead",
            },
        )
        
        logger.info(
            "Notified high-value lead",
            extra={
                "lead_id": str(lead.id),
                "tenant_id": str(self.tenant_id),
                "score": lead.score,
            },
        )
    
    async def process_score_update(
        self,
        lead_id: UUID,
        old_score: int,
        new_score: int,
    ) -> None:
        """
        Process automations triggered by score update.
        
        Args:
            lead_id: Lead UUID
            old_score: Previous score
            new_score: New score
        """
        lead = await self.repo.get(lead_id)
        if not lead:
            return
        
        # Check if lead crossed auto-qualify threshold
        if (
            old_score < self.AUTO_QUALIFY_THRESHOLD
            and new_score >= self.AUTO_QUALIFY_THRESHOLD
            and lead.stage == LeadStage.NEW
        ):
            try:
                await self._auto_qualify_lead(lead)
                logger.info(
                    "Auto-qualified lead after score update",
                    extra={
                        "lead_id": str(lead_id),
                        "old_score": old_score,
                        "new_score": new_score,
                    },
                )
            except Exception as e:
                logger.error(
                    "Failed to auto-qualify after score update",
                    extra={"lead_id": str(lead_id), "error": str(e)},
                    exc_info=True,
                )
        
        # Check if lead became high-value
        if (
            old_score < self.HIGH_VALUE_THRESHOLD
            and new_score >= self.HIGH_VALUE_THRESHOLD
        ):
            try:
                await self._notify_high_value_lead(lead)
            except Exception as e:
                logger.error(
                    "Failed to notify high-value lead after score update",
                    extra={"lead_id": str(lead_id), "error": str(e)},
                    exc_info=True,
                )
