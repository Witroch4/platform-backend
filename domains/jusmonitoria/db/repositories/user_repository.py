"""User repository for authentication and user management."""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User model with authentication methods."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize user repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(User, session, tenant_id)
    
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        """
        Get user by ID within tenant.
        
        Args:
            user_id: User UUID
        
        Returns:
            User instance or None if not found
        """
        return await self.get(user_id)
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """
        Get user by email within tenant.
        
        Args:
            email: User email address
        
        Returns:
            User instance or None if not found
        """
        query = select(User).where(
            User.email == email,
            User.tenant_id == self.tenant_id,
        )
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_active_by_email(self, email: str) -> Optional[User]:
        """
        Get active user by email within tenant.
        
        Args:
            email: User email address
        
        Returns:
            Active user instance or None if not found or inactive
        """
        query = select(User).where(
            User.email == email,
            User.tenant_id == self.tenant_id,
            User.is_active == True,
        )
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def email_exists(self, email: str) -> bool:
        """
        Check if email exists within tenant.
        
        Args:
            email: Email address to check
        
        Returns:
            True if email exists, False otherwise
        """
        user = await self.get_by_email(email)
        return user is not None
    
    async def update_last_login(self, user_id: UUID) -> None:
        """
        Update user's last login timestamp.
        
        Args:
            user_id: User UUID
        """
        from datetime import datetime
        
        await self.update(user_id, last_login_at=datetime.utcnow())
