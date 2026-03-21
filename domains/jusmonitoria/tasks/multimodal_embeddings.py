"""Multimodal embeddings worker — generates Gemini Embedding vectors for
documents (PDFs, images) and text stored in S3.

This module adds new Taskiq tasks that complement the existing text-only
embedding pipeline in ``embeddings.py``.
"""

import hashlib
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from platform_core.config import settings
from domains.jusmonitoria.services.multimodal_embedding_service import (
    SUPPORTED_MIME_TYPES,
    MultimodalEmbeddingService,
)
from domains.jusmonitoria.services.storage import download_bytes_from_s3
from domains.jusmonitoria.db.session_compat import session_ctx
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.document_embedding import DocumentEmbedding, EmbeddingSourceType
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.base import with_retry, with_timeout

logger = structlog.get_logger(__name__)


def _mime_from_key(s3_key: str) -> str | None:
    """Infer MIME type from an S3 key extension."""
    suffix = PurePosixPath(s3_key).suffix.lower()
    return SUPPORTED_MIME_TYPES.get(suffix)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── Single-document embedding ────────────────────────────────────


@broker.task(retry_on_error=True, max_retries=3)
async def generate_document_embedding(
    tenant_id: str,
    source_entity: str,
    source_id: str,
    s3_key: str,
) -> dict[str, Any]:
    """Download a file from S3 and generate a multimodal embedding.

    The embedding is stored (or updated) in ``document_embeddings``.

    Args:
        tenant_id: Tenant UUID.
        source_entity: Table name of the owning entity.
        source_id: PK of the owning entity row.
        s3_key: S3 object key for the file.

    Returns:
        Dict with ``success``, ``source_id``, ``s3_key``.
    """
    tenant_uuid = UUID(tenant_id)
    source_uuid = UUID(source_id)

    mime_type = _mime_from_key(s3_key)
    if mime_type is None:
        logger.warning("unsupported_file_type", s3_key=s3_key)
        return {"success": False, "reason": "unsupported_file_type", "s3_key": s3_key}

    logger.info(
        "generating_document_embedding",
        tenant_id=tenant_id,
        source_entity=source_entity,
        source_id=source_id,
        s3_key=s3_key,
        mime_type=mime_type,
    )

    # 1. Download file from S3
    data = await _download_s3(s3_key)
    content_hash = _sha256(data)

    # 2. Check if we already have an embedding for this exact content
    async with session_ctx() as session:
        existing = await session.execute(
            select(DocumentEmbedding.id).where(
                DocumentEmbedding.tenant_id == tenant_uuid,
                DocumentEmbedding.source_id == source_uuid,
                DocumentEmbedding.s3_key == s3_key,
                DocumentEmbedding.content_hash == content_hash,
            )
        )
        if existing.scalar_one_or_none() is not None:
            logger.info("embedding_already_exists", s3_key=s3_key)
            return {"success": True, "skipped": True, "s3_key": s3_key}

    # 3. Generate embedding
    svc = MultimodalEmbeddingService()
    embedding = await svc.embed_document(data, mime_type)

    # 4. Upsert into document_embeddings
    source_type = (
        EmbeddingSourceType.PDF
        if mime_type == "application/pdf"
        else EmbeddingSourceType.IMAGE
    )

    async with session_ctx() as session:
        stmt = (
            pg_insert(DocumentEmbedding)
            .values(
                tenant_id=tenant_uuid,
                source_type=source_type.value,
                source_entity=source_entity,
                source_id=source_uuid,
                s3_key=s3_key,
                embedding=embedding,
                model=settings.gemini_embedding_model,
                content_hash=content_hash,
                file_size_bytes=len(data),
                mime_type=mime_type,
            )
            .on_conflict_do_update(
                constraint="uq_document_embeddings_source",
                set_={
                    "embedding": embedding,
                    "content_hash": content_hash,
                    "file_size_bytes": len(data),
                    "model": settings.gemini_embedding_model,
                },
            )
        )
        await session.execute(stmt)
        await session.commit()

    logger.info(
        "document_embedding_generated",
        tenant_id=tenant_id,
        source_entity=source_entity,
        source_id=source_id,
        s3_key=s3_key,
    )

    return {"success": True, "s3_key": s3_key}


# ── Text embedding (Gemini) ─────────────────────────────────────


@broker.task(retry_on_error=True, max_retries=3)
async def generate_text_embedding_gemini(
    tenant_id: str,
    source_entity: str,
    source_id: str,
    text: str,
    excerpt: str | None = None,
) -> dict[str, Any]:
    """Generate a Gemini text embedding and store it in document_embeddings.

    This complements the existing OpenAI-based text embeddings by creating
    a Gemini vector in the same table / vector space as document embeddings,
    enabling cross-modal search.
    """
    tenant_uuid = UUID(tenant_id)
    source_uuid = UUID(source_id)
    content_hash = hashlib.sha256(text.encode()).hexdigest()

    # Skip if content unchanged
    async with session_ctx() as session:
        existing = await session.execute(
            select(DocumentEmbedding.id).where(
                DocumentEmbedding.tenant_id == tenant_uuid,
                DocumentEmbedding.source_id == source_uuid,
                DocumentEmbedding.s3_key.is_(None),
                DocumentEmbedding.content_hash == content_hash,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return {"success": True, "skipped": True}

    svc = MultimodalEmbeddingService()
    embedding = await svc.embed_text(text)

    async with session_ctx() as session:
        stmt = (
            pg_insert(DocumentEmbedding)
            .values(
                tenant_id=tenant_uuid,
                source_type=EmbeddingSourceType.TEXT.value,
                source_entity=source_entity,
                source_id=source_uuid,
                s3_key=None,
                embedding=embedding,
                model=settings.gemini_embedding_model,
                content_hash=content_hash,
                mime_type="text/plain",
                excerpt=(excerpt or text)[:500],
            )
            .on_conflict_do_update(
                constraint="uq_document_embeddings_source",
                set_={
                    "embedding": embedding,
                    "content_hash": content_hash,
                    "model": settings.gemini_embedding_model,
                    "excerpt": (excerpt or text)[:500],
                },
            )
        )
        await session.execute(stmt)
        await session.commit()

    return {"success": True, "skipped": False}


# ── Batch: embed all movements for a tenant ──────────────────────


@broker.task(retry_on_error=True, max_retries=2)
async def batch_generate_multimodal_embeddings_for_tenant(
    tenant_id: str,
) -> dict[str, Any]:
    """Generate Gemini embeddings for all case movements (text) of a tenant
    that don't yet have a document_embedding row.

    This is the multimodal counterpart to
    ``batch_generate_embeddings_for_tenant`` (OpenAI text-only).
    """
    tenant_uuid = UUID(tenant_id)
    batch_size = settings.embedding_batch_size

    logger.info("batch_multimodal_embedding_started", tenant_id=tenant_id)

    async with session_ctx() as session:
        # Find movements that don't have a Gemini embedding yet
        subq = (
            select(DocumentEmbedding.source_id)
            .where(
                DocumentEmbedding.tenant_id == tenant_uuid,
                DocumentEmbedding.source_entity == "case_movements",
                DocumentEmbedding.source_type == EmbeddingSourceType.TEXT.value,
            )
            .correlate(CaseMovement)
        )

        stmt = select(CaseMovement.id, CaseMovement.description).where(
            CaseMovement.tenant_id == tenant_uuid,
            ~CaseMovement.id.in_(subq),
        )
        result = await session.execute(stmt)
        rows = result.all()

    if not rows:
        logger.info("no_movements_need_multimodal_embedding", tenant_id=tenant_id)
        return {"success": True, "total_processed": 0}

    # Process in batches using the service directly for efficiency
    svc = MultimodalEmbeddingService()
    total_processed = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        texts = [row.description for row in batch]
        embeddings = await svc.embed_texts_batch(texts)

        async with session_ctx() as session:
            for (mid, desc), emb in zip(batch, embeddings):
                content_hash = hashlib.sha256(desc.encode()).hexdigest()
                stmt = (
                    pg_insert(DocumentEmbedding)
                    .values(
                        tenant_id=tenant_uuid,
                        source_type=EmbeddingSourceType.TEXT.value,
                        source_entity="case_movements",
                        source_id=mid,
                        s3_key=None,
                        embedding=emb,
                        model=settings.gemini_embedding_model,
                        content_hash=content_hash,
                        mime_type="text/plain",
                        excerpt=desc[:500],
                    )
                    .on_conflict_do_nothing(
                        constraint="uq_document_embeddings_source",
                    )
                )
                await session.execute(stmt)
            await session.commit()

        total_processed += len(batch)

    logger.info(
        "batch_multimodal_embedding_completed",
        tenant_id=tenant_id,
        total_processed=total_processed,
    )
    return {"success": True, "total_processed": total_processed}


# ── Helpers ──────────────────────────────────────────────────────


@with_retry(max_retries=2, backoff_factor=2.0, initial_delay=1.0)
@with_timeout(60.0)
async def _download_s3(s3_key: str) -> bytes:
    """Download from S3 with retry and timeout."""
    import asyncio

    return await asyncio.to_thread(download_bytes_from_s3, s3_key)
