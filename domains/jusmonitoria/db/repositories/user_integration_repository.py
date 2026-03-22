"""Repository for user integrations (OAuth tokens)."""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.user_integration import UserIntegration
from domains.jusmonitoria.db.repositories.base import BaseRepository


class UserIntegrationRepository(BaseRepository[UserIntegration]):
    """Repository for UserIntegration model."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(UserIntegration, session, tenant_id)

    async def get_by_user_and_type(
        self, user_id: UUID, integration_type: str
    ) -> Optional[UserIntegration]:
        """Get integration by user ID and type within tenant."""
        query = select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.integration_type == integration_type,
            UserIntegration.tenant_id == self.tenant_id,
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: UUID) -> list[UserIntegration]:
        """List all integrations for a user within tenant."""
        query = select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.tenant_id == self.tenant_id,
            UserIntegration.is_active == True,
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
