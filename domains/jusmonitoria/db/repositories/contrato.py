"""Repository for Contract management."""

from datetime import date, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.contrato import Contrato, StatusContrato
from domains.jusmonitoria.db.repositories.base import BaseRepository


class ContratoRepository(BaseRepository[Contrato]):
    """Repository for Contract CRUD with tenant isolation."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(Contrato, session, tenant_id)

    async def get_by_numero(self, numero_contrato: str) -> Contrato | None:
        """Get contract by number within tenant."""
        query = (
            select(Contrato)
            .where(Contrato.numero_contrato == numero_contrato)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_client(self, client_id: UUID, skip: int = 0, limit: int = 50) -> list[Contrato]:
        """List contracts for a specific client."""
        return await self.list(skip=skip, limit=limit, filters={"client_id": client_id})

    async def list_by_status(self, status: StatusContrato, skip: int = 0, limit: int = 50) -> list[Contrato]:
        """List contracts by status."""
        return await self.list(skip=skip, limit=limit, filters={"status": status})

    async def list_expiring(self, days: int = 30) -> list[Contrato]:
        """List contracts expiring within the given number of days."""
        today = date.today()
        deadline = today + timedelta(days=days)
        query = (
            select(Contrato)
            .where(Contrato.status == StatusContrato.ATIVO)
            .where(Contrato.data_vencimento.isnot(None))
            .where(Contrato.data_vencimento <= deadline)
            .where(Contrato.data_vencimento >= today)
            .order_by(Contrato.data_vencimento)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_active(self) -> list[Contrato]:
        """List all active contracts."""
        return await self.list(filters={"status": StatusContrato.ATIVO}, limit=1000)

    async def count_by_status(self) -> dict[str, int]:
        """Count contracts grouped by status."""
        query = (
            select(Contrato.status, func.count(Contrato.id))
            .group_by(Contrato.status)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return {row[0]: row[1] for row in result.all()}

    async def get_next_numero(self) -> str:
        """Generate the next contract number for this tenant."""
        query = (
            select(func.count(Contrato.id))
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        count = result.scalar_one()
        year = date.today().year
        return f"CTR-{year}-{(count + 1):04d}"

    async def search(
        self,
        *,
        search: Optional[str] = None,
        status: Optional[StatusContrato] = None,
        client_id: Optional[UUID] = None,
        assigned_to: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Contrato], int]:
        """Search contracts with filters, returns (items, total)."""
        query = select(Contrato)
        query = self._apply_tenant_filter(query)

        if status:
            query = query.where(Contrato.status == status)
        if client_id:
            query = query.where(Contrato.client_id == client_id)
        if assigned_to:
            query = query.where(Contrato.assigned_to == assigned_to)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    Contrato.titulo.ilike(pattern),
                    Contrato.numero_contrato.ilike(pattern),
                    Contrato.descricao.ilike(pattern),
                )
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.session.execute(count_query)
        total = count_result.scalar_one()

        # Paginate
        query = query.order_by(Contrato.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        items = list(result.scalars().all())

        return items, total
