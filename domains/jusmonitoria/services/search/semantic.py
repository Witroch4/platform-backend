"""Semantic search service using pgvector."""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

import structlog
from openai import AsyncOpenAI
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.timeline_embedding import TimelineEmbedding
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent

logger = structlog.get_logger(__name__)


class SemanticSearchResult:
    """Result from semantic search with similarity score."""

    def __init__(
        self,
        entity: CaseMovement | TimelineEvent,
        score: float,
        distance: float,
    ):
        """
        Initialize search result.
        
        Args:
            entity: The matched entity (movement or timeline event)
            score: Similarity score (0-1, higher is more similar)
            distance: Cosine distance (0-2, lower is more similar)
        """
        self.entity = entity
        self.score = score
        self.distance = distance

    def __repr__(self) -> str:
        return f"<SemanticSearchResult(score={self.score:.3f}, entity={self.entity})>"


class SemanticSearchService:
    """
    Service for semantic search using pgvector.
    
    Supports searching case movements and timeline events
    with filters by tenant, case, date range, etc.
    """

    def __init__(self, session: AsyncSession):
        """
        Initialize semantic search service.
        
        Args:
            session: SQLAlchemy async session
        """
        self.session = session
        self.openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.embedding_model = settings.openai_embedding_model

    async def _generate_query_embedding(self, query: str) -> List[float]:
        """
        Generate embedding for search query.
        
        Args:
            query: Search query text
            
        Returns:
            Embedding vector
        """
        response = await self.openai_client.embeddings.create(
            model=self.embedding_model,
            input=query,
        )
        
        return response.data[0].embedding

    async def search_case_movements(
        self,
        tenant_id: UUID,
        query: str,
        limit: int = 10,
        case_id: Optional[UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        min_score: float = 0.0,
    ) -> List[SemanticSearchResult]:
        """
        Search case movements using semantic similarity.
        
        Args:
            tenant_id: Tenant UUID for isolation
            query: Search query text
            limit: Maximum number of results (default: 10)
            case_id: Optional filter by specific case
            date_from: Optional filter by start date
            date_to: Optional filter by end date
            min_score: Minimum similarity score (0-1)
            
        Returns:
            List of search results ordered by similarity
        """
        logger.info(
            "searching_case_movements",
            tenant_id=str(tenant_id),
            query=query,
            limit=limit,
        )
        
        # Generate query embedding
        query_embedding = await self._generate_query_embedding(query)
        
        # Build query with filters
        filters = [CaseMovement.tenant_id == tenant_id]
        
        if case_id:
            filters.append(CaseMovement.legal_case_id == case_id)
        
        if date_from:
            filters.append(CaseMovement.movement_date >= date_from)
        
        if date_to:
            filters.append(CaseMovement.movement_date <= date_to)
        
        # Only search movements that have embeddings
        filters.append(CaseMovement.embedding.is_not(None))
        
        # Calculate cosine distance and convert to similarity score
        # Cosine distance: 0 = identical, 2 = opposite
        # Similarity score: 1 = identical, 0 = opposite
        distance_expr = CaseMovement.embedding.cosine_distance(query_embedding)
        score_expr = (1 - distance_expr / 2)
        
        stmt = (
            select(
                CaseMovement,
                distance_expr.label("distance"),
                score_expr.label("score"),
            )
            .where(and_(*filters))
            .order_by(distance_expr)
            .limit(limit)
        )
        
        result = await self.session.execute(stmt)
        rows = result.all()
        
        # Filter by minimum score and create results
        results = []
        for row in rows:
            movement, distance, score = row
            
            if score >= min_score:
                results.append(
                    SemanticSearchResult(
                        entity=movement,
                        score=float(score),
                        distance=float(distance),
                    )
                )
        
        logger.info(
            "case_movements_search_completed",
            tenant_id=str(tenant_id),
            results_count=len(results),
        )
        
        return results

    async def search_timeline_events(
        self,
        tenant_id: UUID,
        query: str,
        limit: int = 10,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
        event_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        min_score: float = 0.0,
    ) -> List[SemanticSearchResult]:
        """
        Search timeline events using semantic similarity.
        
        Args:
            tenant_id: Tenant UUID for isolation
            query: Search query text
            limit: Maximum number of results (default: 10)
            entity_type: Optional filter by entity type (client, lead, legal_case)
            entity_id: Optional filter by specific entity
            event_type: Optional filter by event type
            date_from: Optional filter by start datetime
            date_to: Optional filter by end datetime
            min_score: Minimum similarity score (0-1)
            
        Returns:
            List of search results ordered by similarity
        """
        logger.info(
            "searching_timeline_events",
            tenant_id=str(tenant_id),
            query=query,
            limit=limit,
        )
        
        # Generate query embedding
        query_embedding = await self._generate_query_embedding(query)
        
        # Build query with filters
        filters = [TimelineEvent.tenant_id == tenant_id]
        
        if entity_type:
            filters.append(TimelineEvent.entity_type == entity_type)
        
        if entity_id:
            filters.append(TimelineEvent.entity_id == entity_id)
        
        if event_type:
            filters.append(TimelineEvent.event_type == event_type)
        
        if date_from:
            filters.append(TimelineEvent.created_at >= date_from)
        
        if date_to:
            filters.append(TimelineEvent.created_at <= date_to)
        
        # Calculate cosine distance and convert to similarity score
        distance_expr = TimelineEmbedding.embedding.cosine_distance(query_embedding)
        score_expr = (1 - distance_expr / 2)
        
        stmt = (
            select(
                TimelineEvent,
                distance_expr.label("distance"),
                score_expr.label("score"),
            )
            .join(TimelineEmbedding)
            .where(and_(*filters))
            .order_by(distance_expr)
            .limit(limit)
        )
        
        result = await self.session.execute(stmt)
        rows = result.all()
        
        # Filter by minimum score and create results
        results = []
        for row in rows:
            event, distance, score = row
            
            if score >= min_score:
                results.append(
                    SemanticSearchResult(
                        entity=event,
                        score=float(score),
                        distance=float(distance),
                    )
                )
        
        logger.info(
            "timeline_events_search_completed",
            tenant_id=str(tenant_id),
            results_count=len(results),
        )
        
        return results

    async def find_similar_cases(
        self,
        tenant_id: UUID,
        reference_case_id: UUID,
        limit: int = 5,
        min_score: float = 0.5,
    ) -> List[tuple[LegalCase, float]]:
        """
        Find cases similar to a reference case based on movement embeddings.
        
        Aggregates similarity across all movements of the reference case.
        
        Args:
            tenant_id: Tenant UUID for isolation
            reference_case_id: UUID of the reference case
            limit: Maximum number of similar cases to return
            min_score: Minimum average similarity score
            
        Returns:
            List of tuples (case, average_similarity_score)
        """
        logger.info(
            "finding_similar_cases",
            tenant_id=str(tenant_id),
            reference_case_id=str(reference_case_id),
        )
        
        # Get movements from reference case
        stmt = select(CaseMovement).where(
            CaseMovement.tenant_id == tenant_id,
            CaseMovement.legal_case_id == reference_case_id,
            CaseMovement.embedding.is_not(None),
        )
        
        result = await self.session.execute(stmt)
        reference_movements = result.scalars().all()
        
        if not reference_movements:
            logger.warning(
                "no_movements_for_reference_case",
                reference_case_id=str(reference_case_id),
            )
            return []
        
        # For each reference movement, find similar movements in other cases
        case_scores: dict[UUID, List[float]] = {}
        
        for ref_movement in reference_movements:
            # Search for similar movements
            distance_expr = CaseMovement.embedding.cosine_distance(ref_movement.embedding)
            score_expr = (1 - distance_expr / 2)
            
            stmt = (
                select(
                    CaseMovement.legal_case_id,
                    score_expr.label("score"),
                )
                .where(
                    CaseMovement.tenant_id == tenant_id,
                    CaseMovement.legal_case_id != reference_case_id,
                    CaseMovement.embedding.is_not(None),
                )
                .order_by(distance_expr)
                .limit(20)  # Get top 20 similar movements
            )
            
            result = await self.session.execute(stmt)
            rows = result.all()
            
            for case_id, score in rows:
                if case_id not in case_scores:
                    case_scores[case_id] = []
                case_scores[case_id].append(float(score))
        
        # Calculate average scores and filter
        case_avg_scores = [
            (case_id, sum(scores) / len(scores))
            for case_id, scores in case_scores.items()
        ]
        
        # Filter by minimum score and sort
        case_avg_scores = [
            (case_id, avg_score)
            for case_id, avg_score in case_avg_scores
            if avg_score >= min_score
        ]
        case_avg_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Fetch case objects
        top_case_ids = [case_id for case_id, _ in case_avg_scores[:limit]]
        
        if not top_case_ids:
            return []
        
        stmt = select(LegalCase).where(
            LegalCase.tenant_id == tenant_id,
            LegalCase.id.in_(top_case_ids),
        )
        
        result = await self.session.execute(stmt)
        cases = {case.id: case for case in result.scalars().all()}
        
        # Build results maintaining order
        results = [
            (cases[case_id], avg_score)
            for case_id, avg_score in case_avg_scores[:limit]
            if case_id in cases
        ]
        
        logger.info(
            "similar_cases_found",
            tenant_id=str(tenant_id),
            reference_case_id=str(reference_case_id),
            similar_cases_count=len(results),
        )
        
        return results
