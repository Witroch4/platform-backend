"""Audit log schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    """Audit log response schema."""
    
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    user_id: Optional[UUID] = None
    action: str
    entity_type: str
    entity_id: UUID
    old_values: Optional[dict[str, Any]] = None
    new_values: Optional[dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class AuditLogCreate(BaseModel):
    """Schema for creating audit log (internal use)."""
    
    tenant_id: UUID
    user_id: Optional[UUID] = None
    action: str
    entity_type: str
    entity_id: UUID
    old_values: Optional[dict[str, Any]] = None
    new_values: Optional[dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
