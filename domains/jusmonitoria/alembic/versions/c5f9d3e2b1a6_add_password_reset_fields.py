"""add password reset fields to users

Revision ID: c5f9d3e2b1a6
Revises: b4e8c2f1a3d5
Create Date: 2026-03-08 18:00:00.000000

Adds password_reset_token and password_reset_expires_at columns to users table
for the forgot-password / reset-password flow.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5f9d3e2b1a6'
down_revision: Union[str, None] = 'b4e8c2f1a3d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('password_reset_token', sa.String(255), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column(
            'password_reset_expires_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        'ix_users_password_reset_token',
        'users',
        ['password_reset_token'],
    )


def downgrade() -> None:
    op.drop_index('ix_users_password_reset_token', table_name='users')
    op.drop_column('users', 'password_reset_expires_at')
    op.drop_column('users', 'password_reset_token')
