"""Audit logs API endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.repositories.audit_log_repository import AuditLogRepository
from domains.jusmonitoria.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs", response_model=list[AuditLogResponse])
async def get_audit_logs(
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of logs to return"),
    user_id: Optional[UUID] = Query(None, description="Filter by user ID"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    entity_id: Optional[UUID] = Query(None, description="Filter by entity ID"),
    action: Optional[str] = Query(None, description="Filter by action"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[AuditLogResponse]:
    """
    Get audit logs with optional filters.
    
    Requires authentication. Returns only logs for the authenticated tenant.
    
    Args:
        limit: Maximum number of logs to return (1-1000)
        user_id: Filter by user who performed the action
        entity_type: Filter by entity type (client, case, lead, etc.)
        entity_id: Filter by specific entity ID
        action: Filter by action type (create, update, delete, etc.)
        start_date: Filter logs after this date
        end_date: Filter logs before this date
    
    Returns:
        List of audit logs matching the filters
    """
    repo = AuditLogRepository(session, tenant_id)
    
    # Apply filters based on query parameters
    if entity_type and entity_id:
        logs = await repo.get_by_entity(entity_type, entity_id, limit)
    elif user_id:
        logs = await repo.get_by_user(user_id, start_date, end_date, limit)
    elif action:
        logs = await repo.get_by_action(action, start_date, end_date, limit)
    else:
        logs = await repo.get_recent(limit)
    
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get("/logs/entity/{entity_type}/{entity_id}", response_model=list[AuditLogResponse])
async def get_entity_audit_logs(
    entity_type: str,
    entity_id: UUID,
    limit: int = Query(100, ge=1, le=1000),
    tenant_id: UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[AuditLogResponse]:
    """
    Get audit logs for a specific entity.
    
    Useful for viewing the complete history of changes to an entity.
    
    Args:
        entity_type: Type of entity (client, case, lead, etc.)
        entity_id: Entity ID
        limit: Maximum number of logs to return
    
    Returns:
        List of audit logs for the entity
    """
    repo = AuditLogRepository(session, tenant_id)
    logs = await repo.get_by_entity(entity_type, entity_id, limit)
    
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get("/logs/user/{user_id}", response_model=list[AuditLogResponse])
async def get_user_audit_logs(
    user_id: UUID,
    limit: int = Query(100, ge=1, le=1000),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    tenant_id: UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[AuditLogResponse]:
    """
    Get audit logs for a specific user.
    
    Useful for tracking user activity and compliance.
    
    Args:
        user_id: User ID
        limit: Maximum number of logs to return
        start_date: Filter logs after this date
        end_date: Filter logs before this date
    
    Returns:
        List of audit logs for the user
    """
    repo = AuditLogRepository(session, tenant_id)
    logs = await repo.get_by_user(user_id, start_date, end_date, limit)
    
    return [AuditLogResponse.model_validate(log) for log in logs]
