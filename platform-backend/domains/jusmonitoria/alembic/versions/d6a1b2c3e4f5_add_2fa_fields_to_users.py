"""Add 2FA fields to users table.

Revision ID: d6a1b2c3e4f5
Revises: c5f9d3e2b1a6
Create Date: 2026-03-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d6a1b2c3e4f5"
down_revision: str = "c5f9d3e2b1a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("backup_codes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "backup_codes")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
