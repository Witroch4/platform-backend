"""Lead repository for CRM funnel management."""

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.lead import Lead, LeadStage, LeadStatus
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class LeadRepository(BaseRepository[Lead]):
    """Repository for Lead operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(Lead, session, tenant_id)
    
    async def get_active_leads(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Lead]:
        """
        Get all active leads within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of active lead instances
        """
        query = select(Lead).where(Lead.status == LeadStatus.ACTIVE)
        query = self._apply_tenant_filter(query)
        query = query.order_by(Lead.score.desc(), Lead.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_stage(
        self,
        stage: LeadStage,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Lead]:
        """
        Get leads by stage within tenant.
        
        Args:
            stage: Lead stage in funnel
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of lead instances
        """
        query = select(Lead).where(
            Lead.stage == stage,
            Lead.status == LeadStatus.ACTIVE,
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(Lead.score.desc(), Lead.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_chatwit_contact(
        self,
        chatwit_contact_id: str,
    ) -> Lead | None:
        """
        Get lead by Chatwit contact ID within tenant.
        
        Args:
            chatwit_contact_id: Chatwit contact identifier
            
        Returns:
            Lead instance or None if not found
        """
        query = select(Lead).where(Lead.chatwit_contact_id == chatwit_contact_id)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_high_score_leads(
        self,
        min_score: int = 70,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Lead]:
        """
        Get leads with score above threshold within tenant.
        
        Args:
            min_score: Minimum score threshold
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of high-score lead instances
        """
        query = select(Lead).where(
            Lead.score >= min_score,
            Lead.status == LeadStatus.ACTIVE,
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(Lead.score.desc(), Lead.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_stage(
        self,
        id: UUID,
        new_stage: LeadStage,
    ) -> Lead | None:
        """
        Update lead stage within tenant.
        
        Args:
            id: Lead UUID
            new_stage: New stage in funnel
            
        Returns:
            Updated lead instance or None if not found
        """
        lead = await self.get(id)
        if not lead:
            return None
        
        old_stage = lead.stage
        lead.stage = new_stage
        
        # If converting to converted stage, update status and timestamp
        if new_stage == LeadStage.CONVERTED:
            lead.status = LeadStatus.CONVERTED
            lead.converted_at = datetime.now()
        
        await self.session.flush()
        await self.session.refresh(lead)
        
        logger.info(
            "Updated lead stage",
            extra={
                "lead_id": str(id),
                "tenant_id": str(self.tenant_id),
                "old_stage": old_stage,
                "new_stage": new_stage,
            },
        )
        
        return lead
    
    async def update_score(
        self,
        id: UUID,
        score: int,
    ) -> Lead | None:
        """
        Update lead score within tenant.
        
        Args:
            id: Lead UUID
            score: New score (0-100)
            
        Returns:
            Updated lead instance or None if not found
        """
        lead = await self.get(id)
        if not lead:
            return None
        
        lead.score = max(0, min(100, score))  # Clamp to 0-100
        await self.session.flush()
        await self.session.refresh(lead)
        
        logger.debug(
            "Updated lead score",
            extra={
                "lead_id": str(id),
                "tenant_id": str(self.tenant_id),
                "score": lead.score,
            },
        )
        
        return lead
    
    async def mark_as_converted(
        self,
        id: UUID,
        client_id: UUID,
    ) -> Lead | None:
        """
        Mark lead as converted to client within tenant.
        
        Args:
            id: Lead UUID
            client_id: Created client UUID
            
        Returns:
            Updated lead instance or None if not found
        """
        lead = await self.get(id)
        if not lead:
            return None
        
        lead.status = LeadStatus.CONVERTED
        lead.stage = LeadStage.CONVERTED
        lead.converted_at = datetime.now()
        lead.converted_to_client_id = client_id
        
        await self.session.flush()
        await self.session.refresh(lead)
        
        logger.info(
            "Marked lead as converted",
            extra={
                "lead_id": str(id),
                "client_id": str(client_id),
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return lead
