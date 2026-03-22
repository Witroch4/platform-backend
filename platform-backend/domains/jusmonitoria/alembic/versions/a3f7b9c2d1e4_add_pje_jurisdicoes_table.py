"""add_pje_jurisdicoes_table

Revision ID: a3f7b9c2d1e4
Revises: 569d36915a33
Create Date: 2026-03-04 12:00:00.000000

Tabela de jurisdições (comarcas/seções) por tribunal PJe, organizadas por Matéria.
Coletadas automaticamente pelo scraper com sync incremental — só recoleta combos ausentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'a3f7b9c2d1e4'
down_revision: Union[str, None] = '569d36915a33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pje_jurisdicoes',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('tribunal', sa.String(20), nullable=False, comment='Código do tribunal: trf1, trf3, trf5, trf6, tjce …'),
        sa.Column('materia_value', sa.String(20), nullable=False, comment='Valor numérico da Matéria (TPU CNJ)'),
        sa.Column('materia_text', sa.Text(), nullable=False, comment='Texto descritivo da Matéria'),
        sa.Column('jurisdicao_value', sa.String(20), nullable=False, comment='Valor numérico da Jurisdição no PJe deste tribunal'),
        sa.Column('jurisdicao_text', sa.Text(), nullable=False, comment='Nome da Seção/Subseção judiciária'),
        sa.Column('classes', JSONB(), nullable=True, comment='Classes judiciais disponíveis: [{value, text}, …]'),
        sa.Column('coletado_em', sa.DateTime(timezone=True), nullable=True, comment='Quando este combo foi coletado pelo scraper'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'tribunal', 'materia_value', 'jurisdicao_value',
            name='uq_pje_jurisdicoes_tribunal_materia_jurisdicao',
        ),
    )
    op.create_index(op.f('ix_pje_jurisdicoes_tribunal'), 'pje_jurisdicoes', ['tribunal'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pje_jurisdicoes_tribunal'), table_name='pje_jurisdicoes')
    op.drop_table('pje_jurisdicoes')
