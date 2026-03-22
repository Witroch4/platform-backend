"""Add conteudo_html column to contratos table.

Revision ID: cc01_conteudo_html
Revises: m001a2b3c4d5
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "cc01_conteudo_html"
down_revision = "m001a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'contratos' AND column_name = 'conteudo_html'"
        )
    )
    if result.fetchone() is None:
        op.add_column(
            "contratos",
            sa.Column(
                "conteudo_html",
                sa.Text(),
                nullable=True,
                comment="Full contract body in HTML for rich text editing and PDF/DOCX export",
            ),
        )


def downgrade() -> None:
    op.drop_column("contratos", "conteudo_html")
