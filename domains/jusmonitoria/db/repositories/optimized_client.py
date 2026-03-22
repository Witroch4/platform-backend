"""Optimized client repository with eager loading and caching."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client import Client, ClientStatus
from domains.jusmonitoria.db.repositories.optimized_base import OptimizedBaseRepository
from domains.jusmonitoria.services.cache_service import cache_service

logger = logging.getLogger(__name__)


class OptimizedClientRepository(OptimizedBaseRepository[Client]):
    """
    Optimized repository for Client operations.
    
    Features:
    - Eager loading of tenant and assigned_user relationships
    - Redis caching for frequently accessed queries
    - Batch operations for bulk updates
    - Performance logging
    """
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository with eager loading configuration.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(
            Client,
            session,
            tenant_id,
            eager_load=['tenant', 'assigned_user', 'source_lead'],
            use_joined_load=False,  # Use selectinload for better performance
        )
    
    async def get_active_clients(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = True,
    ) -> list[Client]:
        """
        Get all active clients within tenant with caching.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of active client instances
        """
        # Try cache first
        if use_cache:
            cache_key = f"active_clients:skip:{skip}:limit:{limit}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                logger.debug(f"Cache hit for active clients (tenant: {self.tenant_id})")
                return [Client(**item) for item in cached]
        
        # Query database with optimized index
        query = select(Client).where(Client.status == ClientStatus.ACTIVE)
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(Client.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        clients = list(result.scalars().all())
        
        # Cache results
        if use_cache and clients:
            cache_key = f"active_clients:skip:{skip}:limit:{limit}"
            cache_data = [client.to_dict() for client in clients]
            await cache_service.set(
                cache_key,
                cache_data,
                ttl=300,  # 5 minutes
                tenant_id=self.tenant_id,
            )
        
        logger.debug(
            f"Retrieved {len(clients)} active clients",
            extra={
                "tenant_id": str(self.tenant_id),
                "skip": skip,
                "limit": limit,
                "cached": False,
            },
        )
        
        return clients
    
    async def get_by_cpf_cnpj(
        self,
        cpf_cnpj: str,
        *,
        use_cache: bool = True,
    ) -> Client | None:
        """
        Get client by CPF/CNPJ within tenant with caching.
        
        Uses optimized composite index: idx_clients_tenant_cpf_cnpj
        
        Args:
            cpf_cnpj: CPF or CNPJ identifier
            use_cache: If True, use Redis cache
            
        Returns:
            Client instance or None if not found
        """
        # Try cache first
        if use_cache:
            cache_key = f"client:cpf_cnpj:{cpf_cnpj}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return Client(**cached)
        
        # Query database
        query = select(Client).where(Client.cpf_cnpj == cpf_cnpj)
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        
        result = await self.session.execute(query)
        client = result.scalar_one_or_none()
        
        # Cache result
        if use_cache and client:
            cache_key = f"client:cpf_cnpj:{cpf_cnpj}"
            await cache_service.set(
                cache_key,
                client.to_dict(),
                ttl=600,  # 10 minutes
                tenant_id=self.tenant_id,
            )
        
        return client
    
    async def get_by_chatwit_contact(
        self,
        chatwit_contact_id: str,
        *,
        use_cache: bool = True,
    ) -> Client | None:
        """
        Get client by Chatwit contact ID within tenant with caching.
        
        Args:
            chatwit_contact_id: Chatwit contact identifier
            use_cache: If True, use Redis cache
            
        Returns:
            Client instance or None if not found
        """
        # Try cache first
        if use_cache:
            cache_key = f"client:chatwit:{chatwit_contact_id}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return Client(**cached)
        
        # Query database
        query = select(Client).where(Client.chatwit_contact_id == chatwit_contact_id)
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        
        result = await self.session.execute(query)
        client = result.scalar_one_or_none()
        
        # Cache result
        if use_cache and client:
            cache_key = f"client:chatwit:{chatwit_contact_id}"
            await cache_service.set(
                cache_key,
                client.to_dict(),
                ttl=600,  # 10 minutes
                tenant_id=self.tenant_id,
            )
        
        return client
    
    async def get_by_assigned_user(
        self,
        user_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = True,
    ) -> list[Client]:
        """
        Get clients assigned to a specific user within tenant.
        
        Uses optimized composite index: idx_clients_tenant_assigned_status
        
        Args:
            user_id: User UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of client instances
        """
        # Try cache first
        if use_cache:
            cache_key = f"clients:assigned:{user_id}:skip:{skip}:limit:{limit}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return [Client(**item) for item in cached]
        
        # Query database
        query = select(Client).where(
            Client.assigned_to == user_id,
            Client.status == ClientStatus.ACTIVE,
        )
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(Client.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        clients = list(result.scalars().all())
        
        # Cache results
        if use_cache and clients:
            cache_key = f"clients:assigned:{user_id}:skip:{skip}:limit:{limit}"
            cache_data = [client.to_dict() for client in clients]
            await cache_service.set(
                cache_key,
                cache_data,
                ttl=300,  # 5 minutes
                tenant_id=self.tenant_id,
            )
        
        return clients
    
    async def get_low_health_clients(
        self,
        max_score: int = 50,
        *,
        skip: int = 0,
        limit: int = 100,
        use_cache: bool = True,
    ) -> list[Client]:
        """
        Get clients with low health score within tenant.
        
        Uses optimized composite index: idx_clients_tenant_health_status
        
        Args:
            max_score: Maximum health score threshold
            skip: Number of records to skip
            limit: Maximum number of records to return
            use_cache: If True, use Redis cache
            
        Returns:
            List of client instances with low health
        """
        # Try cache first
        if use_cache:
            cache_key = f"clients:low_health:{max_score}:skip:{skip}:limit:{limit}"
            cached = await cache_service.get(cache_key, tenant_id=self.tenant_id)
            if cached:
                return [Client(**item) for item in cached]
        
        # Query database
        query = select(Client).where(
            Client.health_score <= max_score,
            Client.status == ClientStatus.ACTIVE,
        )
        query = self._apply_tenant_filter(query)
        query = self._apply_eager_loading(query)
        query = query.order_by(Client.health_score.asc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        clients = list(result.scalars().all())
        
        # Cache results
        if use_cache and clients:
            cache_key = f"clients:low_health:{max_score}:skip:{skip}:limit:{limit}"
            cache_data = [client.to_dict() for client in clients]
            await cache_service.set(
                cache_key,
                cache_data,
                ttl=180,  # 3 minutes (shorter TTL for health data)
                tenant_id=self.tenant_id,
            )
        
        return clients
    
    async def update_health_score(
        self,
        id: UUID,
        health_score: int,
    ) -> Client | None:
        """
        Update client health score and invalidate related caches.
        
        Args:
            id: Client UUID
            health_score: New health score (0-100)
            
        Returns:
            Updated client instance or None if not found
        """
        client = await self.get(id, with_relationships=False)
        if not client:
            return None
        
        # Update health score
        client.health_score = max(0, min(100, health_score))  # Clamp to 0-100
        await self.session.flush()
        await self.session.refresh(client)
        
        # Invalidate related caches
        await self._invalidate_client_caches(client)
        
        logger.debug(
            "Updated client health score",
            extra={
                "client_id": str(id),
                "tenant_id": str(self.tenant_id),
                "health_score": client.health_score,
            },
        )
        
        return client
    
    async def create(self, **data) -> Client:
        """
        Create a new client and invalidate list caches.
        
        Args:
            **data: Client field values
            
        Returns:
            Created client instance
        """
        client = await super().create(**data)
        
        # Invalidate list caches
        await cache_service.delete_pattern("active_clients:*", tenant_id=self.tenant_id)
        await cache_service.delete_pattern("clients:assigned:*", tenant_id=self.tenant_id)
        
        return client
    
    async def update(self, id: UUID, **data) -> Client | None:
        """
        Update a client and invalidate related caches.
        
        Args:
            id: Client UUID
            **data: Fields to update
            
        Returns:
            Updated client instance or None if not found
        """
        client = await super().update(id, **data)
        
        if client:
            await self._invalidate_client_caches(client)
        
        return client
    
    async def delete(self, id: UUID, *, soft: bool = False) -> bool:
        """
        Delete a client and invalidate related caches.
        
        Args:
            id: Client UUID
            soft: If True, perform soft delete
            
        Returns:
            True if deleted, False if not found
        """
        # Get client before deletion to invalidate caches
        client = await self.get(id, with_relationships=False)
        
        deleted = await super().delete(id, soft=soft)
        
        if deleted and client:
            await self._invalidate_client_caches(client)
        
        return deleted
    
    async def _invalidate_client_caches(self, client: Client) -> None:
        """
        Invalidate all caches related to a client.
        
        Args:
            client: Client instance
        """
        # Invalidate specific client caches
        if client.cpf_cnpj:
            await cache_service.delete(
                f"client:cpf_cnpj:{client.cpf_cnpj}",
                tenant_id=self.tenant_id,
            )
        
        if client.chatwit_contact_id:
            await cache_service.delete(
                f"client:chatwit:{client.chatwit_contact_id}",
                tenant_id=self.tenant_id,
            )
        
        # Invalidate list caches
        await cache_service.delete_pattern("active_clients:*", tenant_id=self.tenant_id)
        await cache_service.delete_pattern("clients:low_health:*", tenant_id=self.tenant_id)
        
        if client.assigned_to:
            await cache_service.delete_pattern(
                f"clients:assigned:{client.assigned_to}:*",
                tenant_id=self.tenant_id,
            )
