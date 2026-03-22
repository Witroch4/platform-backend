"""Repository for AI provider management."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.ai_provider import AIProvider
from domains.jusmonitoria.db.repositories.base import BaseRepository


class AIProviderRepository(BaseRepository[AIProvider]):
    """Repository for managing AI provider configurations."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(AIProvider, session, tenant_id)
    
    async def get_active_providers(
        self,
        order_by_priority: bool = True,
    ) -> list[AIProvider]:
        """
        Get all active providers for the tenant.
        
        Args:
            order_by_priority: If True, order by priority (highest first)
        
        Returns:
            List of active AIProvider instances
        """
        query = select(AIProvider).where(
            AIProvider.tenant_id == self.tenant_id,
            AIProvider.is_active == True,
        )
        
        if order_by_priority:
            query = query.order_by(AIProvider.priority.desc())
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_provider_name(
        self,
        provider: str,
        model: Optional[str] = None,
    ) -> list[AIProvider]:
        """
        Get providers by provider name and optionally model.
        
        Args:
            provider: Provider name (e.g., 'openai', 'anthropic')
            model: Optional model name to filter by
        
        Returns:
            List of matching AIProvider instances
        """
        query = select(AIProvider).where(
            AIProvider.tenant_id == self.tenant_id,
            AIProvider.provider == provider,
        )
        
        if model:
            query = query.where(AIProvider.model == model)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def record_usage(self, provider_id: UUID) -> None:
        """
        Record usage of a provider.
        
        Increments usage_count and updates last_used_at timestamp.
        
        Args:
            provider_id: UUID of the provider
        """
        provider = await self.get(provider_id)
        
        if provider:
            provider.usage_count += 1
            provider.last_used_at = datetime.utcnow()
            await self.session.flush()
    
    async def update_priority(
        self,
        provider_id: UUID,
        new_priority: int,
    ) -> Optional[AIProvider]:
        """
        Update provider priority.
        
        Args:
            provider_id: UUID of the provider
            new_priority: New priority value
        
        Returns:
            Updated AIProvider instance or None if not found
        """
        return await self.update(provider_id, priority=new_priority)
    
    async def toggle_active(
        self,
        provider_id: UUID,
        is_active: bool,
    ) -> Optional[AIProvider]:
        """
        Enable or disable a provider.
        
        Args:
            provider_id: UUID of the provider
            is_active: New active status
        
        Returns:
            Updated AIProvider instance or None if not found
        """
        return await self.update(provider_id, is_active=is_active)
    
    async def get_usage_stats(self) -> dict[str, int]:
        """
        Get usage statistics for all providers.
        
        Returns:
            Dictionary mapping provider/model to usage count
        """
        providers = await self.list()
        
        stats = {}
        for provider in providers:
            key = f"{provider.provider}/{provider.model}"
            stats[key] = provider.usage_count
        
        return stats
