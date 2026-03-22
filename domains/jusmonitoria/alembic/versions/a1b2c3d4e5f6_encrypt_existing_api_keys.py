"""encrypt_existing_api_keys

Revision ID: a1b2c3d4e5f6
Revises: 580187cc5df9
Create Date: 2026-03-10 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '580187cc5df9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Encrypt existing plaintext API keys in ai_providers table."""
    from domains.jusmonitoria.crypto import encrypt, decrypt

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, api_key_encrypted FROM ai_providers")
    ).fetchall()

    for row in rows:
        provider_id, key_value = row
        if not key_value:
            continue
        # Check if already encrypted (try to decrypt)
        try:
            decrypt(key_value)
            # Already encrypted, skip
            continue
        except Exception:
            pass
        # Plaintext key — encrypt it
        encrypted = encrypt(key_value)
        conn.execute(
            sa.text("UPDATE ai_providers SET api_key_encrypted = :enc WHERE id = :id"),
            {"enc": encrypted, "id": provider_id},
        )


def downgrade() -> None:
    """Decrypt API keys back to plaintext."""
    from domains.jusmonitoria.crypto import decrypt

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, api_key_encrypted FROM ai_providers")
    ).fetchall()

    for row in rows:
        provider_id, key_value = row
        if not key_value:
            continue
        try:
            plaintext = decrypt(key_value)
            conn.execute(
                sa.text("UPDATE ai_providers SET api_key_encrypted = :plain WHERE id = :id"),
                {"plain": plaintext, "id": provider_id},
            )
        except Exception:
            # Already plaintext
            pass
