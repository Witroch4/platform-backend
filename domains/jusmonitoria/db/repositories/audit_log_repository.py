"""Repository for audit log operations."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.audit_log import AuditLog
from domains.jusmonitoria.db.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    """Repository for audit log operations."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(AuditLog, session, tenant_id)
    
    async def get_by_entity(
        self,
        entity_type: str,
        entity_id: UUID,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get audit logs for a specific entity.
        
        Args:
            entity_type: Type of entity
            entity_id: Entity ID
            limit: Maximum number of logs to return
        
        Returns:
            List of audit logs ordered by creation date (newest first)
        """
        stmt = (
            select(AuditLog)
            .where(
                AuditLog.tenant_id == self.tenant_id,
                AuditLog.entity_type == entity_type,
                AuditLog.entity_id == entity_id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_by_user(
        self,
        user_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get audit logs for a specific user.
        
        Args:
            user_id: User ID
            start_date: Start date filter (optional)
            end_date: End date filter (optional)
            limit: Maximum number of logs to return
        
        Returns:
            List of audit logs ordered by creation date (newest first)
        """
        stmt = (
            select(AuditLog)
            .where(
                AuditLog.tenant_id == self.tenant_id,
                AuditLog.user_id == user_id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        
        if start_date:
            stmt = stmt.where(AuditLog.created_at >= start_date)
        
        if end_date:
            stmt = stmt.where(AuditLog.created_at <= end_date)
        
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_by_action(
        self,
        action: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get audit logs by action type.
        
        Args:
            action: Action type (create, update, delete, etc.)
            start_date: Start date filter (optional)
            end_date: End date filter (optional)
            limit: Maximum number of logs to return
        
        Returns:
            List of audit logs ordered by creation date (newest first)
        """
        stmt = (
            select(AuditLog)
            .where(
                AuditLog.tenant_id == self.tenant_id,
                AuditLog.action == action,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        
        if start_date:
            stmt = stmt.where(AuditLog.created_at >= start_date)
        
        if end_date:
            stmt = stmt.where(AuditLog.created_at <= end_date)
        
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_recent(
        self,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get recent audit logs for the tenant.
        
        Args:
            limit: Maximum number of logs to return
        
        Returns:
            List of audit logs ordered by creation date (newest first)
        """
        stmt = (
            select(AuditLog)
            .where(AuditLog.tenant_id == self.tenant_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
