"""add_checkpoint_fields_to_pje_jurisdicoes

Revision ID: 9c1e2d3f4a5b
Revises: 47d674130f54
Create Date: 2026-03-16 09:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c1e2d3f4a5b"
down_revision: Union[str, None] = "47d674130f54"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pje_jurisdicoes",
        sa.Column(
            "status_coleta",
            sa.String(length=20),
            nullable=False,
            server_default="pendente",
            comment="Checkpoint do combo: pendente | fase1_ok | completo | erro",
        ),
    )
    op.add_column(
        "pje_jurisdicoes",
        sa.Column(
            "ultimo_erro",
            sa.Text(),
            nullable=True,
            comment="Último erro de coleta registrado para este combo",
        ),
    )

    op.execute(
        """
        UPDATE pje_jurisdicoes
        SET status_coleta = CASE
            WHEN coleta_completa = true THEN 'completo'
            WHEN classes IS NOT NULL AND jsonb_array_length(classes) > 0 THEN 'fase1_ok'
            ELSE 'pendente'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("pje_jurisdicoes", "ultimo_erro")
    op.drop_column("pje_jurisdicoes", "status_coleta")