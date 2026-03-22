"""add_nome_advogado_to_oab_sync_config

Revision ID: b1c2d3e4f5a6
Revises: a3f7b9c2d1e4
Create Date: 2026-03-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a3f7b9c2d1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'oab_sync_configs',
        sa.Column(
            'nome_advogado',
            sa.String(255),
            nullable=True,
            comment='Nome completo do advogado — usado como fallback quando OAB retorna 0 resultados',
        ),
    )


def downgrade() -> None:
    op.drop_column('oab_sync_configs', 'nome_advogado')
