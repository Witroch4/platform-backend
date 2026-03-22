"""add_coleta_completa_to_pje_jurisdicoes

Revision ID: 47d674130f54
Revises: cc01_conteudo_html
Create Date: 2026-03-16 07:47:55.227795

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '47d674130f54'
down_revision: Union[str, None] = 'cc01_conteudo_html'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'pje_jurisdicoes',
        sa.Column(
            'coleta_completa',
            sa.Boolean(),
            server_default='false',
            nullable=False,
            comment='True quando o scraper terminou este combo com sucesso (classes + metadados)',
        ),
    )


def downgrade() -> None:
    op.drop_column('pje_jurisdicoes', 'coleta_completa')
