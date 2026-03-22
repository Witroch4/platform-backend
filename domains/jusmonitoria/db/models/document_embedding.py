"""Document embedding model for multimodal semantic search.

Stores vector embeddings generated from documents (PDFs, images) and text
using Google Gemini Embedding, enabling cross-modal retrieval.
"""

import enum
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class EmbeddingSourceType(str, enum.Enum):
    """Type of content that was embedded."""

    TEXT = "text"
    PDF = "pdf"
    IMAGE = "image"


class DocumentEmbedding(TenantBaseModel):
    """Multimodal embedding for documents, movements, and events.

    Supports text, PDF, image, audio, and video sources in a unified
    vector space (Gemini Embedding 2, 1536 dims via MRL truncation),
    enabling cross-modal search (e.g. text query → matching PDF/image).
    """

    __tablename__ = "document_embeddings"
    __table_args__ = (
        UniqueConstraint(
            "source_type", "source_id", "s3_key",
            name="uq_document_embeddings_source",
        ),
    )

    # ── Tenant ────────────────────────────────────────────────────
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Source reference (polymorphic) ────────────────────────────
    source_type: Mapped[EmbeddingSourceType] = mapped_column(
        Enum(EmbeddingSourceType, native_enum=False, length=20),
        nullable=False,
        comment="Type of content that was embedded (text, pdf, image)",
    )

    source_entity: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Entity table name, e.g. 'case_movements', 'peticao_documentos'",
    )

    source_id: Mapped[UUID] = mapped_column(
        nullable=False,
        index=True,
        comment="Primary key of the source entity row",
    )

    s3_key: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="S3 object key if embedding was generated from a file",
    )

    # ── Embedding vector ──────────────────────────────────────────
    embedding: Mapped[Vector] = mapped_column(
        Vector(1536),
        nullable=False,
        comment="Gemini Embedding 2 vector (1536 dims — best MTEB quality within pgvector HNSW 2000-dim limit)",
    )

    # ── Metadata ──────────────────────────────────────────────────
    model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="gemini-embedding-2-preview",
        comment="Embedding model used",
    )

    content_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="SHA-256 of the embedded content for deduplication",
    )

    file_size_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Size of the source file in bytes",
    )

    mime_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="MIME type of the embedded content",
    )

    excerpt: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Short text excerpt for display in search results",
    )

    # ── Relationships ─────────────────────────────────────────────
    tenant: Mapped["Tenant"] = relationship(  # noqa: F821
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<DocumentEmbedding(id={self.id}, "
            f"source={self.source_entity}:{self.source_id}, "
            f"type={self.source_type.value})>"
        )
