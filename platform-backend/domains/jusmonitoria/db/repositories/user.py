"""User repository for managing tenant users."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository[User]):
    """Repository for User operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(User, session, tenant_id)
    
    async def get_by_email(self, email: str) -> User | None:
        """
        Get user by email within tenant.
        
        Args:
            email: User email address
            
        Returns:
            User instance or None if not found
        """
        query = select(User).where(User.email == email)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_role(self, role: str) -> list[User]:
        """
        List users by role within tenant.
        
        Args:
            role: User role (admin, advogado, assistente, visualizador)
            
        Returns:
            List of user instances
        """
        query = select(User).where(User.role == role)
        query = self._apply_tenant_filter(query)
        query = query.order_by(User.full_name)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_active(self) -> list[User]:
        """
        List all active users within tenant.
        
        Returns:
            List of active user instances
        """
        query = select(User).where(User.is_active == True)
        query = self._apply_tenant_filter(query)
        query = query.order_by(User.full_name)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_last_login(self, id: UUID) -> bool:
        """
        Update user's last login timestamp.
        
        Args:
            id: User UUID
            
        Returns:
            True if updated, False if not found
        """
        from datetime import datetime
        
        user = await self.get(id)
        if not user:
            return False
        
        user.last_login_at = datetime.now()
        await self.session.flush()
        
        logger.debug(
            "Updated user last login",
            extra={"user_id": str(id), "tenant_id": str(self.tenant_id)},
        )
        
        return True
