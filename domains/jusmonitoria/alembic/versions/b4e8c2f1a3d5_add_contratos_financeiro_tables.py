"""add_contratos_financeiro_tables

Revision ID: b4e8c2f1a3d5
Revises: a3f7b9c2d1e4
Create Date: 2026-03-08 10:00:00.000000

Creates contratos, faturas, lancamentos, and cobrancas tables for the
contracts management and financial module.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'b4e8c2f1a3d5'
down_revision: Union[str, None] = 'a3f7b9c2d1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- contratos ---
    op.create_table(
        'contratos',
        sa.Column('id', sa.Uuid(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('client_id', sa.Uuid(), nullable=False),
        sa.Column('assigned_to', sa.Uuid(), nullable=True),
        sa.Column('numero_contrato', sa.String(50), nullable=False),
        sa.Column('titulo', sa.String(500), nullable=False),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('tipo', sa.String(50), nullable=False, server_default='prestacao_servicos'),
        sa.Column('status', sa.String(50), nullable=False, server_default='rascunho'),
        sa.Column('valor_total', sa.Numeric(15, 2), nullable=True),
        sa.Column('valor_mensal', sa.Numeric(15, 2), nullable=True),
        sa.Column('valor_entrada', sa.Numeric(15, 2), nullable=True),
        sa.Column('percentual_exito', sa.Numeric(5, 2), nullable=True),
        sa.Column('indice_reajuste', sa.String(50), nullable=True),
        sa.Column('data_inicio', sa.Date(), nullable=True),
        sa.Column('data_vencimento', sa.Date(), nullable=True),
        sa.Column('data_assinatura', sa.Date(), nullable=True),
        sa.Column('dia_vencimento_fatura', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('dias_lembrete_antes', sa.Integer(), nullable=False, server_default='7'),
        sa.Column('dias_cobranca_apos', JSONB(), nullable=False, server_default='[1, 7, 15]'),
        sa.Column('clausulas', JSONB(), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('documento_url', sa.String(1000), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'numero_contrato', name='uq_contrato_numero_tenant'),
    )
    op.create_index('ix_contratos_tenant_id', 'contratos', ['tenant_id'])
    op.create_index('ix_contratos_client_id', 'contratos', ['client_id'])
    op.create_index('ix_contratos_assigned_to', 'contratos', ['assigned_to'])
    op.create_index('ix_contratos_tipo', 'contratos', ['tipo'])
    op.create_index('ix_contratos_status', 'contratos', ['status'])
    op.create_index('ix_contratos_data_vencimento', 'contratos', ['data_vencimento'])

    # --- faturas ---
    op.create_table(
        'faturas',
        sa.Column('id', sa.Uuid(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('contrato_id', sa.Uuid(), nullable=False),
        sa.Column('client_id', sa.Uuid(), nullable=False),
        sa.Column('numero', sa.String(50), nullable=False),
        sa.Column('referencia', sa.String(20), nullable=True),
        sa.Column('valor', sa.Numeric(15, 2), nullable=False),
        sa.Column('valor_pago', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('data_vencimento', sa.Date(), nullable=False),
        sa.Column('data_pagamento', sa.Date(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pendente'),
        sa.Column('forma_pagamento', sa.String(50), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('nosso_numero', sa.String(50), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_faturas_tenant_id', 'faturas', ['tenant_id'])
    op.create_index('ix_faturas_contrato_id', 'faturas', ['contrato_id'])
    op.create_index('ix_faturas_client_id', 'faturas', ['client_id'])
    op.create_index('ix_faturas_data_vencimento', 'faturas', ['data_vencimento'])
    op.create_index('ix_faturas_status', 'faturas', ['status'])

    # --- lancamentos ---
    op.create_table(
        'lancamentos',
        sa.Column('id', sa.Uuid(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('contrato_id', sa.Uuid(), nullable=True),
        sa.Column('fatura_id', sa.Uuid(), nullable=True),
        sa.Column('client_id', sa.Uuid(), nullable=True),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('categoria', sa.String(50), nullable=False, server_default='honorarios'),
        sa.Column('descricao', sa.String(500), nullable=False),
        sa.Column('valor', sa.Numeric(15, 2), nullable=False),
        sa.Column('data_lancamento', sa.Date(), nullable=False),
        sa.Column('data_competencia', sa.Date(), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['fatura_id'], ['faturas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lancamentos_tenant_id', 'lancamentos', ['tenant_id'])
    op.create_index('ix_lancamentos_contrato_id', 'lancamentos', ['contrato_id'])
    op.create_index('ix_lancamentos_fatura_id', 'lancamentos', ['fatura_id'])
    op.create_index('ix_lancamentos_client_id', 'lancamentos', ['client_id'])
    op.create_index('ix_lancamentos_tipo', 'lancamentos', ['tipo'])
    op.create_index('ix_lancamentos_data_lancamento', 'lancamentos', ['data_lancamento'])

    # --- cobrancas ---
    op.create_table(
        'cobrancas',
        sa.Column('id', sa.Uuid(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('contrato_id', sa.Uuid(), nullable=False),
        sa.Column('fatura_id', sa.Uuid(), nullable=True),
        sa.Column('client_id', sa.Uuid(), nullable=False),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('canal', sa.String(50), nullable=False, server_default='chatwit'),
        sa.Column('status', sa.String(50), nullable=False, server_default='pendente'),
        sa.Column('mensagem', sa.Text(), nullable=False),
        sa.Column('data_agendada', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_envio', sa.DateTime(timezone=True), nullable=True),
        sa.Column('chatwit_message_id', sa.String(100), nullable=True),
        sa.Column('tentativas', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('erro', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['fatura_id'], ['faturas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cobrancas_tenant_id', 'cobrancas', ['tenant_id'])
    op.create_index('ix_cobrancas_contrato_id', 'cobrancas', ['contrato_id'])
    op.create_index('ix_cobrancas_fatura_id', 'cobrancas', ['fatura_id'])
    op.create_index('ix_cobrancas_client_id', 'cobrancas', ['client_id'])
    op.create_index('ix_cobrancas_tipo', 'cobrancas', ['tipo'])
    op.create_index('ix_cobrancas_status', 'cobrancas', ['status'])
    op.create_index('ix_cobrancas_data_agendada', 'cobrancas', ['data_agendada'])

    # --- Insert default worker schedules ---
    op.execute("""
        INSERT INTO worker_schedules (id, task_name, cron_expression, description, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'check_vencimentos', '0 8 * * *', 'Verifica faturas vencidas e contratos expirando', true, NOW(), NOW()),
            (gen_random_uuid(), 'gerar_faturas_recorrentes', '0 6 1 * *', 'Gera faturas mensais recorrentes', true, NOW(), NOW()),
            (gen_random_uuid(), 'enviar_cobrancas_pendentes', '0 9 * * *', 'Envia cobrancas pendentes via Chatwit', true, NOW(), NOW())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_table('cobrancas')
    op.drop_table('lancamentos')
    op.drop_table('faturas')
    op.drop_table('contratos')

    op.execute("""
        DELETE FROM worker_schedules
        WHERE task_name IN ('check_vencimentos', 'gerar_faturas_recorrentes', 'enviar_cobrancas_pendentes');
    """)
