"""Client automation repository."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client_automation import ClientAutomation
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class ClientAutomationRepository(BaseRepository[ClientAutomation]):
    """Repository for ClientAutomation operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(ClientAutomation, session, tenant_id)
    
    async def get_by_client(
        self,
        client_id: UUID,
    ) -> ClientAutomation | None:
        """
        Get automation config for a client within tenant.
        
        Args:
            client_id: Client UUID
            
        Returns:
            ClientAutomation instance or None if not found
        """
        query = select(ClientAutomation).where(ClientAutomation.client_id == client_id)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_or_create(
        self,
        client_id: UUID,
    ) -> ClientAutomation:
        """
        Get or create automation config for a client.
        
        If config doesn't exist, creates one with default values.
        
        Args:
            client_id: Client UUID
            
        Returns:
            ClientAutomation instance
        """
        config = await self.get_by_client(client_id)
        
        if not config:
            config = await self.create(
                client_id=client_id,
                briefing_matinal=True,
                alertas_urgentes=True,
                resumo_semanal=True,
            )
            
            logger.info(
                "Created default automation config",
                extra={
                    "client_id": str(client_id),
                    "tenant_id": str(self.tenant_id),
                },
            )
        
        return config
    
    async def update_config(
        self,
        client_id: UUID,
        briefing_matinal: bool | None = None,
        alertas_urgentes: bool | None = None,
        resumo_semanal: bool | None = None,
    ) -> ClientAutomation:
        """
        Update automation config for a client.
        
        Args:
            client_id: Client UUID
            briefing_matinal: Enable/disable morning briefing
            alertas_urgentes: Enable/disable urgent alerts
            resumo_semanal: Enable/disable weekly summary
            
        Returns:
            Updated ClientAutomation instance
        """
        config = await self.get_or_create(client_id)
        
        if briefing_matinal is not None:
            config.briefing_matinal = briefing_matinal
        
        if alertas_urgentes is not None:
            config.alertas_urgentes = alertas_urgentes
        
        if resumo_semanal is not None:
            config.resumo_semanal = resumo_semanal
        
        await self.session.flush()
        await self.session.refresh(config)
        
        logger.info(
            "Updated automation config",
            extra={
                "client_id": str(client_id),
                "tenant_id": str(self.tenant_id),
                "briefing_matinal": config.briefing_matinal,
                "alertas_urgentes": config.alertas_urgentes,
                "resumo_semanal": config.resumo_semanal,
            },
        )
        
        return config
    
    async def get_clients_with_briefing_enabled(
        self,
        *,
        skip: int = 0,
        limit: int = 1000,
    ) -> list[ClientAutomation]:
        """
        Get all clients with morning briefing enabled within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of ClientAutomation instances
        """
        query = select(ClientAutomation).where(ClientAutomation.briefing_matinal == True)
        query = self._apply_tenant_filter(query)
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_clients_with_urgent_alerts_enabled(
        self,
        *,
        skip: int = 0,
        limit: int = 1000,
    ) -> list[ClientAutomation]:
        """
        Get all clients with urgent alerts enabled within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of ClientAutomation instances
        """
        query = select(ClientAutomation).where(ClientAutomation.alertas_urgentes == True)
        query = self._apply_tenant_filter(query)
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
