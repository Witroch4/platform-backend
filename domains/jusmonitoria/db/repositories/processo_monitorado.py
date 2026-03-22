"""Repository for monitored legal processes."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.processo_monitorado import ProcessoMonitorado
from domains.jusmonitoria.db.repositories.base import BaseRepository


class ProcessoMonitoradoRepository(BaseRepository[ProcessoMonitorado]):
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(ProcessoMonitorado, session, tenant_id)

    async def list_all(
        self,
        *,
        skip: int = 0,
        limit: int = 200,
    ) -> tuple[list[ProcessoMonitorado], int]:
        """List all monitored processes for tenant. Returns (items, total)."""
        base = select(ProcessoMonitorado)
        base = self._apply_tenant_filter(base)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()

        items_q = base.order_by(ProcessoMonitorado.created_at.desc()).offset(skip).limit(limit)
        items = list((await self.session.execute(items_q)).scalars().all())

        return items, total

    async def get_by_numero(self, numero: str) -> ProcessoMonitorado | None:
        """Find a monitored process by its number."""
        clean = numero.replace(".", "").replace("-", "").replace(" ", "")
        q = select(ProcessoMonitorado).where(ProcessoMonitorado.numero == clean)
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return result.scalar_one_or_none()

    async def atualizar_datajud(
        self,
        id: UUID,
        dados: dict,
        total_movimentacoes: int,
    ) -> ProcessoMonitorado | None:
        """Update DataJud data and detect new movements."""
        existing = await self.get(id)
        if not existing:
            return None

        novas = 0
        if existing.movimentacoes_conhecidas > 0 and total_movimentacoes > existing.movimentacoes_conhecidas:
            novas = total_movimentacoes - existing.movimentacoes_conhecidas

        return await self.update(
            id,
            dados_datajud=dados,
            ultima_consulta=datetime.now(timezone.utc),
            movimentacoes_conhecidas=total_movimentacoes,
            novas_movimentacoes=existing.novas_movimentacoes + novas,
        )

    async def marcar_visto(self, id: UUID) -> ProcessoMonitorado | None:
        """Reset new movements counter."""
        return await self.update(id, novas_movimentacoes=0)

    async def precisam_atualizar(self, horas: int = 12) -> list[ProcessoMonitorado]:
        """Return processes not consulted in the last N hours."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=horas)
        q = select(ProcessoMonitorado).where(
            (ProcessoMonitorado.ultima_consulta.is_(None))
            | (ProcessoMonitorado.ultima_consulta < cutoff)
        )
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return list(result.scalars().all())
