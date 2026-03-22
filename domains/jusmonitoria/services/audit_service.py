"""Audit logging service for tracking user actions."""

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.logging.config import get_logger
from domains.jusmonitoria.db.models.audit_log import AuditLog

logger = get_logger(__name__)


class AuditService:
    """
    Service for creating audit log entries.
    
    Records all significant user actions for:
    - Security auditing
    - Compliance requirements
    - Debugging and troubleshooting
    - User activity tracking
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def log_action(
        self,
        tenant_id: UUID,
        action: str,
        entity_type: str,
        entity_id: UUID,
        user_id: Optional[UUID] = None,
        old_values: Optional[dict[str, Any]] = None,
        new_values: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """
        Create an audit log entry.
        
        Args:
            tenant_id: Tenant ID
            action: Action performed (create, update, delete, read, etc.)
            entity_type: Type of entity (client, case, lead, etc.)
            entity_id: ID of the entity
            user_id: User who performed the action
            old_values: Previous values (for updates)
            new_values: New values (for creates/updates)
            ip_address: IP address of the request
            user_agent: User agent string
        
        Returns:
            Created audit log entry
        """
        audit_log = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        self.session.add(audit_log)
        await self.session.commit()
        await self.session.refresh(audit_log)
        
        logger.info(
            "audit_log_created",
            audit_log_id=str(audit_log.id),
            tenant_id=str(tenant_id),
            user_id=str(user_id) if user_id else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
        )
        
        return audit_log
    
    async def log_create(
        self,
        tenant_id: UUID,
        entity_type: str,
        entity_id: UUID,
        values: dict[str, Any],
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Log entity creation."""
        return await self.log_action(
            tenant_id=tenant_id,
            action="create",
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            new_values=values,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    async def log_update(
        self,
        tenant_id: UUID,
        entity_type: str,
        entity_id: UUID,
        old_values: dict[str, Any],
        new_values: dict[str, Any],
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Log entity update."""
        return await self.log_action(
            tenant_id=tenant_id,
            action="update",
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    async def log_delete(
        self,
        tenant_id: UUID,
        entity_type: str,
        entity_id: UUID,
        values: dict[str, Any],
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Log entity deletion."""
        return await self.log_action(
            tenant_id=tenant_id,
            action="delete",
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            old_values=values,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    async def log_access(
        self,
        tenant_id: UUID,
        entity_type: str,
        entity_id: UUID,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Log entity access (read)."""
        return await self.log_action(
            tenant_id=tenant_id,
            action="read",
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    async def log_state_change(
        self,
        tenant_id: UUID,
        entity_type: str,
        entity_id: UUID,
        old_state: str,
        new_state: str,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Log state change (e.g., lead stage change, case status change)."""
        return await self.log_action(
            tenant_id=tenant_id,
            action="state_change",
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            old_values={"state": old_state},
            new_values={"state": new_state},
            ip_address=ip_address,
            user_agent=user_agent,
        )


def get_audit_service(session: AsyncSession) -> AuditService:
    """Dependency for getting audit service."""
    return AuditService(session)
