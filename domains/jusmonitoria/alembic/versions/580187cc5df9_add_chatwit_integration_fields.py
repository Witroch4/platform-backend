"""add_chatwit_integration_fields

Revision ID: 580187cc5df9
Revises: 4344b68da6d3
Create Date: 2026-03-10 21:30:11.840873

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '580187cc5df9'
down_revision: Union[str, None] = '4344b68da6d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tenants',
        sa.Column(
            'chatwit_account_id',
            sa.Integer(),
            nullable=True,
            comment='Chatwit account_id for webhook routing',
        ),
    )
    op.create_index(
        op.f('ix_tenants_chatwit_account_id'),
        'tenants',
        ['chatwit_account_id'],
        unique=True,
    )

    op.add_column(
        'lancamentos',
        sa.Column(
            'chatwit_order_nsu',
            sa.String(length=100),
            nullable=True,
            comment='Chatwit/InfinitePay order NSU for idempotency',
        ),
    )
    op.add_column(
        'lancamentos',
        sa.Column(
            'receipt_url',
            sa.String(length=500),
            nullable=True,
            comment='Payment receipt URL from provider',
        ),
    )
    op.create_index(
        op.f('ix_lancamentos_chatwit_order_nsu'),
        'lancamentos',
        ['chatwit_order_nsu'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_lancamentos_chatwit_order_nsu'), table_name='lancamentos')
    op.drop_column('lancamentos', 'receipt_url')
    op.drop_column('lancamentos', 'chatwit_order_nsu')
    op.drop_index(op.f('ix_tenants_chatwit_account_id'), table_name='tenants')
    op.drop_column('tenants', 'chatwit_account_id')
