"""Tenant repository for managing law firm tenants."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.tenant import Tenant

logger = logging.getLogger(__name__)


class TenantRepository:
    """
    Repository for Tenant operations.
    
    Note: Tenant repository doesn't inherit from BaseRepository
    since tenants are not tenant-scoped themselves.
    """
    
    def __init__(self, session: AsyncSession):
        """
        Initialize repository.
        
        Args:
            session: Async database session
        """
        self.session = session
    
    async def get(self, id: UUID) -> Tenant | None:
        """
        Get tenant by ID.
        
        Args:
            id: Tenant UUID
            
        Returns:
            Tenant instance or None if not found
        """
        query = select(Tenant).where(Tenant.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_slug(self, slug: str) -> Tenant | None:
        """
        Get tenant by slug.
        
        Args:
            slug: Tenant slug (URL-friendly identifier)
            
        Returns:
            Tenant instance or None if not found
        """
        query = select(Tenant).where(Tenant.slug == slug)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_active(self) -> list[Tenant]:
        """
        List all active tenants.
        
        Returns:
            List of active tenant instances
        """
        query = select(Tenant).where(Tenant.is_active == True).order_by(Tenant.name)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_active_tenants(self) -> list[Tenant]:
        """
        Get all active tenants (alias for list_active).
        
        Returns:
            List of active tenant instances
        """
        return await self.list_active()
    
    async def create(
        self,
        name: str,
        slug: str,
        plan: str = "basic",
        settings: dict | None = None,
    ) -> Tenant:
        """
        Create a new tenant.
        
        Args:
            name: Tenant name
            slug: URL-friendly identifier
            plan: Subscription plan
            settings: Tenant-specific settings
            
        Returns:
            Created tenant instance
        """
        tenant = Tenant(
            name=name,
            slug=slug,
            plan=plan,
            settings=settings or {},
        )
        
        self.session.add(tenant)
        await self.session.flush()
        await self.session.refresh(tenant)
        
        logger.info(
            "Created tenant",
            extra={"id": str(tenant.id), "slug": slug, "name": name},
        )
        
        return tenant
    
    async def update_settings(
        self,
        id: UUID,
        settings: dict,
    ) -> Tenant | None:
        """
        Update tenant settings.
        
        Args:
            id: Tenant UUID
            settings: New settings dictionary
            
        Returns:
            Updated tenant instance or None if not found
        """
        tenant = await self.get(id)
        if not tenant:
            return None
        
        tenant.settings = settings
        await self.session.flush()
        await self.session.refresh(tenant)
        
        logger.info(
            "Updated tenant settings",
            extra={"id": str(id)},
        )
        
        return tenant
    
    async def deactivate(self, id: UUID) -> bool:
        """
        Deactivate a tenant.
        
        Args:
            id: Tenant UUID
            
        Returns:
            True if deactivated, False if not found
        """
        tenant = await self.get(id)
        if not tenant:
            return False
        
        tenant.is_active = False
        await self.session.flush()
        
        logger.info(
            "Deactivated tenant",
            extra={"id": str(id)},
        )
        
        return True
