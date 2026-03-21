"""Repository for financial transactions (Lancamento)."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.lancamento import Lancamento
from domains.jusmonitoria.db.repositories.base import BaseRepository


class LancamentoRepository(BaseRepository[Lancamento]):
    """Repository for financial transaction CRUD with tenant isolation."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(Lancamento, session, tenant_id)

    async def list_by_contrato(self, contrato_id: UUID, skip: int = 0, limit: int = 50) -> list[Lancamento]:
        """List transactions for a specific contract."""
        return await self.list(
            skip=skip, limit=limit,
            filters={"contrato_id": contrato_id},
            order_by="-data_lancamento",
        )
