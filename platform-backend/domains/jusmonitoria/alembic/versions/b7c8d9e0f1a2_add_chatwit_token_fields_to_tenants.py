"""add chatwit token fields to tenants

Revision ID: b7c8d9e0f1a2
Revises: 9c1e2d3f4a5b
Create Date: 2026-03-17 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "9c1e2d3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "chatwit_access_token_encrypted",
            sa.String(500),
            nullable=True,
            comment="Fernet-encrypted Chatwit admin ACCESS_TOKEN",
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "chatwit_access_token_hash",
            sa.String(64),
            nullable=True,
            comment="SHA256 hash of ACCESS_TOKEN for O(1) tenant lookup",
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "chatwit_webhook_id",
            sa.Integer(),
            nullable=True,
            comment="ID of registered webhook in Chatwit for lifecycle management",
        ),
    )
    op.create_unique_constraint(
        "uq_tenants_chatwit_access_token_hash",
        "tenants",
        ["chatwit_access_token_hash"],
    )
    op.create_index(
        "ix_tenants_chatwit_access_token_hash",
        "tenants",
        ["chatwit_access_token_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenants_chatwit_access_token_hash", table_name="tenants")
    op.drop_constraint("uq_tenants_chatwit_access_token_hash", "tenants", type_="unique")
    op.drop_column("tenants", "chatwit_webhook_id")
    op.drop_column("tenants", "chatwit_access_token_hash")
    op.drop_column("tenants", "chatwit_access_token_encrypted")
