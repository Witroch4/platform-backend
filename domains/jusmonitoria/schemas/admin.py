"""Pydantic schemas for super admin endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ─── Tenant Schemas ───────────────────────────────────────────────

class TenantCreate(BaseModel):
    """Create a new tenant."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    plan: str = Field(default="basic", description="basic, professional, enterprise")
    settings: dict = Field(default_factory=dict)


class TenantUpdate(BaseModel):
    """Update a tenant."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    plan: Optional[str] = None
    settings: Optional[dict] = None


class TenantStatusUpdate(BaseModel):
    """Activate/deactivate a tenant."""

    is_active: bool


class TenantResponse(BaseModel):
    """Tenant info in responses."""

    id: UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    settings: dict
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TenantStatsResponse(BaseModel):
    """Tenant with entity counts."""

    id: UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: datetime
    users_count: int = 0
    leads_count: int = 0
    clients_count: int = 0
    cases_count: int = 0


class TenantListResponse(BaseModel):
    """Paginated list of tenants."""

    items: list[TenantResponse]
    total: int
    skip: int
    limit: int


# ─── User Schemas (Admin) ────────────────────────────────────────

class AdminUserCreate(BaseModel):
    """Create a user in any tenant."""

    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="lawyer", description="admin, lawyer, assistant, viewer")
    tenant_id: UUID
    is_active: bool = True


class AdminUserUpdate(BaseModel):
    """Update a user."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[str] = None
    is_active: Optional[bool] = None
    tenant_id: Optional[UUID] = None


class AdminUserResponse(BaseModel):
    """User info for admin views."""

    id: UUID
    email: str
    full_name: str
    role: str
    tenant_id: UUID
    tenant_name: Optional[str] = None
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserListResponse(BaseModel):
    """Paginated list of users."""

    items: list[AdminUserResponse]
    total: int
    skip: int
    limit: int


class ResetPasswordRequest(BaseModel):
    """Reset user password."""

    new_password: str = Field(..., min_length=8)


# ─── Agent Monitoring Schemas ─────────────────────────────────────

class AgentExecutionLogResponse(BaseModel):
    """Agent execution log entry."""

    id: UUID
    tenant_id: Optional[UUID] = None
    agent_name: str
    status: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider_used: str
    model_used: str
    duration_ms: int
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AgentStatsResponse(BaseModel):
    """Aggregated agent statistics."""

    total_executions: int
    total_tokens: int
    total_errors: int
    avg_duration_ms: float
    by_agent: dict[str, dict]  # agent_name -> {executions, tokens, errors, avg_duration}
    by_provider: dict[str, dict]  # provider -> {executions, tokens, errors}


class AgentLogListResponse(BaseModel):
    """Paginated list of agent logs."""

    items: list[AgentExecutionLogResponse]
    total: int
    skip: int
    limit: int


class ProviderResponse(BaseModel):
    """AI provider info for admin views."""

    id: UUID
    tenant_id: UUID
    tenant_name: Optional[str] = None
    provider: str
    model: str
    priority: int
    is_active: bool
    usage_count: int
    last_used_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProviderCreateRequest(BaseModel):
    """Create a new AI provider for a tenant."""

    tenant_id: UUID
    provider: str  # openai | google | anthropic
    model: str
    api_key: str
    priority: int = 0
    max_tokens: Optional[int] = None
    temperature: float = 0.7


class ProviderUpdateRequest(BaseModel):
    """Update a provider."""

    priority: Optional[int] = None
    is_active: Optional[bool] = None
    model: Optional[str] = None


# ─── Worker Schedule Schemas ──────────────────────────────────────

class WorkerScheduleResponse(BaseModel):
    """Worker schedule info."""

    id: UUID
    task_name: str
    cron_expression: str
    is_active: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    config: dict
    description: str
    created_at: datetime

    class Config:
        from_attributes = True


class WorkerScheduleUpdate(BaseModel):
    """Update a worker schedule."""

    cron_expression: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[dict] = None
    description: Optional[str] = None


class WorkerScheduleToggle(BaseModel):
    """Toggle worker schedule active state."""

    is_active: bool


class DLQEventResponse(BaseModel):
    """Dead Letter Queue event."""

    event_id: str
    event_type: str
    tenant_id: Optional[str] = None
    timestamp: str
    error_message: Optional[str] = None
    retry_count: int = 0
    data: dict = Field(default_factory=dict)


# ─── Dashboard Schemas ────────────────────────────────────────────

class PlatformOverviewResponse(BaseModel):
    """Global platform overview."""

    total_tenants: int
    active_tenants: int
    total_users: int
    active_users: int
    total_leads: int
    total_clients: int
    total_cases: int
    total_ai_executions: int
    total_tokens_used: int


class AIUsageResponse(BaseModel):
    """AI usage statistics."""

    total_tokens: int
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_executions: int
    total_errors: int
    estimated_cost_usd: float = 0.0
    by_day: list[dict]  # [{date, tokens, input_tokens, output_tokens, executions, errors}]
    by_provider: dict[str, dict]
    by_agent: dict[str, dict]


class TenantHealthResponse(BaseModel):
    """Health status per tenant."""

    tenant_id: UUID
    tenant_name: str
    is_active: bool
    users_count: int
    active_leads: int
    active_clients: int
    active_cases: int
    last_activity_at: Optional[datetime] = None
    ai_executions_30d: int = 0
    errors_30d: int = 0


class AuditLogAdminResponse(BaseModel):
    """Audit log entry for admin views."""

    id: UUID
    tenant_id: UUID
    tenant_name: Optional[str] = None
    user_id: Optional[UUID] = None
    user_email: Optional[str] = None
    action: str
    entity_type: str
    entity_id: UUID
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated list of audit logs."""

    items: list[AuditLogAdminResponse]
    total: int
    skip: int
    limit: int
