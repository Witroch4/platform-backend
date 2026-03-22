"""Lead scoring service using AI analysis."""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.lead import Lead
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent
from domains.jusmonitoria.db.repositories.lead import LeadRepository

logger = logging.getLogger(__name__)


class LeadScorer:
    """
    AI-powered lead scoring service.
    
    Analyzes multiple factors to calculate a lead quality score (0-100):
    - Urgency indicators in messages
    - Type of legal case
    - Interaction history and engagement
    - Response time
    - Information completeness
    
    Higher scores indicate higher quality leads that are more likely to convert.
    """
    
    # Score weights for different factors
    URGENCY_WEIGHT = 0.30
    CASE_TYPE_WEIGHT = 0.25
    ENGAGEMENT_WEIGHT = 0.25
    COMPLETENESS_WEIGHT = 0.20
    
    # Urgency keywords and their scores
    URGENCY_KEYWORDS = {
        "urgente": 100,
        "emergência": 100,
        "imediato": 90,
        "rápido": 80,
        "prazo": 70,
        "hoje": 70,
        "amanhã": 60,
        "essa semana": 50,
    }
    
    # Case type scores (higher value = more valuable)
    CASE_TYPE_SCORES = {
        "trabalhista": 80,
        "empresarial": 90,
        "tributário": 85,
        "cível": 70,
        "família": 65,
        "criminal": 75,
        "previdenciário": 60,
        "consumidor": 55,
    }
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize lead scorer.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
        """
        self.session = session
        self.tenant_id = tenant_id
        self.repo = LeadRepository(session, tenant_id)
    
    async def calculate_score(
        self,
        lead_id: UUID,
        ai_summary: Optional[str] = None,
    ) -> int:
        """
        Calculate comprehensive lead score.
        
        Args:
            lead_id: Lead UUID
            ai_summary: Optional AI-generated summary from triage agent
            
        Returns:
            Score between 0 and 100
            
        Raises:
            ValueError: If lead not found
        """
        lead = await self.repo.get(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        # Calculate individual scores
        urgency_score = await self._calculate_urgency_score(lead, ai_summary)
        case_type_score = await self._calculate_case_type_score(lead, ai_summary)
        engagement_score = await self._calculate_engagement_score(lead)
        completeness_score = self._calculate_completeness_score(lead)
        
        # Calculate weighted total
        total_score = (
            urgency_score * self.URGENCY_WEIGHT
            + case_type_score * self.CASE_TYPE_WEIGHT
            + engagement_score * self.ENGAGEMENT_WEIGHT
            + completeness_score * self.COMPLETENESS_WEIGHT
        )
        
        # Round and clamp to 0-100
        final_score = max(0, min(100, int(round(total_score))))
        
        logger.info(
            "Calculated lead score",
            extra={
                "lead_id": str(lead_id),
                "tenant_id": str(self.tenant_id),
                "final_score": final_score,
                "urgency_score": urgency_score,
                "case_type_score": case_type_score,
                "engagement_score": engagement_score,
                "completeness_score": completeness_score,
            },
        )
        
        return final_score
    
    async def _calculate_urgency_score(
        self,
        lead: Lead,
        ai_summary: Optional[str],
    ) -> float:
        """
        Calculate urgency score based on keywords and AI analysis.
        
        Args:
            lead: Lead instance
            ai_summary: AI-generated summary
            
        Returns:
            Urgency score (0-100)
        """
        score = 0.0
        
        # Check AI summary for urgency indicators
        if ai_summary:
            text = ai_summary.lower()
            for keyword, keyword_score in self.URGENCY_KEYWORDS.items():
                if keyword in text:
                    score = max(score, keyword_score)
        
        # Check metadata for urgency
        if lead.metadata.get("urgency") == "high":
            score = max(score, 90)
        elif lead.metadata.get("urgency") == "medium":
            score = max(score, 60)
        
        # Check AI recommended action
        if lead.ai_recommended_action:
            action = lead.ai_recommended_action.lower()
            if "urgente" in action or "imediato" in action:
                score = max(score, 85)
        
        return score
    
    async def _calculate_case_type_score(
        self,
        lead: Lead,
        ai_summary: Optional[str],
    ) -> float:
        """
        Calculate score based on case type value.
        
        Args:
            lead: Lead instance
            ai_summary: AI-generated summary
            
        Returns:
            Case type score (0-100)
        """
        score = 50.0  # Default score
        
        # Check metadata for case type
        case_type = lead.metadata.get("case_type", "").lower()
        if case_type:
            for type_name, type_score in self.CASE_TYPE_SCORES.items():
                if type_name in case_type:
                    return float(type_score)
        
        # Check AI summary for case type indicators
        if ai_summary:
            text = ai_summary.lower()
            for type_name, type_score in self.CASE_TYPE_SCORES.items():
                if type_name in text:
                    score = max(score, type_score)
        
        return score
    
    async def _calculate_engagement_score(self, lead: Lead) -> float:
        """
        Calculate engagement score based on interaction history.
        
        Args:
            lead: Lead instance
            
        Returns:
            Engagement score (0-100)
        """
        # Get timeline events for this lead
        query = select(TimelineEvent).where(
            TimelineEvent.tenant_id == self.tenant_id,
            TimelineEvent.entity_type == "lead",
            TimelineEvent.entity_id == lead.id,
        )
        result = await self.session.execute(query)
        events = result.scalars().all()
        
        if not events:
            return 30.0  # Low score for no interactions
        
        # Count interactions in last 7 days
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        recent_events = [e for e in events if e.created_at >= recent_cutoff]
        
        # Calculate score based on interaction count
        total_interactions = len(events)
        recent_interactions = len(recent_events)
        
        # Base score on total interactions
        if total_interactions >= 10:
            base_score = 90
        elif total_interactions >= 5:
            base_score = 70
        elif total_interactions >= 3:
            base_score = 50
        else:
            base_score = 30
        
        # Boost for recent activity
        if recent_interactions >= 3:
            base_score = min(100, base_score + 10)
        elif recent_interactions >= 1:
            base_score = min(100, base_score + 5)
        
        # Check response time (if available in metadata)
        avg_response_time = lead.metadata.get("avg_response_time_hours")
        if avg_response_time is not None:
            if avg_response_time < 1:  # Less than 1 hour
                base_score = min(100, base_score + 10)
            elif avg_response_time < 24:  # Less than 1 day
                base_score = min(100, base_score + 5)
        
        return float(base_score)
    
    def _calculate_completeness_score(self, lead: Lead) -> float:
        """
        Calculate score based on information completeness.
        
        Args:
            lead: Lead instance
            
        Returns:
            Completeness score (0-100)
        """
        score = 0.0
        max_score = 100.0
        
        # Check required fields
        fields = {
            "full_name": 20,
            "phone": 25,
            "email": 25,
            "ai_summary": 15,
            "metadata.case_type": 15,
        }
        
        for field, points in fields.items():
            if "." in field:
                # Nested field in metadata
                parts = field.split(".")
                value = lead.metadata.get(parts[1])
            else:
                value = getattr(lead, field, None)
            
            if value:
                score += points
        
        return score
    
    async def update_lead_score(
        self,
        lead_id: UUID,
        ai_summary: Optional[str] = None,
    ) -> Lead:
        """
        Calculate and update lead score.
        
        Args:
            lead_id: Lead UUID
            ai_summary: Optional AI-generated summary
            
        Returns:
            Updated lead instance
            
        Raises:
            ValueError: If lead not found
        """
        # Calculate new score
        new_score = await self.calculate_score(lead_id, ai_summary)
        
        # Update lead
        lead = await self.repo.update_score(lead_id, new_score)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        # Update AI summary if provided
        if ai_summary:
            lead.ai_summary = ai_summary
            await self.session.flush()
        
        logger.info(
            "Updated lead score",
            extra={
                "lead_id": str(lead_id),
                "tenant_id": str(self.tenant_id),
                "new_score": new_score,
            },
        )
        
        return lead
    
    async def score_all_leads(self) -> int:
        """
        Recalculate scores for all active leads in tenant.
        
        Returns:
            Number of leads scored
        """
        leads = await self.repo.get_active_leads(limit=1000)
        
        count = 0
        for lead in leads:
            try:
                await self.update_lead_score(lead.id, lead.ai_summary)
                count += 1
            except Exception as e:
                logger.error(
                    "Failed to score lead",
                    extra={
                        "lead_id": str(lead.id),
                        "error": str(e),
                    },
                    exc_info=True,
                )
        
        logger.info(
            "Scored all leads",
            extra={
                "tenant_id": str(self.tenant_id),
                "count": count,
            },
        )
        
        return count
