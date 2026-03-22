"""add_user_oabs_table — múltiplas OABs por advogado

Cria a tabela `user_oabs` que permite registrar múltiplas inscrições OAB
por advogado (ex: OAB/SP, OAB/RJ, OAB/DF).

Migração de dados: copia `users.oab_number` + `users.oab_state` → `user_oabs`
com `is_primary=true` para todos os usuários existentes que possuem OAB preenchida.

Revision ID: f1a2b3c4d5e6
Revises: e7b2c3d4f5a6
Create Date: 2026-03-12 20:00:00.000000

"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e7b2c3d4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Criar tabela user_oabs
    op.create_table(
        "user_oabs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid4),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("oab_numero", sa.String(20), nullable=False),
        sa.Column("oab_uf", sa.String(2), nullable=False),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("nome_advogado", sa.String(255), nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenant_id", "oab_numero", "oab_uf",
            name="uq_user_oabs_tenant_oab",
        ),
    )

    # Índices para queries comuns
    op.create_index("ix_user_oabs_tenant_id", "user_oabs", ["tenant_id"])
    op.create_index("ix_user_oabs_user_id", "user_oabs", ["user_id"])
    op.create_index("ix_user_oabs_oab_numero", "user_oabs", ["oab_numero"])

    # 2. Migrar dados existentes: users.oab_number + users.oab_state → user_oabs
    op.execute("""
        INSERT INTO user_oabs (id, tenant_id, user_id, oab_numero, oab_uf, is_primary, ativo, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            tenant_id,
            id,
            oab_number,
            oab_state,
            true,
            true,
            now(),
            now()
        FROM users
        WHERE oab_number IS NOT NULL
          AND oab_state IS NOT NULL
          AND oab_number != ''
          AND oab_state != ''
        ON CONFLICT (tenant_id, oab_numero, oab_uf) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index("ix_user_oabs_oab_numero", table_name="user_oabs")
    op.drop_index("ix_user_oabs_user_id", table_name="user_oabs")
    op.drop_index("ix_user_oabs_tenant_id", table_name="user_oabs")
    op.drop_table("user_oabs")
