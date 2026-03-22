"""Lead state machine for managing funnel transitions."""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.lead import Lead, LeadStage, LeadStatus
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.tasks.events.bus import publish
from domains.jusmonitoria.tasks.events.types import EventType

logger = logging.getLogger(__name__)


class InvalidTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""
    
    def __init__(self, from_stage: LeadStage, to_stage: LeadStage):
        self.from_stage = from_stage
        self.to_stage = to_stage
        super().__init__(
            f"Invalid transition from {from_stage.value} to {to_stage.value}"
        )


class LeadStateMachine:
    """
    State machine for managing lead transitions through the sales funnel.
    
    Valid transitions:
    - novo -> contatado
    - novo -> qualificado (auto-qualification)
    - contatado -> qualificado
    - contatado -> novo (back to new)
    - qualificado -> proposta
    - qualificado -> contatado (back to contacted)
    - proposta -> negociacao
    - proposta -> qualificado (back to qualified)
    - negociacao -> convertido
    - negociacao -> proposta (back to proposal)
    - Any stage -> novo (restart)
    
    The state machine:
    1. Validates transitions
    2. Updates lead stage
    3. Records history in metadata
    4. Publishes state change events
    """
    
    # Define valid transitions as a mapping
    VALID_TRANSITIONS = {
        LeadStage.NEW: {
            LeadStage.CONTACTED,
            LeadStage.QUALIFIED,  # Allow auto-qualification
        },
        LeadStage.CONTACTED: {
            LeadStage.NEW,  # Allow going back
            LeadStage.QUALIFIED,
        },
        LeadStage.QUALIFIED: {
            LeadStage.CONTACTED,  # Allow going back
            LeadStage.PROPOSAL,
        },
        LeadStage.PROPOSAL: {
            LeadStage.QUALIFIED,  # Allow going back
            LeadStage.NEGOTIATION,
        },
        LeadStage.NEGOTIATION: {
            LeadStage.PROPOSAL,  # Allow going back
            LeadStage.CONVERTED,
        },
        LeadStage.CONVERTED: set(),  # No transitions from converted
    }
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize state machine.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
        """
        self.session = session
        self.tenant_id = tenant_id
        self.repo = LeadRepository(session, tenant_id)
    
    def is_valid_transition(
        self,
        from_stage: LeadStage,
        to_stage: LeadStage,
    ) -> bool:
        """
        Check if a transition is valid.
        
        Args:
            from_stage: Current stage
            to_stage: Target stage
            
        Returns:
            True if transition is valid, False otherwise
        """
        # Allow restart to NEW from any stage except CONVERTED
        if to_stage == LeadStage.NEW and from_stage != LeadStage.CONVERTED:
            return True
        
        # Check if transition is in valid transitions map
        valid_targets = self.VALID_TRANSITIONS.get(from_stage, set())
        return to_stage in valid_targets
    
    async def transition(
        self,
        lead_id: UUID,
        to_stage: LeadStage,
        user_id: Optional[UUID] = None,
        reason: Optional[str] = None,
    ) -> Lead:
        """
        Transition lead to a new stage.
        
        Args:
            lead_id: Lead UUID
            to_stage: Target stage
            user_id: User performing the transition
            reason: Optional reason for transition
            
        Returns:
            Updated lead
            
        Raises:
            ValueError: If lead not found
            InvalidTransitionError: If transition is invalid
        """
        # Get lead
        lead = await self.repo.get(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        from_stage = lead.stage
        
        # Check if already in target stage
        if from_stage == to_stage:
            logger.debug(
                "Lead already in target stage",
                extra={
                    "lead_id": str(lead_id),
                    "stage": to_stage.value,
                },
            )
            return lead
        
        # Validate transition
        if not self.is_valid_transition(from_stage, to_stage):
            raise InvalidTransitionError(from_stage, to_stage)
        
        # Record transition in history
        history_entry = {
            "from_stage": from_stage.value,
            "to_stage": to_stage.value,
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": str(user_id) if user_id else None,
            "reason": reason,
        }
        
        # Update metadata with history
        if "stage_history" not in lead.metadata:
            lead.metadata["stage_history"] = []
        lead.metadata["stage_history"].append(history_entry)
        
        # Update stage
        lead.stage = to_stage
        
        # Handle conversion
        if to_stage == LeadStage.CONVERTED:
            lead.status = LeadStatus.CONVERTED
            lead.converted_at = datetime.utcnow()
        
        # Commit changes
        await self.session.flush()
        await self.session.refresh(lead)
        
        logger.info(
            "Lead stage transition",
            extra={
                "lead_id": str(lead_id),
                "tenant_id": str(self.tenant_id),
                "from_stage": from_stage.value,
                "to_stage": to_stage.value,
                "user_id": str(user_id) if user_id else None,
            },
        )
        
        # Publish event
        await self._publish_stage_change_event(lead, from_stage, to_stage, user_id)
        
        return lead
    
    async def _publish_stage_change_event(
        self,
        lead: Lead,
        from_stage: LeadStage,
        to_stage: LeadStage,
        user_id: Optional[UUID],
    ) -> None:
        """
        Publish stage change event to event bus.
        
        Args:
            lead: Lead instance
            from_stage: Previous stage
            to_stage: New stage
            user_id: User who performed the transition
        """
        try:
            await publish(
                event_type=EventType.LEAD_STAGE_CHANGED,
                tenant_id=self.tenant_id,
                payload={
                    "lead_id": str(lead.id),
                    "from_stage": from_stage.value,
                    "to_stage": to_stage.value,
                    "lead_name": lead.full_name,
                    "lead_score": lead.score,
                    "user_id": str(user_id) if user_id else None,
                },
            )
            
            logger.debug(
                "Published lead stage change event",
                extra={
                    "lead_id": str(lead.id),
                    "event_type": EventType.LEAD_STAGE_CHANGED,
                },
            )
        except Exception as e:
            # Don't fail the transition if event publishing fails
            logger.error(
                "Failed to publish lead stage change event",
                extra={
                    "lead_id": str(lead.id),
                    "error": str(e),
                },
                exc_info=True,
            )
    
    async def get_stage_history(self, lead_id: UUID) -> list[dict]:
        """
        Get stage transition history for a lead.
        
        Args:
            lead_id: Lead UUID
            
        Returns:
            List of stage transitions
            
        Raises:
            ValueError: If lead not found
        """
        lead = await self.repo.get(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        return lead.metadata.get("stage_history", [])
    
    def get_valid_next_stages(self, current_stage: LeadStage) -> set[LeadStage]:
        """
        Get valid next stages from current stage.
        
        Args:
            current_stage: Current lead stage
            
        Returns:
            Set of valid next stages
        """
        valid_stages = self.VALID_TRANSITIONS.get(current_stage, set()).copy()
        
        # Add NEW as valid target from any stage except CONVERTED
        if current_stage != LeadStage.CONVERTED:
            valid_stages.add(LeadStage.NEW)
        
        return valid_stages
