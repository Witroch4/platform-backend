"""Super Admin endpoints for platform management."""

import logging
from datetime import datetime, timedelta
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import SuperAdminUser, get_current_user
from domains.jusmonitoria.auth.password import hash_password
from domains.jusmonitoria.crypto import encrypt
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.audit_log import AuditLog
from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.lead import Lead
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.tenant import Tenant
from domains.jusmonitoria.db.models.user import User, UserRole
from domains.jusmonitoria.db.models.ai_provider import AIProvider
from domains.jusmonitoria.schemas.admin import (
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserResponse,
    AdminUserUpdate,
    AgentExecutionLogResponse,
    AgentLogListResponse,
    AgentStatsResponse,
    AuditLogAdminResponse,
    AuditLogListResponse,
    DLQEventResponse,
    AIUsageResponse,
    PlatformOverviewResponse,
    ProviderCreateRequest,
    ProviderResponse,
    ProviderUpdateRequest,
    ResetPasswordRequest,
    TenantCreate,
    TenantHealthResponse,
    TenantListResponse,
    TenantResponse,
    TenantStatsResponse,
    TenantStatusUpdate,
    TenantUpdate,
    WorkerScheduleResponse,
    WorkerScheduleToggle,
    WorkerScheduleUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ═══════════════════════════════════════════════════════════════════
# TENANT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


@router.get("/tenants", response_model=TenantListResponse)
async def list_tenants(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
):
    """List all tenants with pagination."""
    query = select(Tenant)

    if is_active is not None:
        query = query.where(Tenant.is_active == is_active)
    if search:
        query = query.where(
            Tenant.name.ilike(f"%{search}%") | Tenant.slug.ilike(f"%{search}%")
        )

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()

    # Fetch
    query = query.order_by(desc(Tenant.created_at)).offset(skip).limit(limit)
    result = await session.execute(query)
    tenants = result.scalars().all()

    return TenantListResponse(
        items=[TenantResponse.model_validate(t) for t in tenants],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    data: TenantCreate,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Create a new tenant."""
    # Check slug uniqueness
    existing = await session.execute(select(Tenant).where(Tenant.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Slug '{data.slug}' already exists")

    tenant = Tenant(
        name=data.name,
        slug=data.slug,
        plan=data.plan,
        settings=data.settings,
    )
    session.add(tenant)
    await session.flush()
    await session.refresh(tenant)
    await session.commit()

    logger.info("tenant_created", extra={"tenant_id": str(tenant.id), "slug": data.slug})
    return TenantResponse.model_validate(tenant)


@router.get("/tenants/{tenant_id}", response_model=TenantStatsResponse)
async def get_tenant_detail(
    tenant_id: UUID,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Get tenant detail with entity counts."""
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Count entities
    users_count = (await session.execute(
        select(func.count()).where(User.tenant_id == tenant_id)
    )).scalar_one()
    leads_count = (await session.execute(
        select(func.count()).where(Lead.tenant_id == tenant_id)
    )).scalar_one()
    clients_count = (await session.execute(
        select(func.count()).where(Client.tenant_id == tenant_id)
    )).scalar_one()
    cases_count = (await session.execute(
        select(func.count()).where(LegalCase.tenant_id == tenant_id)
    )).scalar_one()

    return TenantStatsResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
        users_count=users_count,
        leads_count=leads_count,
        clients_count=clients_count,
        cases_count=cases_count,
    )


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    data: TenantUpdate,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Update a tenant."""
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tenant, key, value)

    await session.flush()
    await session.refresh(tenant)
    await session.commit()

    return TenantResponse.model_validate(tenant)


@router.patch("/tenants/{tenant_id}/status", response_model=TenantResponse)
async def update_tenant_status(
    tenant_id: UUID,
    data: TenantStatusUpdate,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Activate or deactivate a tenant."""
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Prevent deactivating _platform tenant
    if tenant.slug == "_platform" and not data.is_active:
        raise HTTPException(status_code=400, detail="Cannot deactivate platform tenant")

    tenant.is_active = data.is_active
    await session.flush()
    await session.refresh(tenant)
    await session.commit()

    action = "activated" if data.is_active else "deactivated"
    logger.info(f"tenant_{action}", extra={"tenant_id": str(tenant_id)})
    return TenantResponse.model_validate(tenant)


# ═══════════════════════════════════════════════════════════════════
# USER MANAGEMENT (CROSS-TENANT)
# ═══════════════════════════════════════════════════════════════════


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tenant_id: Optional[UUID] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
):
    """List users across all tenants."""
    query = select(User).join(Tenant, User.tenant_id == Tenant.id)

    if tenant_id:
        query = query.where(User.tenant_id == tenant_id)
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()

    query = query.order_by(desc(User.created_at)).offset(skip).limit(limit)
    result = await session.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        tenant_name = u.tenant.name if u.tenant else None
        items.append(AdminUserResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            tenant_id=u.tenant_id,
            tenant_name=tenant_name,
            is_active=u.is_active,
            last_login_at=u.last_login_at,
            created_at=u.created_at,
        ))

    return AdminUserListResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: AdminUserCreate,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Create a user in any tenant."""
    # Verify tenant exists
    tenant = await session.get(Tenant, data.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Check email uniqueness within tenant
    existing = await session.execute(
        select(User).where(User.email == data.email, User.tenant_id == data.tenant_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists in this tenant")

    # Validate role
    try:
        role = UserRole(data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")

    new_user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=role,
        tenant_id=data.tenant_id,
        is_active=data.is_active,
        email_verified=True,
    )
    session.add(new_user)
    await session.flush()
    await session.refresh(new_user)
    await session.commit()

    logger.info("admin_user_created", extra={
        "new_user_id": str(new_user.id),
        "tenant_id": str(data.tenant_id),
    })

    return AdminUserResponse(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role.value,
        tenant_id=new_user.tenant_id,
        tenant_name=tenant.name,
        is_active=new_user.is_active,
        last_login_at=new_user.last_login_at,
        created_at=new_user.created_at,
    )


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user_detail(
    user_id: UUID,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Get user detail."""
    target = await session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    tenant_name = target.tenant.name if target.tenant else None
    return AdminUserResponse(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=target.role.value,
        tenant_id=target.tenant_id,
        tenant_name=tenant_name,
        is_active=target.is_active,
        last_login_at=target.last_login_at,
        created_at=target.created_at,
    )


@router.put("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: UUID,
    data: AdminUserUpdate,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Update a user."""
    target = await session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)

    if "role" in update_data:
        try:
            update_data["role"] = UserRole(update_data["role"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid role: {update_data['role']}")

    if "tenant_id" in update_data:
        tenant = await session.get(Tenant, update_data["tenant_id"])
        if not tenant:
            raise HTTPException(status_code=404, detail="Target tenant not found")

    for key, value in update_data.items():
        setattr(target, key, value)

    await session.flush()
    await session.refresh(target)
    await session.commit()

    tenant_name = target.tenant.name if target.tenant else None
    return AdminUserResponse(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=target.role.value,
        tenant_id=target.tenant_id,
        tenant_name=tenant_name,
        is_active=target.is_active,
        last_login_at=target.last_login_at,
        created_at=target.created_at,
    )


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: UUID,
    data: ResetPasswordRequest,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Reset a user's password."""
    target = await session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.password_hash = hash_password(data.new_password)
    await session.commit()

    logger.info("admin_password_reset", extra={
        "target_user_id": str(user_id),
        "by_user_id": str(user.id),
    })


# ═══════════════════════════════════════════════════════════════════
# AI AGENT MONITORING
# ═══════════════════════════════════════════════════════════════════


@router.get("/agents/stats", response_model=AgentStatsResponse)
async def get_agent_stats(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    days: int = Query(30, ge=1, le=365),
):
    """Get aggregated AI agent statistics."""
    from domains.jusmonitoria.db.models.agent_execution_log import AgentExecutionLog

    since = datetime.utcnow() - timedelta(days=days)
    base_query = select(AgentExecutionLog).where(AgentExecutionLog.created_at >= since)

    # Total stats
    total_result = await session.execute(
        select(
            func.count().label("total"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
            func.coalesce(func.avg(AgentExecutionLog.duration_ms), 0).label("avg_duration"),
        ).where(AgentExecutionLog.created_at >= since)
    )
    row = total_result.one()

    # By agent
    by_agent_result = await session.execute(
        select(
            AgentExecutionLog.agent_name,
            func.count().label("executions"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
            func.coalesce(func.avg(AgentExecutionLog.duration_ms), 0).label("avg_duration"),
        ).where(AgentExecutionLog.created_at >= since)
        .group_by(AgentExecutionLog.agent_name)
    )
    by_agent = {
        r.agent_name: {
            "executions": r.executions,
            "tokens": r.tokens,
            "errors": r.errors,
            "avg_duration_ms": round(float(r.avg_duration), 1),
        }
        for r in by_agent_result.all()
    }

    # By provider
    by_provider_result = await session.execute(
        select(
            AgentExecutionLog.provider_used,
            func.count().label("executions"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
        ).where(AgentExecutionLog.created_at >= since)
        .group_by(AgentExecutionLog.provider_used)
    )
    by_provider = {
        r.provider_used: {
            "executions": r.executions,
            "tokens": r.tokens,
            "errors": r.errors,
        }
        for r in by_provider_result.all()
    }

    return AgentStatsResponse(
        total_executions=row.total,
        total_tokens=row.tokens,
        total_errors=row.errors,
        avg_duration_ms=round(float(row.avg_duration), 1),
        by_agent=by_agent,
        by_provider=by_provider,
    )


@router.get("/agents/logs", response_model=AgentLogListResponse)
async def list_agent_logs(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    agent_name: Optional[str] = None,
    tenant_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
):
    """List AI agent execution logs."""
    from domains.jusmonitoria.db.models.agent_execution_log import AgentExecutionLog

    query = select(AgentExecutionLog)

    if agent_name:
        query = query.where(AgentExecutionLog.agent_name == agent_name)
    if tenant_id:
        query = query.where(AgentExecutionLog.tenant_id == tenant_id)
    if status_filter:
        query = query.where(AgentExecutionLog.status == status_filter)
    if date_from:
        query = query.where(AgentExecutionLog.created_at >= date_from)
    if date_to:
        query = query.where(AgentExecutionLog.created_at <= date_to)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()

    query = query.order_by(desc(AgentExecutionLog.created_at)).offset(skip).limit(limit)
    result = await session.execute(query)
    logs = result.scalars().all()

    return AgentLogListResponse(
        items=[AgentExecutionLogResponse.model_validate(l) for l in logs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/agents/providers", response_model=list[ProviderResponse])
async def list_all_providers(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """List all AI providers across all tenants."""
    result = await session.execute(
        select(AIProvider).join(Tenant, AIProvider.tenant_id == Tenant.id)
        .order_by(AIProvider.tenant_id, desc(AIProvider.priority))
    )
    providers = result.scalars().all()

    return [
        ProviderResponse(
            id=p.id,
            tenant_id=p.tenant_id,
            tenant_name=p.tenant.name if p.tenant else None,
            provider=p.provider,
            model=p.model,
            priority=p.priority,
            is_active=p.is_active,
            usage_count=p.usage_count,
            last_used_at=p.last_used_at,
        )
        for p in providers
    ]


@router.put("/agents/providers/{provider_id}", response_model=ProviderResponse)
async def update_provider(
    provider_id: UUID,
    data: ProviderUpdateRequest,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Update an AI provider (priority, toggle, model)."""
    provider = await session.get(AIProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if data.priority is not None:
        provider.priority = data.priority
    if data.is_active is not None:
        provider.is_active = data.is_active
    if data.model is not None:
        provider.model = data.model

    await session.flush()
    await session.refresh(provider)
    await session.commit()

    tenant_name = provider.tenant.name if provider.tenant else None
    return ProviderResponse(
        id=provider.id,
        tenant_id=provider.tenant_id,
        tenant_name=tenant_name,
        provider=provider.provider,
        model=provider.model,
        priority=provider.priority,
        is_active=provider.is_active,
        usage_count=provider.usage_count,
        last_used_at=provider.last_used_at,
    )


@router.post("/agents/providers", response_model=ProviderResponse, status_code=201)
async def create_provider(
    data: ProviderCreateRequest,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Create a new AI provider for a tenant."""
    from domains.jusmonitoria.db.models.tenant import Tenant

    tenant = await session.get(Tenant, data.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    provider = AIProvider(
        tenant_id=data.tenant_id,
        provider=data.provider,
        model=data.model,
        api_key_encrypted=encrypt(data.api_key),
        priority=data.priority,
        max_tokens=data.max_tokens,
        temperature=data.temperature,
        is_active=True,
        usage_count=0,
    )
    session.add(provider)
    await session.flush()
    await session.refresh(provider)
    await session.commit()

    return ProviderResponse(
        id=provider.id,
        tenant_id=provider.tenant_id,
        tenant_name=tenant.name,
        provider=provider.provider,
        model=provider.model,
        priority=provider.priority,
        is_active=provider.is_active,
        usage_count=provider.usage_count,
        last_used_at=provider.last_used_at,
    )


@router.delete("/agents/providers/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: UUID,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Delete an AI provider."""
    provider = await session.get(AIProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    await session.delete(provider)
    await session.commit()


# ═══════════════════════════════════════════════════════════════════
# WORKER SCHEDULE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


@router.get("/workers/schedules", response_model=list[WorkerScheduleResponse])
async def list_worker_schedules(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """List all worker schedules."""
    from domains.jusmonitoria.db.models.worker_schedule import WorkerSchedule

    result = await session.execute(
        select(WorkerSchedule).order_by(WorkerSchedule.task_name)
    )
    schedules = result.scalars().all()
    return [WorkerScheduleResponse.model_validate(s) for s in schedules]


@router.put("/workers/schedules/{schedule_id}", response_model=WorkerScheduleResponse)
async def update_worker_schedule(
    schedule_id: UUID,
    data: WorkerScheduleUpdate,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Update a worker schedule."""
    from domains.jusmonitoria.db.models.worker_schedule import WorkerSchedule

    schedule = await session.get(WorkerSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(schedule, key, value)

    await session.flush()
    await session.refresh(schedule)
    await session.commit()

    logger.info("worker_schedule_updated", extra={
        "schedule_id": str(schedule_id),
        "task_name": schedule.task_name,
    })
    return WorkerScheduleResponse.model_validate(schedule)


@router.patch("/workers/schedules/{schedule_id}/toggle", response_model=WorkerScheduleResponse)
async def toggle_worker_schedule(
    schedule_id: UUID,
    data: WorkerScheduleToggle,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Toggle a worker schedule on/off."""
    from domains.jusmonitoria.db.models.worker_schedule import WorkerSchedule

    schedule = await session.get(WorkerSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    schedule.is_active = data.is_active
    await session.flush()
    await session.refresh(schedule)
    await session.commit()

    action = "enabled" if data.is_active else "disabled"
    logger.info(f"worker_schedule_{action}", extra={
        "schedule_id": str(schedule_id),
        "task_name": schedule.task_name,
    })
    return WorkerScheduleResponse.model_validate(schedule)


@router.post("/workers/schedules/{schedule_id}/run-now", status_code=status.HTTP_202_ACCEPTED)
async def run_worker_now(
    schedule_id: UUID,
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Trigger a worker task immediately."""
    from domains.jusmonitoria.db.models.worker_schedule import WorkerSchedule
    from domains.jusmonitoria.tasks.scheduler import trigger_task_now

    schedule = await session.get(WorkerSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    await trigger_task_now(schedule.task_name)

    logger.info("worker_task_triggered", extra={
        "schedule_id": str(schedule_id),
        "task_name": schedule.task_name,
        "by_user_id": str(user.id),
    })
    return {"message": f"Task '{schedule.task_name}' triggered", "task_name": schedule.task_name}


@router.get("/workers/dlq", response_model=list[DLQEventResponse])
async def list_dlq_events(
    user: SuperAdminUser,
    limit: int = Query(50, ge=1, le=200),
):
    """List events in the Dead Letter Queue."""
    from domains.jusmonitoria.tasks.events.bus import get_dlq_events

    events = await get_dlq_events(limit=limit)
    return [
        DLQEventResponse(
            event_id=e.get("event_id", ""),
            event_type=e.get("event_type", ""),
            tenant_id=e.get("tenant_id"),
            timestamp=e.get("timestamp", ""),
            error_message=e.get("error_message"),
            retry_count=e.get("retry_count", 0),
            data=e.get("data", {}),
        )
        for e in events
    ]


@router.post("/workers/dlq/{event_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_dlq_event(
    event_id: str,
    user: SuperAdminUser,
):
    """Retry a failed event from the DLQ."""
    from domains.jusmonitoria.tasks.events.bus import retry_dlq_event as do_retry

    success = await do_retry(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found in DLQ")

    logger.info("dlq_event_retried", extra={
        "event_id": event_id,
        "by_user_id": str(user.id),
    })
    return {"message": "Event retried", "event_id": event_id}


# ═══════════════════════════════════════════════════════════════════
# PLATFORM DASHBOARD
# ═══════════════════════════════════════════════════════════════════


@router.get("/dashboard/overview", response_model=PlatformOverviewResponse)
async def get_platform_overview(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Get global platform overview."""
    total_tenants = (await session.execute(select(func.count()).select_from(Tenant))).scalar_one()
    active_tenants = (await session.execute(
        select(func.count()).where(Tenant.is_active == True)
    )).scalar_one()
    total_users = (await session.execute(select(func.count()).select_from(User))).scalar_one()
    active_users = (await session.execute(
        select(func.count()).where(User.is_active == True)
    )).scalar_one()
    total_leads = (await session.execute(select(func.count()).select_from(Lead))).scalar_one()
    total_clients = (await session.execute(select(func.count()).select_from(Client))).scalar_one()
    total_cases = (await session.execute(select(func.count()).select_from(LegalCase))).scalar_one()

    # AI stats (graceful if table doesn't exist yet)
    total_ai_executions = 0
    total_tokens_used = 0
    try:
        from domains.jusmonitoria.db.models.agent_execution_log import AgentExecutionLog
        ai_result = await session.execute(
            select(
                func.count().label("executions"),
                func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            )
        )
        ai_row = ai_result.one()
        total_ai_executions = ai_row.executions
        total_tokens_used = ai_row.tokens
    except Exception:
        pass

    return PlatformOverviewResponse(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        total_users=total_users,
        active_users=active_users,
        total_leads=total_leads,
        total_clients=total_clients,
        total_cases=total_cases,
        total_ai_executions=total_ai_executions,
        total_tokens_used=total_tokens_used,
    )


@router.get("/dashboard/ai-usage", response_model=AIUsageResponse)
async def get_ai_usage(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    days: int = Query(30, ge=1, le=365),
):
    """Get AI usage statistics."""
    from domains.jusmonitoria.db.models.agent_execution_log import AgentExecutionLog

    since = datetime.utcnow() - timedelta(days=days)

    # Approximate cost per 1M tokens (input/output) by provider
    COST_PER_1M = {
        "openai": {"input": 2.00, "output": 8.00},
        "google": {"input": 0.10, "output": 0.40},
        "anthropic": {"input": 3.00, "output": 15.00},
    }

    # Totals
    total_result = await session.execute(
        select(
            func.count().label("executions"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.coalesce(func.sum(AgentExecutionLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(AgentExecutionLog.output_tokens), 0).label("output_tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
        ).where(AgentExecutionLog.created_at >= since)
    )
    totals = total_result.one()

    # By day
    by_day_result = await session.execute(
        select(
            func.date_trunc("day", AgentExecutionLog.created_at).label("day"),
            func.count().label("executions"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.coalesce(func.sum(AgentExecutionLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(AgentExecutionLog.output_tokens), 0).label("output_tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
        ).where(AgentExecutionLog.created_at >= since)
        .group_by("day")
        .order_by("day")
    )
    by_day = [
        {
            "date": str(r.day.date()),
            "tokens": r.tokens,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "executions": r.executions,
            "errors": r.errors,
        }
        for r in by_day_result.all()
    ]

    # By provider
    by_provider_result = await session.execute(
        select(
            AgentExecutionLog.provider_used,
            func.count().label("executions"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.coalesce(func.sum(AgentExecutionLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(AgentExecutionLog.output_tokens), 0).label("output_tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
        ).where(AgentExecutionLog.created_at >= since)
        .group_by(AgentExecutionLog.provider_used)
    )
    by_provider = {
        r.provider_used: {
            "executions": r.executions,
            "tokens": r.tokens,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "errors": r.errors,
        }
        for r in by_provider_result.all()
    }

    # By agent
    by_agent_result = await session.execute(
        select(
            AgentExecutionLog.agent_name,
            func.count().label("executions"),
            func.coalesce(func.sum(AgentExecutionLog.total_tokens), 0).label("tokens"),
            func.coalesce(func.sum(AgentExecutionLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(AgentExecutionLog.output_tokens), 0).label("output_tokens"),
            func.count().filter(AgentExecutionLog.status == "error").label("errors"),
        ).where(AgentExecutionLog.created_at >= since)
        .group_by(AgentExecutionLog.agent_name)
    )
    by_agent = {
        r.agent_name: {
            "executions": r.executions,
            "tokens": r.tokens,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "errors": r.errors,
        }
        for r in by_agent_result.all()
    }

    # Estimate cost based on per-provider token breakdown
    estimated_cost = 0.0
    for provider_name, stats in by_provider.items():
        rates = COST_PER_1M.get(provider_name, {"input": 1.0, "output": 4.0})
        estimated_cost += (stats["input_tokens"] / 1_000_000) * rates["input"]
        estimated_cost += (stats["output_tokens"] / 1_000_000) * rates["output"]

    return AIUsageResponse(
        total_tokens=totals.tokens,
        total_input_tokens=totals.input_tokens,
        total_output_tokens=totals.output_tokens,
        total_executions=totals.executions,
        total_errors=totals.errors,
        estimated_cost_usd=round(estimated_cost, 4),
        by_day=by_day,
        by_provider=by_provider,
        by_agent=by_agent,
    )


@router.get("/dashboard/tenant-health", response_model=list[TenantHealthResponse])
async def get_tenant_health(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
):
    """Get health status for all tenants."""
    result = await session.execute(
        select(Tenant).where(Tenant.slug != "_platform").order_by(Tenant.name)
    )
    tenants = result.scalars().all()

    health_list = []
    for t in tenants:
        users_count = (await session.execute(
            select(func.count()).where(User.tenant_id == t.id)
        )).scalar_one()
        active_leads = (await session.execute(
            select(func.count()).where(Lead.tenant_id == t.id, Lead.status == "active")
        )).scalar_one()
        active_clients = (await session.execute(
            select(func.count()).where(Client.tenant_id == t.id, Client.status == "active")
        )).scalar_one()
        active_cases = (await session.execute(
            select(func.count()).where(LegalCase.tenant_id == t.id)
        )).scalar_one()

        # Last activity
        last_audit = await session.execute(
            select(AuditLog.created_at)
            .where(AuditLog.tenant_id == t.id)
            .order_by(desc(AuditLog.created_at))
            .limit(1)
        )
        last_activity_row = last_audit.scalar_one_or_none()

        health_list.append(TenantHealthResponse(
            tenant_id=t.id,
            tenant_name=t.name,
            is_active=t.is_active,
            users_count=users_count,
            active_leads=active_leads,
            active_clients=active_clients,
            active_cases=active_cases,
            last_activity_at=last_activity_row,
        ))

    return health_list


# ═══════════════════════════════════════════════════════════════════
# AUDIT LOGS (CROSS-TENANT)
# ═══════════════════════════════════════════════════════════════════


@router.get("/audit/logs", response_model=AuditLogListResponse)
async def list_audit_logs_admin(
    user: SuperAdminUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tenant_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
):
    """List audit logs across all tenants."""
    query = select(AuditLog)

    if tenant_id:
        query = query.where(AuditLog.tenant_id == tenant_id)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if action:
        query = query.where(AuditLog.action == action)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()

    query = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
    result = await session.execute(query)
    logs = result.scalars().all()

    # Batch fetch tenant/user names
    items = []
    for log in logs:
        items.append(AuditLogAdminResponse(
            id=log.id,
            tenant_id=log.tenant_id,
            user_id=log.user_id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            ip_address=log.ip_address,
            created_at=log.created_at,
        ))

    return AuditLogListResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("/chatwit/sync-identifiers", status_code=status.HTTP_200_OK)
async def sync_chatwit_identifiers(
    user: SuperAdminUser,
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    One-time migration: sync identifiers to Chatwit for all existing Leads/Clients.

    For each Lead/Client that has a chatwit_contact_id, PATCHes the Chatwit contact
    to set identifier = jm_lead_{id} or jm_client_{id}.
    """
    from domains.jusmonitoria.services.chatwit_client import sync_identifier_to_chatwit

    # Get all tenants with Chatwit configured
    tenants_result = await session.execute(
        select(Tenant).where(Tenant.is_active.is_(True))
    )
    tenants = tenants_result.scalars().all()

    results = {"leads_synced": 0, "clients_synced": 0, "errors": 0}

    for tenant in tenants:
        settings = tenant.settings or {}
        metadata = {
            "chatwit_base_url": settings.get("chatwit_base_url", ""),
            "account_id": tenant.chatwit_account_id,
            "chatwit_agent_bot_token": settings.get("chatwit_agent_bot_token", ""),
        }

        if not metadata["chatwit_base_url"] or not metadata["chatwit_agent_bot_token"]:
            continue

        # Sync leads
        leads_result = await session.execute(
            select(Lead).where(
                Lead.tenant_id == tenant.id,
                Lead.chatwit_contact_id.isnot(None),
            )
        )
        for lead in leads_result.scalars().all():
            identifier = await sync_identifier_to_chatwit(
                entity_id=str(lead.id),
                chatwit_contact_id=lead.chatwit_contact_id,
                metadata=metadata,
                entity_type="lead",
            )
            if identifier:
                results["leads_synced"] += 1
            else:
                results["errors"] += 1

        # Sync clients
        clients_result = await session.execute(
            select(Client).where(
                Client.tenant_id == tenant.id,
                Client.chatwit_contact_id.isnot(None),
            )
        )
        for client in clients_result.scalars().all():
            identifier = await sync_identifier_to_chatwit(
                entity_id=str(client.id),
                chatwit_contact_id=client.chatwit_contact_id,
                metadata=metadata,
                entity_type="client",
            )
            if identifier:
                results["clients_synced"] += 1
            else:
                results["errors"] += 1

    logger.info("chatwit_identifiers_synced", extra=results)
    return results
