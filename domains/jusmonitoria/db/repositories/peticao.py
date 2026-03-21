"""Repositories for petition management."""

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.peticao import (
    Peticao,
    PeticaoDocumento,
    PeticaoEvento,
    PeticaoStatus,
)
from domains.jusmonitoria.db.repositories.base import BaseRepository


class PeticaoRepository(BaseRepository[Peticao]):
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(Peticao, session, tenant_id)

    async def list_filtered(
        self,
        *,
        search: str | None = None,
        status: PeticaoStatus | None = None,
        tribunal_id: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Peticao], int]:
        """List petitions with optional filters. Returns (items, total)."""
        base = select(Peticao)
        base = self._apply_tenant_filter(base)

        if search:
            search_term = f"%{search}%"
            base = base.where(
                or_(
                    Peticao.assunto.ilike(search_term),
                    Peticao.processo_numero.ilike(search_term),
                    Peticao.numero_protocolo.ilike(search_term),
                )
            )
        if status:
            base = base.where(Peticao.status == status)
        if tribunal_id:
            base = base.where(Peticao.tribunal_id == tribunal_id)

        # Count
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()

        # Items
        items_q = base.order_by(Peticao.created_at.desc()).offset(skip).limit(limit)
        items = list((await self.session.execute(items_q)).scalars().all())

        return items, total


class PeticaoDocumentoRepository(BaseRepository[PeticaoDocumento]):
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(PeticaoDocumento, session, tenant_id)

    async def list_by_peticao(self, peticao_id: UUID) -> list[PeticaoDocumento]:
        """List documents for a petition, ordered by ordem."""
        q = (
            select(PeticaoDocumento)
            .where(PeticaoDocumento.peticao_id == peticao_id)
            .order_by(PeticaoDocumento.ordem)
        )
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return list(result.scalars().all())


class PeticaoEventoRepository(BaseRepository[PeticaoEvento]):
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(PeticaoEvento, session, tenant_id)

    async def list_by_peticao(self, peticao_id: UUID) -> list[PeticaoEvento]:
        """List events for a petition, ordered by creation time."""
        q = (
            select(PeticaoEvento)
            .where(PeticaoEvento.peticao_id == peticao_id)
            .order_by(PeticaoEvento.created_at)
        )
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return list(result.scalars().all())
