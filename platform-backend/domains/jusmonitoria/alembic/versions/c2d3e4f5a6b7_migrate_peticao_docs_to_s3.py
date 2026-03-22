"""migrate_peticao_docs_to_s3

Replace conteudo_encrypted BYTEA column with s3_key VARCHAR in peticao_documentos.
Existing encrypted PDFs must be migrated to S3 before dropping the old column.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-03-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Add s3_key column (nullable at first for existing rows)
    op.add_column(
        'peticao_documentos',
        sa.Column('s3_key', sa.String(1000), nullable=True,
                  comment='S3 object key (e.g. peticoes/{tenant}/{peticao}/{uuid}.pdf)'),
    )

    # Step 2: Migrate existing encrypted data to S3
    # This runs a data migration: decrypt each row and upload to S3
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, tenant_id, peticao_id, nome_original, conteudo_encrypted "
            "FROM peticao_documentos WHERE s3_key IS NULL AND conteudo_encrypted IS NOT NULL"
        )
    ).fetchall()

    if rows:
        import uuid as _uuid
        from domains.jusmonitoria.services.certificados.crypto import CertificateCryptoService
        from domains.jusmonitoria.services.storage import upload_bytes_to_s3
        from platform_core.config import settings

        crypto = CertificateCryptoService(settings.encrypt_key)

        for row in rows:
            doc_id, tenant_id, peticao_id, nome_original, encrypted = row
            try:
                pdf_bytes = crypto.decrypt(encrypted)
                file_id = _uuid.uuid4().hex
                s3_key = f"peticoes/{tenant_id}/{peticao_id}/{file_id}.pdf"
                upload_bytes_to_s3(s3_key, pdf_bytes)
                conn.execute(
                    sa.text("UPDATE peticao_documentos SET s3_key = :key WHERE id = :id"),
                    {"key": s3_key, "id": doc_id},
                )
            except Exception as e:
                print(f"WARNING: Failed to migrate doc {doc_id}: {e}")

    # Step 3: Make s3_key NOT NULL (all rows should have it now)
    op.alter_column('peticao_documentos', 's3_key', nullable=False,
                    existing_type=sa.String(1000))

    # Step 4: Drop the old encrypted column
    op.drop_column('peticao_documentos', 'conteudo_encrypted')


def downgrade() -> None:
    # Re-add conteudo_encrypted column (data will be lost — must re-upload)
    op.add_column(
        'peticao_documentos',
        sa.Column('conteudo_encrypted', sa.LargeBinary, nullable=True,
                  comment='Fernet-encrypted PDF bytes'),
    )
    op.drop_column('peticao_documentos', 's3_key')
