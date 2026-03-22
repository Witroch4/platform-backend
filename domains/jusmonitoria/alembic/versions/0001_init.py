"""init — schema completo consolidado

Revision ID: 0001_init
Revises:
Create Date: 2026-03-02

"""
from typing import Sequence, Union

import pgvector.sqlalchemy
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── extensões ────────────────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── tenants ──────────────────────────────────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("name", sa.String(255), nullable=False, comment="Law firm name"),
        sa.Column("slug", sa.String(100), nullable=False, comment="URL-friendly identifier"),
        sa.Column("plan", sa.String(50), nullable=False, comment="Subscription plan (basic, professional, enterprise)"),
        sa.Column("is_active", sa.Boolean(), nullable=False, comment="Whether tenant is active"),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False, comment="Tenant-specific settings"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tenants_is_active"), "tenants", ["is_active"], unique=False)
    op.create_index(op.f("ix_tenants_slug"), "tenants", ["slug"], unique=True)

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, comment="User email address (unique per tenant)"),
        sa.Column("password_hash", sa.String(255), nullable=False, comment="Bcrypt hashed password"),
        sa.Column("full_name", sa.String(255), nullable=False, comment="User full name"),
        sa.Column(
            "role",
            sa.String(11),
            nullable=False,
            comment="User role for RBAC",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, comment="Whether user account is active"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True, comment="Last login timestamp"),
        # perfil
        sa.Column("phone", sa.String(20), nullable=True, comment="User phone number"),
        sa.Column("avatar_url", sa.String(500), nullable=True, comment="URL to user avatar image"),
        sa.Column("oab_number", sa.String(20), nullable=True, comment="OAB registration number (digits only)"),
        sa.Column("oab_state", sa.String(2), nullable=True, comment="OAB state (2-letter code, e.g. SP, RJ)"),
        # verificação e-mail
        sa.Column("email_verified", sa.Boolean(), nullable=False, comment="Whether user has verified their email"),
        sa.Column("verification_token", sa.String(255), nullable=True, comment="Token for email verification"),
        # CPF
        sa.Column("cpf", sa.String(14), nullable=True, comment="User CPF (digits only, stored as 11 digits)"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT user_role "
        "CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'LAWYER', 'ASSISTANT', 'VIEWER'))"
    )
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    op.create_index(op.f("ix_users_tenant_id"), "users", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_users_verification_token"), "users", ["verification_token"], unique=False)

    # ── tags ──────────────────────────────────────────────────────────────────
    op.create_table(
        "tags",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False, comment="Tag name (unique per tenant)"),
        sa.Column("color", sa.String(7), nullable=False, comment="Hex color code for UI display"),
        sa.Column("category", sa.String(50), nullable=True, comment="Optional category for grouping tags"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tags_tenant_name"),
    )
    op.create_index(op.f("ix_tags_tenant_id"), "tags", ["tenant_id"], unique=False)

    # ── clients ───────────────────────────────────────────────────────────────
    op.create_table(
        "clients",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("assigned_to", sa.UUID(), nullable=True, comment="Lawyer responsible for this client"),
        sa.Column("lead_id", sa.UUID(), nullable=True, comment="Original lead if converted"),
        sa.Column("full_name", sa.String(255), nullable=False, comment="Client full name"),
        sa.Column("cpf_cnpj", sa.String(18), nullable=True, comment="CPF or CNPJ"),
        sa.Column("email", sa.String(255), nullable=True, comment="Email address"),
        sa.Column("phone", sa.String(20), nullable=True, comment="Phone number"),
        sa.Column("address", postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment="Address information"),
        sa.Column("chatwit_contact_id", sa.String(100), nullable=True, comment="Chatwit contact ID for messaging"),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "INACTIVE", "SUSPENDED", name="client_status", native_enum=False),
            nullable=False,
            comment="Client status",
        ),
        sa.Column("health_score", sa.Integer(), nullable=False, comment="Client health score (0-100)"),
        sa.Column("notes", sa.Text(), nullable=True, comment="Internal notes about client"),
        sa.Column("custom_fields", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False, comment="Custom fields for tenant-specific data"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clients_assigned_to"), "clients", ["assigned_to"], unique=False)
    op.create_index(op.f("ix_clients_chatwit_contact_id"), "clients", ["chatwit_contact_id"], unique=False)
    op.create_index(op.f("ix_clients_status"), "clients", ["status"], unique=False)
    op.create_index(op.f("ix_clients_tenant_id"), "clients", ["tenant_id"], unique=False)

    # ── leads ─────────────────────────────────────────────────────────────────
    op.create_table(
        "leads",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("assigned_to", sa.UUID(), nullable=True, comment="User responsible for this lead"),
        sa.Column("converted_to_client_id", sa.UUID(), nullable=True, comment="Client created from this lead"),
        sa.Column("full_name", sa.String(255), nullable=False, comment="Lead full name"),
        sa.Column("phone", sa.String(20), nullable=True, comment="Phone number"),
        sa.Column("email", sa.String(255), nullable=True, comment="Email address"),
        sa.Column(
            "source",
            sa.Enum("CHATWIT", "WEBSITE", "REFERRAL", "SOCIAL_MEDIA", "ADVERTISING", "OTHER", name="lead_source", native_enum=False),
            nullable=False,
            comment="Lead acquisition source",
        ),
        sa.Column("chatwit_contact_id", sa.String(100), nullable=True, comment="Chatwit contact ID for integration"),
        sa.Column(
            "stage",
            sa.Enum("NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CONVERTED", name="lead_stage", native_enum=False),
            nullable=False,
            comment="Current stage in sales funnel",
        ),
        sa.Column("score", sa.Integer(), nullable=False, comment="Lead quality score (0-100)"),
        sa.Column("ai_summary", sa.Text(), nullable=True, comment="AI-generated summary of lead qualification"),
        sa.Column("ai_recommended_action", sa.String(100), nullable=True, comment="AI-recommended next action"),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "CONVERTED", "LOST", "ARCHIVED", name="lead_status", native_enum=False),
            nullable=False,
            comment="Lead status",
        ),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True, comment="When lead was converted to client"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False, comment="Additional lead metadata"),
        sa.Column("instagram_username", sa.String(100), nullable=True, comment="Instagram username for DM leads"),
        sa.Column("instagram_profile_picture_url", sa.String(500), nullable=True, comment="Cached Instagram profile picture URL"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_leads_assigned_to"), "leads", ["assigned_to"], unique=False)
    op.create_index(op.f("ix_leads_chatwit_contact_id"), "leads", ["chatwit_contact_id"], unique=False)
    op.create_index(op.f("ix_leads_score"), "leads", ["score"], unique=False)
    op.create_index(op.f("ix_leads_source"), "leads", ["source"], unique=False)
    op.create_index(op.f("ix_leads_stage"), "leads", ["stage"], unique=False)
    op.create_index(op.f("ix_leads_status"), "leads", ["status"], unique=False)
    op.create_index(op.f("ix_leads_tenant_id"), "leads", ["tenant_id"], unique=False)

    # FKs cruzadas clients <-> leads
    op.create_foreign_key("fk_leads_converted_to_client", "leads", "clients", ["converted_to_client_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_clients_lead_id", "clients", "leads", ["lead_id"], ["id"], ondelete="SET NULL")

    # ── ai_conversations ──────────────────────────────────────────────────────
    op.create_table(
        "ai_conversations",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=True, comment="Client associated with conversation"),
        sa.Column("lead_id", sa.UUID(), nullable=True, comment="Lead associated with conversation"),
        sa.Column("conversation_type", sa.String(50), nullable=False, comment="Type of conversation"),
        sa.Column("agent_name", sa.String(50), nullable=False, comment="Name of AI agent"),
        sa.Column("messages", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False, comment="Array of conversation messages"),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment="Final result of conversation"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False, comment="Additional conversation metadata"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_conversations_client_id"), "ai_conversations", ["client_id"], unique=False)
    op.create_index(op.f("ix_ai_conversations_lead_id"), "ai_conversations", ["lead_id"], unique=False)
    op.create_index(op.f("ix_ai_conversations_tenant_id"), "ai_conversations", ["tenant_id"], unique=False)

    # ── ai_providers ──────────────────────────────────────────────────────────
    op.create_table(
        "ai_providers",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False, comment="Provider name (openai, anthropic, google, etc.)"),
        sa.Column("model", sa.String(100), nullable=False, comment="Model identifier"),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False, comment="Encrypted API key"),
        sa.Column("priority", sa.Integer(), nullable=False, comment="Priority for provider selection (higher = preferred)"),
        sa.Column("is_active", sa.Boolean(), nullable=False, comment="Whether provider is active"),
        sa.Column("max_tokens", sa.Integer(), nullable=True, comment="Maximum tokens per request"),
        sa.Column("temperature", sa.Numeric(precision=3, scale=2), nullable=False, comment="Temperature for generation"),
        sa.Column("usage_count", sa.Integer(), nullable=False, comment="Total number of requests made"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True, comment="Last time provider was used"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_providers_is_active"), "ai_providers", ["is_active"], unique=False)
    op.create_index(op.f("ix_ai_providers_priority"), "ai_providers", ["priority"], unique=False)
    op.create_index(op.f("ix_ai_providers_tenant_id"), "ai_providers", ["tenant_id"], unique=False)

    # ── automations ───────────────────────────────────────────────────────────
    op.create_table(
        "automations",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, comment="Automation name"),
        sa.Column("description", sa.Text(), nullable=True, comment="Automation description"),
        sa.Column("trigger_type", sa.String(100), nullable=False, comment="Event type that triggers this automation"),
        sa.Column("trigger_conditions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("actions", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, comment="Whether automation is enabled"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_automations_enabled"), "automations", ["enabled"], unique=False)
    op.create_index(op.f("ix_automations_tenant_id"), "automations", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_automations_trigger_type"), "automations", ["trigger_type"], unique=False)

    # ── briefings ─────────────────────────────────────────────────────────────
    op.create_table(
        "briefings",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("briefing_date", sa.Date(), nullable=False, comment="Date this briefing covers"),
        sa.Column("content", sa.Text(), nullable=False, comment="Full briefing content (markdown)"),
        sa.Column("urgent_items", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("attention_items", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("good_news_items", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("noise_items", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_briefings_briefing_date"), "briefings", ["briefing_date"], unique=False)
    op.create_index(op.f("ix_briefings_tenant_id"), "briefings", ["tenant_id"], unique=False)

    # ── client_automations ────────────────────────────────────────────────────
    op.create_table(
        "client_automations",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=False, comment="Client this automation config belongs to"),
        sa.Column("briefing_matinal", sa.Boolean(), nullable=False, comment="Enable daily morning briefing"),
        sa.Column("alertas_urgentes", sa.Boolean(), nullable=False, comment="Enable urgent alerts for critical movements"),
        sa.Column("resumo_semanal", sa.Boolean(), nullable=False, comment="Enable weekly summary report"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "client_id", name="uq_client_automations_tenant_client"),
    )
    op.create_index(op.f("ix_client_automations_client_id"), "client_automations", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_automations_tenant_id"), "client_automations", ["tenant_id"], unique=False)

    # ── events ────────────────────────────────────────────────────────────────
    op.create_table(
        "events",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False, comment="Type of event for routing"),
        sa.Column("entity_type", sa.String(50), nullable=False, comment="Type of entity that triggered event"),
        sa.Column("entity_id", sa.UUID(), nullable=False, comment="ID of entity that triggered event"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_events_entity_id"), "events", ["entity_id"], unique=False)
    op.create_index(op.f("ix_events_event_type"), "events", ["event_type"], unique=False)
    op.create_index(op.f("ix_events_tenant_id"), "events", ["tenant_id"], unique=False)

    # ── legal_cases ───────────────────────────────────────────────────────────
    op.create_table(
        "legal_cases",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=False, comment="Client associated with this case"),
        sa.Column("cnj_number", sa.String(25), nullable=False, comment="CNJ process number"),
        sa.Column("court", sa.String(255), nullable=True, comment="Court name"),
        sa.Column("case_type", sa.String(100), nullable=True, comment="Type of legal case"),
        sa.Column("subject", sa.String(255), nullable=True, comment="Case subject/matter"),
        sa.Column("status", sa.String(100), nullable=True, comment="Current case status"),
        sa.Column("plaintiff", sa.Text(), nullable=True, comment="Plaintiff(s) in the case"),
        sa.Column("defendant", sa.Text(), nullable=True, comment="Defendant(s) in the case"),
        sa.Column("filing_date", sa.Date(), nullable=True, comment="Date case was filed"),
        sa.Column("last_movement_date", sa.Date(), nullable=True, comment="Date of last movement"),
        sa.Column("next_deadline", sa.Date(), nullable=True, comment="Next important deadline"),
        sa.Column("monitoring_enabled", sa.Boolean(), nullable=False, comment="Whether to monitor this case"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True, comment="Last sync with DataJud"),
        sa.Column("sync_frequency_hours", sa.Integer(), nullable=False, comment="How often to sync (in hours)"),
        sa.Column("custom_fields", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "cnj_number", name="uq_legal_cases_tenant_cnj"),
    )
    op.create_index(op.f("ix_legal_cases_client_id"), "legal_cases", ["client_id"], unique=False)
    op.create_index(op.f("ix_legal_cases_last_movement_date"), "legal_cases", ["last_movement_date"], unique=False)
    op.create_index(op.f("ix_legal_cases_monitoring_enabled"), "legal_cases", ["monitoring_enabled"], unique=False)
    op.create_index(op.f("ix_legal_cases_next_deadline"), "legal_cases", ["next_deadline"], unique=False)
    op.create_index(op.f("ix_legal_cases_tenant_id"), "legal_cases", ["tenant_id"], unique=False)

    # ── audit_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True, comment="User who performed the action"),
        sa.Column("action", sa.String(100), nullable=False, comment="Action performed"),
        sa.Column("entity_type", sa.String(50), nullable=False, comment="Type of entity affected"),
        sa.Column("entity_id", sa.UUID(), nullable=False, comment="ID of entity affected"),
        sa.Column("old_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True, comment="IP address of request"),
        sa.Column("user_agent", sa.Text(), nullable=True, comment="User agent string"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_entity_id"), "audit_logs", ["entity_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_entity_type"), "audit_logs", ["entity_type"], unique=False)
    op.create_index(op.f("ix_audit_logs_tenant_id"), "audit_logs", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"], unique=False)

    # ── case_movements ────────────────────────────────────────────────────────
    op.create_table(
        "case_movements",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("legal_case_id", sa.UUID(), nullable=False, comment="Legal case this movement belongs to"),
        sa.Column("movement_date", sa.Date(), nullable=False, comment="Date of the movement"),
        sa.Column("movement_type", sa.String(255), nullable=True, comment="Type of movement"),
        sa.Column("description", sa.Text(), nullable=False, comment="Full description of the movement"),
        sa.Column("content_hash", sa.String(64), nullable=False, comment="SHA256 hash of content for deduplication"),
        sa.Column("is_important", sa.Boolean(), nullable=False, comment="Whether AI classified as important"),
        sa.Column("ai_summary", sa.Text(), nullable=True, comment="AI-generated summary"),
        sa.Column("requires_action", sa.Boolean(), nullable=False, comment="Whether movement requires action"),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(dim=1536), nullable=True, comment="Vector embedding for semantic search"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["legal_case_id"], ["legal_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "legal_case_id", "content_hash", name="uq_case_movements_tenant_case_hash"),
    )
    op.create_index(op.f("ix_case_movements_is_important"), "case_movements", ["is_important"], unique=False)
    op.create_index(op.f("ix_case_movements_legal_case_id"), "case_movements", ["legal_case_id"], unique=False)
    op.create_index(op.f("ix_case_movements_movement_date"), "case_movements", ["movement_date"], unique=False)
    op.create_index(op.f("ix_case_movements_requires_action"), "case_movements", ["requires_action"], unique=False)
    op.create_index(op.f("ix_case_movements_tenant_id"), "case_movements", ["tenant_id"], unique=False)

    # ── client_notes ──────────────────────────────────────────────────────────
    op.create_table(
        "client_notes",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=False, comment="Client this note belongs to"),
        sa.Column("author_id", sa.UUID(), nullable=False, comment="User who created this note"),
        sa.Column("content", sa.Text(), nullable=False, comment="Note content in markdown format"),
        sa.Column("mentions", postgresql.ARRAY(sa.String()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_notes_author_id"), "client_notes", ["author_id"], unique=False)
    op.create_index(op.f("ix_client_notes_client_id"), "client_notes", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_notes_tenant_id"), "client_notes", ["tenant_id"], unique=False)

    # ── client_tags ───────────────────────────────────────────────────────────
    op.create_table(
        "client_tags",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=False),
        sa.Column("tag_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "client_id", "tag_id", name="uq_client_tags_tenant_client_tag"),
    )
    op.create_index(op.f("ix_client_tags_client_id"), "client_tags", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_tags_tag_id"), "client_tags", ["tag_id"], unique=False)
    op.create_index(op.f("ix_client_tags_tenant_id"), "client_tags", ["tenant_id"], unique=False)

    # ── legal_case_tags ───────────────────────────────────────────────────────
    op.create_table(
        "legal_case_tags",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("legal_case_id", sa.UUID(), nullable=False),
        sa.Column("tag_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["legal_case_id"], ["legal_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "legal_case_id", "tag_id", name="uq_legal_case_tags_tenant_case_tag"),
    )
    op.create_index(op.f("ix_legal_case_tags_legal_case_id"), "legal_case_tags", ["legal_case_id"], unique=False)
    op.create_index(op.f("ix_legal_case_tags_tag_id"), "legal_case_tags", ["tag_id"], unique=False)
    op.create_index(op.f("ix_legal_case_tags_tenant_id"), "legal_case_tags", ["tenant_id"], unique=False)

    # ── notifications ─────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("URGENT_MOVEMENT", "QUALIFIED_LEAD", "BRIEFING_AVAILABLE", "MENTION", name="notification_type"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("read", sa.Boolean(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_created_at"), "notifications", ["created_at"], unique=False)
    op.create_index(op.f("ix_notifications_read"), "notifications", ["read"], unique=False)
    op.create_index(op.f("ix_notifications_tenant_id"), "notifications", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_notifications_type"), "notifications", ["type"], unique=False)
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)

    # ── timeline_events ───────────────────────────────────────────────────────
    op.create_table(
        "timeline_events",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True, comment="User who created this event"),
        sa.Column("entity_type", sa.String(50), nullable=False, comment="Type of entity (client, lead, legal_case, etc.)"),
        sa.Column("entity_id", sa.UUID(), nullable=False, comment="ID of the entity this event belongs to"),
        sa.Column("event_type", sa.String(100), nullable=False, comment="Type of event"),
        sa.Column("title", sa.String(255), nullable=False, comment="Event title"),
        sa.Column("description", sa.Text(), nullable=True, comment="Detailed event description"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("source", sa.String(50), nullable=False, comment="Event source (system, user, chatwit, datajud, ai)"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_timeline_events_entity_id"), "timeline_events", ["entity_id"], unique=False)
    op.create_index(op.f("ix_timeline_events_entity_type"), "timeline_events", ["entity_type"], unique=False)
    op.create_index(op.f("ix_timeline_events_event_type"), "timeline_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_timeline_events_tenant_id"), "timeline_events", ["tenant_id"], unique=False)

    # ── user_preferences ──────────────────────────────────────────────────────
    op.create_table(
        "user_preferences",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False, comment="User who owns this preference"),
        sa.Column("preference_key", sa.String(100), nullable=False),
        sa.Column("preference_value", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "user_id", "preference_key", name="uq_user_preferences_tenant_user_key"),
    )
    op.create_index(op.f("ix_user_preferences_tenant_id"), "user_preferences", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_user_preferences_user_id"), "user_preferences", ["user_id"], unique=False)

    # ── timeline_embeddings ───────────────────────────────────────────────────
    op.create_table(
        "timeline_embeddings",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("timeline_event_id", sa.UUID(), nullable=False, comment="Timeline event this embedding belongs to"),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(dim=1536), nullable=False, comment="Vector embedding for semantic search"),
        sa.Column("model", sa.String(100), nullable=False, comment="Embedding model used"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["timeline_event_id"], ["timeline_events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("timeline_event_id", name="uq_timeline_embeddings_event"),
    )
    op.create_index(op.f("ix_timeline_embeddings_tenant_id"), "timeline_embeddings", ["tenant_id"], unique=False)

    # ── agent_execution_logs ──────────────────────────────────────────────────
    op.create_table(
        "agent_execution_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True, comment="Tenant that triggered the execution"),
        sa.Column("agent_name", sa.String(100), nullable=False, comment="Agent name: triagem, investigador, redator, maestro"),
        sa.Column("status", sa.String(20), nullable=False, comment="Execution status: running, success, error"),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer(), nullable=False),
        sa.Column("provider_used", sa.String(50), nullable=False, comment="LLM provider: openai, anthropic, google"),
        sa.Column("model_used", sa.String(100), nullable=False, comment="Model identifier used"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, comment="Execution duration in milliseconds"),
        sa.Column("error_message", sa.Text(), nullable=True, comment="Error message if execution failed"),
        sa.Column("context", postgresql.JSONB(), nullable=True, comment="Additional execution metadata"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_execution_logs_tenant_id"), "agent_execution_logs", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_agent_execution_logs_agent_name"), "agent_execution_logs", ["agent_name"], unique=False)
    op.create_index(op.f("ix_agent_execution_logs_status"), "agent_execution_logs", ["status"], unique=False)
    op.create_index(op.f("ix_agent_execution_logs_provider_used"), "agent_execution_logs", ["provider_used"], unique=False)

    # ── worker_schedules ──────────────────────────────────────────────────────
    op.create_table(
        "worker_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_name", sa.String(100), nullable=False, comment="Unique task identifier: datajud_poller, morning_briefing, etc"),
        sa.Column("cron_expression", sa.String(100), nullable=False, comment="Cron expression: '0 */6 * * *'"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb"), comment="Task-specific configuration parameters"),
        sa.Column("description", sa.Text(), nullable=False, comment="Human-readable description of the task"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_name"),
    )
    op.create_index(op.f("ix_worker_schedules_is_active"), "worker_schedules", ["is_active"], unique=False)

    # ── certificados_digitais ─────────────────────────────────────────────────
    op.create_table(
        "certificados_digitais",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False, comment="Friendly name (e.g. Certificado Dra. Maria)"),
        sa.Column("titular_nome", sa.String(255), nullable=False, comment="Certificate subject CN"),
        sa.Column("titular_cpf_cnpj", sa.String(18), nullable=False, comment="CPF or CNPJ extracted from certificate"),
        sa.Column("emissora", sa.String(255), nullable=False, comment="Certificate issuer CN (e.g. AC SERASA RFB v5)"),
        sa.Column("serial_number", sa.String(100), nullable=False, comment="Certificate serial number (hex)"),
        sa.Column("valido_de", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valido_ate", sa.DateTime(timezone=True), nullable=False),
        sa.Column("pfx_encrypted", sa.LargeBinary(), nullable=False, comment="Fernet-encrypted PFX/P12 binary"),
        sa.Column("pfx_password_encrypted", sa.LargeBinary(), nullable=False, comment="Fernet-encrypted PFX password"),
        sa.Column("ultimo_teste_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_teste_resultado", sa.String(20), nullable=True, comment="sucesso | falha"),
        sa.Column("ultimo_teste_mensagem", sa.Text(), nullable=True),
        sa.Column("revogado", sa.Boolean(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "serial_number", name="uq_cert_tenant_serial"),
    )
    op.create_index(op.f("ix_certificados_digitais_tenant_id"), "certificados_digitais", ["tenant_id"], unique=False)

    # ── peticoes ──────────────────────────────────────────────────────────────
    op.create_table(
        "peticoes",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("criado_por", sa.UUID(), nullable=True),
        sa.Column("certificado_id", sa.UUID(), nullable=True),
        sa.Column("processo_numero", sa.String(50), nullable=False, comment="Número CNJ (20 dígitos) ou formatado com pontos"),
        sa.Column("tribunal_id", sa.String(20), nullable=False, comment="ID do tribunal (e.g. TRF5-JFCE)"),
        sa.Column(
            "tipo_peticao",
            sa.Enum("PETICAO_INICIAL", "CONTESTACAO", "RECURSO_APELACAO", "AGRAVO_INSTRUMENTO",
                    "EMBARGOS_DECLARACAO", "HABEAS_CORPUS", "MANDADO_SEGURANCA", "MANIFESTACAO", "OUTRO",
                    name="tipo_peticao_enum", native_enum=False),
            nullable=False,
        ),
        sa.Column("assunto", sa.String(500), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("RASCUNHO", "VALIDANDO", "ASSINANDO", "PROTOCOLANDO", "PROTOCOLADA", "ACEITA", "REJEITADA",
                    name="peticao_status_enum", native_enum=False),
            nullable=False,
        ),
        sa.Column("numero_protocolo", sa.String(100), nullable=True),
        sa.Column("protocolado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("protocolo_recibo", sa.Text(), nullable=True, comment="Recibo base64 retornado pelo tribunal"),
        sa.Column("motivo_rejeicao", sa.Text(), nullable=True),
        sa.Column("analise_ia", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("dados_basicos_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True,
                  comment="Estrutura MNI 2.2.2: polos, orgaoJulgador, assuntos, classeProcessual, etc."),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["criado_por"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["certificado_id"], ["certificados_digitais.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_peticoes_tenant_id", "peticoes", ["tenant_id"])
    op.create_index("ix_peticoes_processo_numero", "peticoes", ["processo_numero"])
    op.create_index("ix_peticoes_tribunal_id", "peticoes", ["tribunal_id"])
    op.create_index("ix_peticoes_status", "peticoes", ["status"])
    op.create_index("ix_peticoes_criado_por", "peticoes", ["criado_por"])
    op.create_index(op.f("ix_peticoes_certificado_id"), "peticoes", ["certificado_id"])

    # ── peticao_documentos ────────────────────────────────────────────────────
    op.create_table(
        "peticao_documentos",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("peticao_id", sa.UUID(), nullable=False),
        sa.Column("nome_original", sa.String(500), nullable=False),
        sa.Column("tamanho_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "tipo_documento",
            sa.Enum("PETICAO_PRINCIPAL", "PROCURACAO", "ANEXO", "COMPROVANTE",
                    name="tipo_documento_enum", native_enum=False),
            nullable=False,
        ),
        sa.Column("ordem", sa.Integer(), nullable=False),
        sa.Column("conteudo_encrypted", sa.LargeBinary(), nullable=False, comment="Fernet-encrypted PDF bytes"),
        sa.Column("hash_sha256", sa.String(64), nullable=False, comment="SHA-256 hash of original PDF bytes"),
        sa.Column(
            "status",
            sa.Enum("UPLOADING", "UPLOADED", "ERROR", "VALIDADO",
                    name="documento_status_enum", native_enum=False),
            nullable=False,
        ),
        sa.Column("erro_validacao", sa.Text(), nullable=True),
        sa.Column("sigiloso", sa.Boolean(), nullable=False, server_default=sa.text("false"),
                  comment="Documento marcado como sigiloso pelo usuário"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["peticao_id"], ["peticoes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_peticao_documentos_tenant_id", "peticao_documentos", ["tenant_id"])
    op.create_index("ix_peticao_documentos_peticao_id", "peticao_documentos", ["peticao_id"])

    # ── peticao_eventos ───────────────────────────────────────────────────────
    op.create_table(
        "peticao_eventos",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("peticao_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("RASCUNHO", "VALIDANDO", "ASSINANDO", "PROTOCOLANDO", "PROTOCOLADA", "ACEITA", "REJEITADA",
                    name="peticao_status_enum", native_enum=False),
            nullable=False,
        ),
        sa.Column("descricao", sa.String(500), nullable=False),
        sa.Column("detalhes", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["peticao_id"], ["peticoes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_peticao_eventos_tenant_id", "peticao_eventos", ["tenant_id"])
    op.create_index("ix_peticao_eventos_peticao_id", "peticao_eventos", ["peticao_id"])

    # ── tpu_assuntos ──────────────────────────────────────────────────────────
    op.create_table(
        "tpu_assuntos",
        sa.Column("codigo", sa.Integer(), nullable=False, comment="Código do assunto no CNJ (cod_item)"),
        sa.Column("nome", sa.Text(), nullable=False, comment="Nome ou descrição do assunto"),
        sa.Column("cod_item_pai", sa.Integer(), nullable=True),
        sa.Column("glossario", sa.Text(), nullable=True),
        sa.Column("artigo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["cod_item_pai"], ["tpu_assuntos.codigo"]),
        sa.PrimaryKeyConstraint("codigo"),
    )
    op.create_index(op.f("ix_tpu_assuntos_cod_item_pai"), "tpu_assuntos", ["cod_item_pai"], unique=False)
    op.create_index(op.f("ix_tpu_assuntos_codigo"), "tpu_assuntos", ["codigo"], unique=False)
    op.create_index(op.f("ix_tpu_assuntos_nome"), "tpu_assuntos", ["nome"], unique=False)

    # ── tpu_classes ───────────────────────────────────────────────────────────
    op.create_table(
        "tpu_classes",
        sa.Column("codigo", sa.Integer(), nullable=False, comment="Código da classe no CNJ"),
        sa.Column("nome", sa.Text(), nullable=False, comment="Nome ou descrição da classe"),
        sa.Column("sigla", sa.Text(), nullable=True),
        sa.Column("cod_item_pai", sa.Integer(), nullable=True),
        sa.Column("glossario", sa.Text(), nullable=True),
        sa.Column("natureza", sa.Text(), nullable=True),
        sa.Column("polo_ativo", sa.Text(), nullable=True),
        sa.Column("polo_passivo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["cod_item_pai"], ["tpu_classes.codigo"]),
        sa.PrimaryKeyConstraint("codigo"),
    )
    op.create_index(op.f("ix_tpu_classes_cod_item_pai"), "tpu_classes", ["cod_item_pai"], unique=False)
    op.create_index(op.f("ix_tpu_classes_codigo"), "tpu_classes", ["codigo"], unique=False)
    op.create_index(op.f("ix_tpu_classes_nome"), "tpu_classes", ["nome"], unique=False)

    # ── processos_monitorados ─────────────────────────────────────────────────
    op.create_table(
        "processos_monitorados",
        sa.Column("criado_por", sa.UUID(), nullable=True),
        sa.Column("peticao_id", sa.UUID(), nullable=True, comment="Petição de origem (se criado automaticamente após protocolar)"),
        sa.Column("numero", sa.String(25), nullable=False, comment="Número do processo (20 dígitos puros)"),
        sa.Column("apelido", sa.String(200), nullable=True, comment="Apelido/descrição curta para identificação rápida"),
        sa.Column("dados_datajud", postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment="Resultado completo da última consulta DataJud"),
        sa.Column("ultima_consulta", sa.DateTime(timezone=True), nullable=True, comment="Data/hora da última consulta DataJud"),
        sa.Column("movimentacoes_conhecidas", sa.Integer(), nullable=False, comment="Total de movimentações na última consulta"),
        sa.Column("novas_movimentacoes", sa.Integer(), nullable=False, comment="Movimentações novas desde última visualização"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["criado_por"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["peticao_id"], ["peticoes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "numero", name="uq_processos_monitorados_tenant_numero"),
    )
    op.create_index(op.f("ix_processos_monitorados_criado_por"), "processos_monitorados", ["criado_por"], unique=False)
    op.create_index(op.f("ix_processos_monitorados_numero"), "processos_monitorados", ["numero"], unique=False)
    op.create_index(op.f("ix_processos_monitorados_peticao_id"), "processos_monitorados", ["peticao_id"], unique=False)
    op.create_index(op.f("ix_processos_monitorados_tenant_id"), "processos_monitorados", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_table("processos_monitorados")
    op.drop_table("tpu_classes")
    op.drop_table("tpu_assuntos")
    op.drop_table("peticao_eventos")
    op.drop_table("peticao_documentos")
    op.drop_table("peticoes")
    op.drop_table("certificados_digitais")
    op.drop_table("worker_schedules")
    op.drop_table("agent_execution_logs")
    op.drop_table("timeline_embeddings")
    op.drop_table("user_preferences")
    op.drop_table("timeline_events")
    op.drop_table("notifications")
    op.drop_table("legal_case_tags")
    op.drop_table("client_tags")
    op.drop_table("client_notes")
    op.drop_table("case_movements")
    op.drop_table("audit_logs")
    op.drop_table("legal_cases")
    op.drop_table("events")
    op.drop_table("client_automations")
    op.drop_table("briefings")
    op.drop_table("automations")
    op.drop_table("ai_providers")
    op.drop_table("ai_conversations")
    op.drop_foreign_key("fk_leads_converted_to_client", "leads", source_schema=None)
    op.drop_foreign_key("fk_clients_lead_id", "clients", source_schema=None)
    op.drop_table("leads")
    op.drop_table("clients")
    op.drop_table("tags")
    op.drop_table("users")
    op.drop_table("tenants")
    op.execute("DROP EXTENSION IF EXISTS vector")
