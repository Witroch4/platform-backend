"""Repository for Invoice (Fatura) management."""

from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.fatura import Fatura, StatusFatura
from domains.jusmonitoria.db.repositories.base import BaseRepository


class FaturaRepository(BaseRepository[Fatura]):
    """Repository for Invoice CRUD with tenant isolation."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(Fatura, session, tenant_id)

    async def list_by_contrato(self, contrato_id: UUID, skip: int = 0, limit: int = 50) -> list[Fatura]:
        """List invoices for a specific contract."""
        return await self.list(
            skip=skip, limit=limit,
            filters={"contrato_id": contrato_id},
            order_by="-data_vencimento",
        )

    async def list_overdue(self) -> list[Fatura]:
        """List all overdue unpaid invoices."""
        today = date.today()
        query = (
            select(Fatura)
            .where(Fatura.status == StatusFatura.PENDENTE)
            .where(Fatura.data_vencimento < today)
            .order_by(Fatura.data_vencimento)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_by_period(
        self,
        date_from: date,
        date_to: date,
        status: Optional[StatusFatura] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[Fatura], int]:
        """List invoices within a date range."""
        query = (
            select(Fatura)
            .where(Fatura.data_vencimento >= date_from)
            .where(Fatura.data_vencimento <= date_to)
        )
        query = self._apply_tenant_filter(query)

        if status:
            query = query.where(Fatura.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.session.execute(count_query)
        total = count_result.scalar_one()

        query = query.order_by(Fatura.data_vencimento.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def get_revenue_summary(self, date_from: date, date_to: date) -> dict:
        """Get revenue summary for a period."""
        query = self._apply_tenant_filter(select(Fatura))

        # Total faturado
        total_query = (
            select(func.sum(Fatura.valor))
            .where(Fatura.data_vencimento >= date_from)
            .where(Fatura.data_vencimento <= date_to)
        )
        total_query = self._apply_tenant_filter(total_query)
        total_result = await self.session.execute(total_query)
        total_faturado = total_result.scalar_one() or 0

        # Total recebido
        recebido_query = (
            select(func.sum(Fatura.valor_pago))
            .where(Fatura.status == StatusFatura.PAGA)
            .where(Fatura.data_pagamento.isnot(None))
            .where(Fatura.data_pagamento >= date_from)
            .where(Fatura.data_pagamento <= date_to)
        )
        recebido_query = self._apply_tenant_filter(recebido_query)
        recebido_result = await self.session.execute(recebido_query)
        total_recebido = recebido_result.scalar_one() or 0

        # A receber (pendentes)
        a_receber_query = (
            select(func.sum(Fatura.valor))
            .where(Fatura.status == StatusFatura.PENDENTE)
        )
        a_receber_query = self._apply_tenant_filter(a_receber_query)
        a_receber_result = await self.session.execute(a_receber_query)
        total_a_receber = a_receber_result.scalar_one() or 0

        # Em atraso
        today = date.today()
        atraso_query = (
            select(func.sum(Fatura.valor))
            .where(Fatura.status.in_([StatusFatura.PENDENTE, StatusFatura.VENCIDA]))
            .where(Fatura.data_vencimento < today)
        )
        atraso_query = self._apply_tenant_filter(atraso_query)
        atraso_result = await self.session.execute(atraso_query)
        total_em_atraso = atraso_result.scalar_one() or 0

        return {
            "total_faturado": float(total_faturado),
            "total_recebido": float(total_recebido),
            "total_a_receber": float(total_a_receber),
            "total_em_atraso": float(total_em_atraso),
        }

    async def mark_overdue(self) -> int:
        """Mark all overdue pending invoices as 'vencida'. Returns count updated."""
        from sqlalchemy import update
        today = date.today()
        query = (
            update(Fatura)
            .where(Fatura.status == StatusFatura.PENDENTE)
            .where(Fatura.data_vencimento < today)
            .where(Fatura.tenant_id == self.tenant_id)
            .values(status=StatusFatura.VENCIDA)
        )
        result = await self.session.execute(query)
        return result.rowcount

    async def check_existing(self, contrato_id: UUID, referencia: str) -> bool:
        """Check if an invoice already exists for a contract+reference."""
        query = (
            select(func.count(Fatura.id))
            .where(Fatura.contrato_id == contrato_id)
            .where(Fatura.referencia == referencia)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return result.scalar_one() > 0
