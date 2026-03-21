"""Optimized legal case repository with eager loading and caching."""

import logging
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.repositories.optimized_base import OptimizedBaseRepository
from domains.jusmonitoria.services.cache_service import cache_service

logger = logging.getLogger(__name__)


class OptimizedLegalCaseRepository(OptimizedBaseRepository[LegalCase]):
    """
    Optimized repository for LegalCase operations.
    
    Features:
    - Eager loading of tenant, client relationships
    - Redis caching for frequently accessed queries
    - Optimized queries using composite indexes
    - Performance logging
    """
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository with eager loading configuration.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(
            LegalCase,
            session,
            tenant_id,
            eager_load=['tenant', 'client'],
            use_joined_load=False,
        )
    
    async def get_by_cnj_number(
        self,
        cnj_number: str,
        *,
        use_cache: bool = True,
    ) -> LegalCase | None:
        """
        Get legal case by CNJ number within tenant with caching.
        
        Uses optimized composite index: idx_legal_cases_tenant_cnj
        
        Args:
            cnj_number: CNJ process number
            use_cache: If True, use Redis cache
            
        Returns:
            LegalCase instance or None if not found
        """
        # Try cache first
        if use_cache:
            cache_key = f"case:cnj:{cnj_number}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return LegalCase(**cached)
        
        # Query database
        query = select(LegalCase).where(LegalCase.cnj_number == cnj_number)
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        
        result = await self.session.execute(query)
        case = result.scalar_one_or_none()
        
        # Cache result
        if use_cache and case:
            cache_key = f"case:cnj:{cnj_number}"
            await cache_service.set(
                cache_key,
                case.to_dict(),
                ttl=600,  # 10 minutes
                tenant_id=self.tenant_id,
            )
        
        return case
    
    async def get_by_client(
        self,
        client_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = True,
    ) -> list[LegalCase]:
        """
        Get legal cases for a specific client within tenant.
        
        Uses optimized composite index: idx_legal_cases_tenant_client_movement
        
        Args:
            client_id: Client UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of legal case instances
        """
        # Try cache first
        if use_cache:
            cache_key = f"cases:client:{client_id}:skip:{skip}:limit:{limit}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return [LegalCase(**item) for item in cached]
        
        # Query database
        query = select(LegalCase).where(LegalCase.client_id == client_id)
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(LegalCase.last_movement_date.desc().nullslast())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        cases = list(result.scalars().all())
        
        # Cache results
        if use_cache and cases:
            cache_key = f"cases:client:{client_id}:skip:{skip}:limit:{limit}"
            cache_data = [case.to_dict() for case in cases]
            await cache_service.set(
                cache_key,
                cache_data,
                ttl=300,  # 5 minutes
                tenant_id=self.tenant_id,
            )
        
        return cases
    
    async def get_monitored_cases(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = True,
    ) -> list[LegalCase]:
        """
        Get all cases with monitoring enabled within tenant.
        
        Uses optimized composite index: idx_legal_cases_tenant_monitoring_sync
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of monitored legal case instances
        """
        # Try cache first
        if use_cache:
            cache_key = f"cases:monitored:skip:{skip}:limit:{limit}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return [LegalCase(**item) for item in cached]
        
        # Query database
        query = select(LegalCase).where(LegalCase.monitoring_enabled == True)
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(LegalCase.last_sync_at.nullsfirst())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        cases = list(result.scalars().all())
        
        # Cache results
        if use_cache and cases:
            cache_key = f"cases:monitored:skip:{skip}:limit:{limit}"
            cache_data = [case.to_dict() for case in cases]
            await cache_service.set(
                cache_key,
                cache_data,
                ttl=180,  # 3 minutes (shorter for monitoring data)
                tenant_id=self.tenant_id,
            )
        
        return cases
    
    async def get_cases_with_upcoming_deadlines(
        self,
        days_ahead: int = 7,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = True,
    ) -> list[LegalCase]:
        """
        Get cases with deadlines in the next N days within tenant.
        
        Uses optimized composite index: idx_legal_cases_tenant_deadline
        
        Args:
            days_ahead: Number of days to look ahead
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of legal case instances with upcoming deadlines
        """
        # Try cache first
        if use_cache:
            cache_key = f"cases:deadlines:{days_ahead}:skip:{skip}:limit:{limit}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return [LegalCase(**item) for item in cached]
        
        today = date.today()
        future_date = today + timedelta(days=days_ahead)
        
        # Query database
        query = select(LegalCase).where(
            LegalCase.next_deadline != None,
            LegalCase.next_deadline >= today,
            LegalCase.next_deadline <= future_date,
        )
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(LegalCase.next_deadline)
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        cases = list(result.scalars().all())
        
        # Cache results
        if use_cache and cases:
            cache_key = f"cases:deadlines:{days_ahead}:skip:{skip}:limit:{limit}"
            cache_data = [case.to_dict() for case in cases]
            await cache_service.set(
                cache_key,
                cache_data,
                ttl=300,  # 5 minutes
                tenant_id=self.tenant_id,
            )
        
        return cases
    
    async def get_cases_with_missed_deadlines(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = False,  # Don't cache missed deadlines by default
    ) -> list[LegalCase]:
        """
        Get cases with missed deadlines within tenant.
        
        Uses optimized composite index: idx_legal_cases_tenant_deadline
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of legal case instances with missed deadlines
        """
        today = date.today()
        
        # Query database
        query = select(LegalCase).where(
            LegalCase.next_deadline != None,
            LegalCase.next_deadline < today,
        )
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(LegalCase.next_deadline)
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        cases = list(result.scalars().all())
        
        return cases
    
    async def get_cases_needing_sync(
        self,
        hours_since_sync: int = 6,
        *,
        limit: int = 100,
    ) -> list[LegalCase]:
        """
        Get cases that need synchronization with DataJud within tenant.
        
        Uses optimized composite index: idx_legal_cases_tenant_monitoring_sync
        
        Args:
            hours_since_sync: Hours since last sync
            limit: Maximum number of records to return
            
        Returns:
            List of legal case instances needing sync
        """
        cutoff_time = datetime.now() - timedelta(hours=hours_since_sync)
        
        # Query database (no caching for sync queries)
        query = select(LegalCase).where(
            LegalCase.monitoring_enabled == True,
        ).where(
            (LegalCase.last_sync_at == None) | (LegalCase.last_sync_at < cutoff_time)
        )
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(LegalCase.last_sync_at.nullsfirst())
        query = query.limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_last_sync(
        self,
        id: UUID,
    ) -> LegalCase | None:
        """
        Update last sync timestamp for a case and invalidate caches.
        
        Args:
            id: LegalCase UUID
            
        Returns:
            Updated legal case instance or None if not found
        """
        case = await self.get(id, with_relationships=False)
        if not case:
            return None
        
        case.last_sync_at = datetime.now()
        await self.session.flush()
        await self.session.refresh(case)
        
        # Invalidate related caches
        await self._invalidate_case_caches(case)
        
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
        Update last movement date for a case and invalidate caches.
        
        Args:
            id: LegalCase UUID
            movement_date: Date of last movement
            
        Returns:
            Updated legal case instance or None if not found
        """
        case = await self.get(id, with_relationships=False)
        if not case:
            return None
        
        # Only update if new date is more recent
        if case.last_movement_date is None or movement_date > case.last_movement_date:
            case.last_movement_date = movement_date
            await self.session.flush()
            await self.session.refresh(case)
            
            # Invalidate related caches
            await self._invalidate_case_caches(case)
            
            logger.debug(
                "Updated case last movement date",
                extra={
                    "case_id": str(id),
                    "tenant_id": str(self.tenant_id),
                    "movement_date": str(movement_date),
                },
            )
        
        return case
    
    async def create(self, **data) -> LegalCase:
        """
        Create a new legal case and invalidate list caches.
        
        Args:
            **data: LegalCase field values
            
        Returns:
            Created legal case instance
        """
        case = await super().create(**data)
        
        # Invalidate list caches
        await cache_service.delete_pattern("cases:monitored:*", tenant_id=self.tenant_id)
        await cache_service.delete_pattern(
            f"cases:client:{case.client_id}:*",
            tenant_id=self.tenant_id,
        )
        
        return case
    
    async def update(self, id: UUID, **data) -> LegalCase | None:
        """
        Update a legal case and invalidate related caches.
        
        Args:
            id: LegalCase UUID
            **data: Fields to update
            
        Returns:
            Updated legal case instance or None if not found
        """
        case = await super().update(id, **data)
        
        if case:
            await self._invalidate_case_caches(case)
        
        return case
    
    async def _invalidate_case_caches(self, case: LegalCase) -> None:
        """
        Invalidate all caches related to a legal case.
        
        Args:
            case: LegalCase instance
        """
        # Invalidate specific case caches
        await cache_service.delete(
            f"case:cnj:{case.cnj_number}",
            tenant_id=self.tenant_id,
        )
        
        # Invalidate list caches
        await cache_service.delete_pattern("cases:monitored:*", tenant_id=self.tenant_id)
        await cache_service.delete_pattern("cases:deadlines:*", tenant_id=self.tenant_id)
        await cache_service.delete_pattern(
            f"cases:client:{case.client_id}:*",
            tenant_id=self.tenant_id,
        )
