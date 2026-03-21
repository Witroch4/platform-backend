"""Embeddings generation worker for semantic search."""

import asyncio
from typing import List
from uuid import UUID

import structlog
from openai import AsyncOpenAI
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from platform_core.db.sessions import session_ctx
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.timeline_embedding import TimelineEmbedding
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.base import with_retry, with_timeout

logger = structlog.get_logger(__name__)


class EmbeddingService:
    """
    Service for generating embeddings using OpenAI.
    
    Uses text-embedding-3-small model (1536 dimensions).
    """

    def __init__(self, api_key: str):
        """
        Initialize embedding service.
        
        Args:
            api_key: OpenAI API key
        """
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = settings.openai_embedding_model
        self.dimensions = settings.embedding_dimension

    @with_retry(max_retries=3, backoff_factor=2.0, initial_delay=1.0)
    @with_timeout(30.0)
    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        response = await self.client.embeddings.create(
            model=self.model,
            input=text,
        )
        
        return response.data[0].embedding

    async def generate_embeddings_batch(
        self,
        texts: List[str],
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batch.
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        response = await self.client.embeddings.create(
            model=self.model,
            input=texts,
        )
        
        # Sort by index to maintain order
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]


@broker.task(retry_on_error=True, max_retries=3)
async def generate_case_movement_embeddings(
    tenant_id: str,
    movement_ids: List[str],
) -> dict:
    """
    Generate embeddings for case movements in batch.
    
    Processes up to 50 movements at a time.
    
    Args:
        tenant_id: Tenant UUID as string
        movement_ids: List of movement UUIDs as strings
        
    Returns:
        Dict with success status and counts
    """
    tenant_uuid = UUID(tenant_id)
    movement_uuids = [UUID(mid) for mid in movement_ids]
    
    logger.info(
        "generating_movement_embeddings",
        tenant_id=tenant_id,
        movement_count=len(movement_ids),
    )
    
    async with session_ctx() as session:
        # Fetch movements
        stmt = select(CaseMovement).where(
            CaseMovement.tenant_id == tenant_uuid,
            CaseMovement.id.in_(movement_uuids),
            CaseMovement.embedding.is_(None),  # Only process movements without embeddings
        )
        
        result = await session.execute(stmt)
        movements = result.scalars().all()
        
        if not movements:
            logger.info("no_movements_to_process", tenant_id=tenant_id)
            return {"success": True, "processed": 0, "skipped": len(movement_ids)}
        
        # Generate embeddings
        embedding_service = EmbeddingService(settings.openai_api_key)
        
        texts = [m.description for m in movements]
        embeddings = await embedding_service.generate_embeddings_batch(texts)
        
        # Update movements with embeddings
        processed = 0
        for movement, embedding in zip(movements, embeddings):
            movement.embedding = embedding
            processed += 1
        
        await session.commit()
        
        logger.info(
            "embeddings_generated",
            tenant_id=tenant_id,
            processed=processed,
        )
        
        return {
            "success": True,
            "processed": processed,
            "skipped": len(movement_ids) - processed,
        }


@broker.task(retry_on_error=True, max_retries=3)
async def generate_timeline_event_embeddings(
    tenant_id: str,
    event_ids: List[str],
) -> dict:
    """
    Generate embeddings for timeline events in batch.
    
    Processes up to 50 events at a time.
    
    Args:
        tenant_id: Tenant UUID as string
        event_ids: List of event UUIDs as strings
        
    Returns:
        Dict with success status and counts
    """
    tenant_uuid = UUID(tenant_id)
    event_uuids = [UUID(eid) for eid in event_ids]
    
    logger.info(
        "generating_timeline_embeddings",
        tenant_id=tenant_id,
        event_count=len(event_ids),
    )
    
    async with session_ctx() as session:
        # Fetch events that don't have embeddings yet
        stmt = (
            select(TimelineEvent)
            .outerjoin(TimelineEmbedding)
            .where(
                TimelineEvent.tenant_id == tenant_uuid,
                TimelineEvent.id.in_(event_uuids),
                TimelineEmbedding.id.is_(None),  # No embedding exists
            )
        )
        
        result = await session.execute(stmt)
        events = result.scalars().all()
        
        if not events:
            logger.info("no_events_to_process", tenant_id=tenant_id)
            return {"success": True, "processed": 0, "skipped": len(event_ids)}
        
        # Generate embeddings
        embedding_service = EmbeddingService(settings.openai_api_key)
        
        # Combine title and description for better semantic representation
        texts = [
            f"{event.title}\n{event.description or ''}"
            for event in events
        ]
        embeddings = await embedding_service.generate_embeddings_batch(texts)
        
        # Create timeline embeddings
        processed = 0
        for event, embedding in zip(events, embeddings):
            timeline_embedding = TimelineEmbedding(
                tenant_id=tenant_uuid,
                timeline_event_id=event.id,
                embedding=embedding,
                model=settings.openai_embedding_model,
            )
            session.add(timeline_embedding)
            processed += 1
        
        await session.commit()
        
        logger.info(
            "timeline_embeddings_generated",
            tenant_id=tenant_id,
            processed=processed,
        )
        
        return {
            "success": True,
            "processed": processed,
            "skipped": len(event_ids) - processed,
        }


@broker.task(retry_on_error=True, max_retries=3)
async def batch_generate_embeddings_for_tenant(
    tenant_id: str,
    entity_type: str = "movement",
) -> dict:
    """
    Generate embeddings for all entities of a tenant that don't have embeddings.
    
    Processes in batches of 50 to respect rate limits.
    
    Args:
        tenant_id: Tenant UUID as string
        entity_type: Type of entity ("movement" or "timeline_event")
        
    Returns:
        Dict with success status and total counts
    """
    tenant_uuid = UUID(tenant_id)
    batch_size = settings.embedding_batch_size
    
    logger.info(
        "batch_embedding_generation_started",
        tenant_id=tenant_id,
        entity_type=entity_type,
    )
    
    async with session_ctx() as session:
        if entity_type == "movement":
            # Get movements without embeddings
            stmt = select(CaseMovement.id).where(
                CaseMovement.tenant_id == tenant_uuid,
                CaseMovement.embedding.is_(None),
            )
            result = await session.execute(stmt)
            entity_ids = [str(row[0]) for row in result.all()]
            
        elif entity_type == "timeline_event":
            # Get timeline events without embeddings
            stmt = (
                select(TimelineEvent.id)
                .outerjoin(TimelineEmbedding)
                .where(
                    TimelineEvent.tenant_id == tenant_uuid,
                    TimelineEmbedding.id.is_(None),
                )
            )
            result = await session.execute(stmt)
            entity_ids = [str(row[0]) for row in result.all()]
            
        else:
            raise ValueError(f"Invalid entity_type: {entity_type}")
    
    if not entity_ids:
        logger.info(
            "no_entities_need_embeddings",
            tenant_id=tenant_id,
            entity_type=entity_type,
        )
        return {"success": True, "total_processed": 0, "batches": 0}
    
    # Process in batches
    total_processed = 0
    batches = 0
    
    for i in range(0, len(entity_ids), batch_size):
        batch = entity_ids[i:i + batch_size]
        
        if entity_type == "movement":
            result = await generate_case_movement_embeddings.kiq(
                tenant_id=tenant_id,
                movement_ids=batch,
            )
        else:
            result = await generate_timeline_event_embeddings.kiq(
                tenant_id=tenant_id,
                event_ids=batch,
            )
        
        # Wait for result
        task_result = await result.wait_result(timeout=60.0)
        if task_result.is_ok:
            total_processed += task_result.return_value.get("processed", 0)
        
        batches += 1
        
        # Small delay between batches to avoid rate limits
        if i + batch_size < len(entity_ids):
            await asyncio.sleep(1.0)
    
    logger.info(
        "batch_embedding_generation_completed",
        tenant_id=tenant_id,
        entity_type=entity_type,
        total_processed=total_processed,
        batches=batches,
    )
    
    return {
        "success": True,
        "total_processed": total_processed,
        "batches": batches,
    }
