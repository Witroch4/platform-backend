"""merge_heads_20260313

Revision ID: m001a2b3c4d5
Revises: a1b2c3d4e5f6, f1a2b3c4d5e6
Create Date: 2026-03-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm001a2b3c4d5'
down_revision: Union[str, None] = ('a1b2c3d4e5f6', 'f1a2b3c4d5e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
