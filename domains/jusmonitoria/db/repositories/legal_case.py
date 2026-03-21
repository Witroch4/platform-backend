"""Legal case repository for process monitoring."""

import logging
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class LegalCaseRepository(BaseRepository[LegalCase]):
    """Repository for LegalCase operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(LegalCase, session, tenant_id)
    
    async def get_by_cnj_number(
        self,
        cnj_number: str,
    ) -> LegalCase | None:
        """
        Get legal case by CNJ number within tenant.
        
        Args:
            cnj_number: CNJ process number
            
        Returns:
            LegalCase instance or None if not found
        """
        query = select(LegalCase).where(LegalCase.cnj_number == cnj_number)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_client(
        self,
        client_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LegalCase]:
        """
        Get legal cases for a specific client within tenant.
        
        Args:
            client_id: Client UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of legal case instances
        """
        query = select(LegalCase).where(LegalCase.client_id == client_id)
        query = self._apply_tenant_filter(query)
        query = query.order_by(LegalCase.last_movement_date.desc().nullslast())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_monitored_cases(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LegalCase]:
        """
        Get all cases with monitoring enabled within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of monitored legal case instances
        """
        query = select(LegalCase).where(LegalCase.monitoring_enabled == True)
        query = self._apply_tenant_filter(query)
        query = query.order_by(LegalCase.last_sync_at.nullsfirst())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_cases_needing_sync(
        self,
        hours_since_sync: int = 6,
        *,
        limit: int = 100,
    ) -> list[LegalCase]:
        """
        Get cases that need synchronization with DataJud within tenant.
        
        Args:
            hours_since_sync: Hours since last sync
            limit: Maximum number of records to return
            
        Returns:
            List of legal case instances needing sync
        """
        from datetime import timedelta
        
        cutoff_time = datetime.now() - timedelta(hours=hours_since_sync)
        
        query = select(LegalCase).where(
            LegalCase.monitoring_enabled == True,
        ).where(
            (LegalCase.last_sync_at == None) | (LegalCase.last_sync_at < cutoff_time)
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(LegalCase.last_sync_at.nullsfirst())
        query = query.limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_cases_with_upcoming_deadlines(
        self,
        days_ahead: int = 7,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LegalCase]:
        """
        Get cases with deadlines in the next N days within tenant.
        
        Args:
            days_ahead: Number of days to look ahead
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of legal case instances with upcoming deadlines
        """
        from datetime import timedelta
        
        today = date.today()
        future_date = today + timedelta(days=days_ahead)
        
        query = select(LegalCase).where(
            LegalCase.next_deadline != None,
            LegalCase.next_deadline >= today,
            LegalCase.next_deadline <= future_date,
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(LegalCase.next_deadline)
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_cases_with_missed_deadlines(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LegalCase]:
        """
        Get cases with missed deadlines within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of legal case instances with missed deadlines
        """
        today = date.today()
        
        query = select(LegalCase).where(
            LegalCase.next_deadline != None,
            LegalCase.next_deadline < today,
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(LegalCase.next_deadline)
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_last_sync(
        self,
        id: UUID,
    ) -> LegalCase | None:
        """
        Update last sync timestamp for a case within tenant.
        
        Args:
            id: LegalCase UUID
            
        Returns:
            Updated legal case instance or None if not found
        """
        case = await self.get(id)
        if not case:
            return None
        
        case.last_sync_at = datetime.now()
        await self.session.flush()
        await self.session.refresh(case)
        
        logger.debug(
            "Updated case last sync",
            extra={
                "case_id": str(id),
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return case
    
    async def update_last_movement_date(
        self,
        id: UUID,
        movement_date: date,
    ) -> LegalCase | None:
        """
        Update last movement date for a case within tenant.
        
        Args:
            id: LegalCase UUID
            movement_date: Date of last movement
            
        Returns:
            Updated legal case instance or None if not found
        """
        case = await self.get(id)
        if not case:
            return None
        
        # Only update if new date is more recent
        if case.last_movement_date is None or movement_date > case.last_movement_date:
            case.last_movement_date = movement_date
            await self.session.flush()
            await self.session.refresh(case)
            
            logger.debug(
                "Updated case last movement date",
                extra={
                    "case_id": str(id),
                    "tenant_id": str(self.tenant_id),
                    "movement_date": str(movement_date),
                },
            )
        
        return case
    
    async def get_cases_to_sync(
        self,
        *,
        limit: int = 1000,
    ) -> list[LegalCase]:
        """
        Get all cases that need synchronization with DataJud within tenant.
        
        This method returns cases that:
        - Have monitoring enabled
        - Haven't been synced yet OR
        - Last sync was more than sync_frequency_hours ago
        
        Args:
            limit: Maximum number of records to return
            
        Returns:
            List of legal case instances needing sync
        """
        from datetime import timedelta
        
        now = datetime.now()
        
        # Get all monitored cases
        query = select(LegalCase).where(
            LegalCase.monitoring_enabled == True,
        )
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        all_cases = list(result.scalars().all())
        
        # Filter cases that need sync
        cases_to_sync = []
        for case in all_cases:
            if case.last_sync_at is None:
                # Never synced
                cases_to_sync.append(case)
            else:
                # Check if enough time has passed
                time_since_sync = now - case.last_sync_at
                sync_interval = timedelta(hours=case.sync_frequency_hours)
                
                if time_since_sync >= sync_interval:
                    cases_to_sync.append(case)
        
        # Sort by last sync (oldest first)
        cases_to_sync.sort(
            key=lambda c: c.last_sync_at if c.last_sync_at else datetime.min
        )
        
        return cases_to_sync[:limit]
