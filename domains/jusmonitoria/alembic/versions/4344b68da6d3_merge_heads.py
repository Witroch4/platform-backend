"""merge_heads

Revision ID: 4344b68da6d3
Revises: c2d3e4f5a6b7, d6a1b2c3e4f5
Create Date: 2026-03-09 14:59:18.970788

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4344b68da6d3'
down_revision: Union[str, None] = ('c2d3e4f5a6b7', 'd6a1b2c3e4f5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
