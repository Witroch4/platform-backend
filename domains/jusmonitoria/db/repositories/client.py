"""Client repository for CRM management."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client import Client, ClientStatus
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class ClientRepository(BaseRepository[Client]):
    """Repository for Client operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(Client, session, tenant_id)
    
    async def get_active_clients(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Client]:
        """
        Get all active clients within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of active client instances
        """
        query = select(Client).where(Client.status == ClientStatus.ACTIVE)
        query = self._apply_tenant_filter(query)
        query = query.order_by(Client.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_cpf_cnpj(
        self,
        cpf_cnpj: str,
    ) -> Client | None:
        """
        Get client by CPF/CNPJ within tenant.
        
        Args:
            cpf_cnpj: CPF or CNPJ identifier
            
        Returns:
            Client instance or None if not found
        """
        query = select(Client).where(Client.cpf_cnpj == cpf_cnpj)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_chatwit_contact(
        self,
        chatwit_contact_id: str,
    ) -> Client | None:
        """
        Get client by Chatwit contact ID within tenant.
        
        Args:
            chatwit_contact_id: Chatwit contact identifier
            
        Returns:
            Client instance or None if not found
        """
        query = select(Client).where(Client.chatwit_contact_id == chatwit_contact_id)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_assigned_user(
        self,
        user_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Client]:
        """
        Get clients assigned to a specific user within tenant.
        
        Args:
            user_id: User UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of client instances
        """
        query = select(Client).where(
            Client.assigned_to == user_id,
            Client.status == ClientStatus.ACTIVE,
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(Client.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_low_health_clients(
        self,
        max_score: int = 50,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Client]:
        """
        Get clients with low health score within tenant.
        
        Args:
            max_score: Maximum health score threshold
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of client instances with low health
        """
        query = select(Client).where(
            Client.health_score <= max_score,
            Client.status == ClientStatus.ACTIVE,
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(Client.health_score.asc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_health_score(
        self,
        id: UUID,
        health_score: int,
    ) -> Client | None:
        """
        Update client health score within tenant.
        
        Args:
            id: Client UUID
            health_score: New health score (0-100)
            
        Returns:
            Updated client instance or None if not found
        """
        client = await self.get(id)
        if not client:
            return None
        
        client.health_score = max(0, min(100, health_score))  # Clamp to 0-100
        await self.session.flush()
        await self.session.refresh(client)
        
        logger.debug(
            "Updated client health score",
            extra={
                "client_id": str(id),
                "tenant_id": str(self.tenant_id),
                "health_score": client.health_score,
            },
        )
        
        return client
