"""Repository for billing reminders/collections (Cobranca)."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.cobranca import Cobranca, StatusCobranca
from domains.jusmonitoria.db.repositories.base import BaseRepository


class CobrancaRepository(BaseRepository[Cobranca]):
    """Repository for billing collection CRUD with tenant isolation."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(Cobranca, session, tenant_id)

    async def list_pending(self, limit: int = 100) -> list[Cobranca]:
        """List pending collections ready to be sent."""
        now = datetime.now(timezone.utc)
        query = (
            select(Cobranca)
            .where(Cobranca.status == StatusCobranca.PENDENTE)
            .where(
                (Cobranca.data_agendada.is_(None)) | (Cobranca.data_agendada <= now)
            )
            .order_by(Cobranca.created_at)
            .limit(limit)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_by_fatura(self, fatura_id: UUID) -> list[Cobranca]:
        """List all collections for a specific invoice."""
        return await self.list(filters={"fatura_id": fatura_id}, order_by="-created_at")
