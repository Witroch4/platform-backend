"""Case movement repository for tracking legal process updates."""

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class CaseMovementRepository(BaseRepository[CaseMovement]):
    """Repository for CaseMovement operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(CaseMovement, session, tenant_id)
    
    async def get_by_case(
        self,
        legal_case_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[CaseMovement]:
        """
        Get movements for a specific legal case within tenant.
        
        Args:
            legal_case_id: LegalCase UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of case movement instances
        """
        query = select(CaseMovement).where(
            CaseMovement.legal_case_id == legal_case_id
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(CaseMovement.movement_date.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_content_hash(
        self,
        legal_case_id: UUID,
        content_hash: str,
    ) -> CaseMovement | None:
        """
        Get movement by content hash for deduplication within tenant.
        
        Args:
            legal_case_id: LegalCase UUID
            content_hash: SHA256 hash of movement content
            
        Returns:
            CaseMovement instance or None if not found
        """
        query = select(CaseMovement).where(
            CaseMovement.legal_case_id == legal_case_id,
            CaseMovement.content_hash == content_hash,
        )
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_hash(
        self,
        legal_case_id: UUID,
        content_hash: str,
    ) -> CaseMovement | None:
        """
        Alias for get_by_content_hash for backward compatibility.
        
        Args:
            legal_case_id: LegalCase UUID
            content_hash: SHA256 hash of movement content
            
        Returns:
            CaseMovement instance or None if not found
        """
        return await self.get_by_content_hash(legal_case_id, content_hash)
    
    async def get_important_movements(
        self,
        legal_case_id: UUID | None = None,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[CaseMovement]:
        """
        Get important movements within tenant.
        
        Args:
            legal_case_id: Optional LegalCase UUID to filter by
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of important case movement instances
        """
        query = select(CaseMovement).where(CaseMovement.is_important == True)
        
        if legal_case_id:
            query = query.where(CaseMovement.legal_case_id == legal_case_id)
        
        query = self._apply_tenant_filter(query)
        query = query.order_by(CaseMovement.movement_date.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_movements_requiring_action(
        self,
        legal_case_id: UUID | None = None,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[CaseMovement]:
        """
        Get movements that require action within tenant.
        
        Args:
            legal_case_id: Optional LegalCase UUID to filter by
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of case movement instances requiring action
        """
        query = select(CaseMovement).where(CaseMovement.requires_action == True)
        
        if legal_case_id:
            query = query.where(CaseMovement.legal_case_id == legal_case_id)
        
        query = self._apply_tenant_filter(query)
        query = query.order_by(CaseMovement.movement_date.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_recent_movements(
        self,
        days: int = 7,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[CaseMovement]:
        """
        Get movements from the last N days within tenant.
        
        Args:
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of recent case movement instances
        """
        from datetime import timedelta
        
        cutoff_date = date.today() - timedelta(days=days)
        
        query = select(CaseMovement).where(
            CaseMovement.movement_date >= cutoff_date
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(CaseMovement.movement_date.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_movements_without_embeddings(
        self,
        *,
        limit: int = 100,
    ) -> list[CaseMovement]:
        """
        Get movements that don't have embeddings yet within tenant.
        
        Args:
            limit: Maximum number of records to return
            
        Returns:
            List of case movement instances without embeddings
        """
        query = select(CaseMovement).where(CaseMovement.embedding == None)
        query = self._apply_tenant_filter(query)
        query = query.order_by(CaseMovement.created_at)
        query = query.limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def search_by_similarity(
        self,
        embedding: list[float],
        *,
        legal_case_id: UUID | None = None,
        limit: int = 10,
    ) -> list[tuple[CaseMovement, float]]:
        """
        Search movements by embedding similarity within tenant.
        
        Uses pgvector cosine similarity for semantic search.
        
        Args:
            embedding: Query embedding vector
            legal_case_id: Optional LegalCase UUID to filter by
            limit: Maximum number of results
            
        Returns:
            List of tuples (movement, similarity_score)
        """
        from sqlalchemy import func
        
        # Calculate cosine similarity using pgvector
        similarity = CaseMovement.embedding.cosine_distance(embedding)
        
        query = select(CaseMovement, similarity).where(
            CaseMovement.embedding != None
        )
        
        if legal_case_id:
            query = query.where(CaseMovement.legal_case_id == legal_case_id)
        
        query = self._apply_tenant_filter(query)
        query = query.order_by(similarity)
        query = query.limit(limit)
        
        result = await self.session.execute(query)
        return [(row[0], float(row[1])) for row in result.all()]
    
    async def update_ai_analysis(
        self,
        id: UUID,
        *,
        is_important: bool | None = None,
        ai_summary: str | None = None,
        requires_action: bool | None = None,
    ) -> CaseMovement | None:
        """
        Update AI analysis results for a movement within tenant.
        
        Args:
            id: CaseMovement UUID
            is_important: Whether movement is important
            ai_summary: AI-generated summary
            requires_action: Whether movement requires action
            
        Returns:
            Updated case movement instance or None if not found
        """
        movement = await self.get(id)
        if not movement:
            return None
        
        if is_important is not None:
            movement.is_important = is_important
        
        if ai_summary is not None:
            movement.ai_summary = ai_summary
        
        if requires_action is not None:
            movement.requires_action = requires_action
        
        await self.session.flush()
        await self.session.refresh(movement)
        
        logger.debug(
            "Updated movement AI analysis",
            extra={
                "movement_id": str(id),
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return movement
