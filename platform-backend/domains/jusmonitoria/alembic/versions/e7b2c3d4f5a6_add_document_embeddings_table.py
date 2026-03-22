"""Add document_embeddings table for multimodal semantic search.

Revision ID: e7b2c3d4f5a6
Revises: d6a1b2c3e4f5
Create Date: 2026-03-12 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = "e7b2c3d4f5a6"
down_revision = "d6a1b2c3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_embeddings",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "source_type",
            sa.String(20),
            nullable=False,
            comment="Type of content that was embedded (text, pdf, image)",
        ),
        sa.Column(
            "source_entity",
            sa.String(100),
            nullable=False,
            comment="Entity table name, e.g. 'case_movements'",
        ),
        sa.Column(
            "source_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=False,
            index=True,
            comment="Primary key of the source entity row",
        ),
        sa.Column(
            "s3_key",
            sa.String(500),
            nullable=True,
            comment="S3 object key if embedding was generated from a file",
        ),
        sa.Column(
            "embedding",
            Vector(1536),
            nullable=False,
            comment="Gemini Embedding 2 vector (1536 dims — best MTEB quality within pgvector HNSW 2000-dim limit)",
        ),
        sa.Column(
            "model",
            sa.String(100),
            nullable=False,
            server_default="gemini-embedding-2-preview",
            comment="Embedding model used",
        ),
        sa.Column(
            "content_hash",
            sa.String(64),
            nullable=True,
            comment="SHA-256 of the embedded content for deduplication",
        ),
        sa.Column(
            "file_size_bytes",
            sa.Integer,
            nullable=True,
            comment="Size of the source file in bytes",
        ),
        sa.Column(
            "mime_type",
            sa.String(100),
            nullable=True,
            comment="MIME type of the embedded content",
        ),
        sa.Column(
            "excerpt",
            sa.Text,
            nullable=True,
            comment="Short text excerpt for display in search results",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Unique constraint on (source_type, source_id, s3_key)
    op.create_unique_constraint(
        "uq_document_embeddings_source",
        "document_embeddings",
        ["source_type", "source_id", "s3_key"],
    )

    # HNSW index for cosine similarity search (1536 dims < 2000 pgvector limit)
    op.execute(
        "CREATE INDEX ix_document_embeddings_embedding_hnsw "
        "ON document_embeddings "
        "USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_embeddings_embedding_hnsw")
    op.drop_constraint("uq_document_embeddings_source", "document_embeddings")
    op.drop_table("document_embeddings")
