"""Business logic for contract management."""

import logging
from datetime import date
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.contrato import Contrato, StatusContrato
from domains.jusmonitoria.db.models.fatura import Fatura, StatusFatura
from domains.jusmonitoria.db.repositories.contrato import ContratoRepository
from domains.jusmonitoria.db.repositories.fatura import FaturaRepository

logger = logging.getLogger(__name__)


class ContratoService:
    """Service for contract business logic."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.contrato_repo = ContratoRepository(session, tenant_id)
        self.fatura_repo = FaturaRepository(session, tenant_id)

    async def criar_contrato(self, **data: Any) -> Contrato:
        """Create a new contract with auto-generated number."""
        numero = await self.contrato_repo.get_next_numero()
        data["numero_contrato"] = numero

        if "status" not in data:
            data["status"] = StatusContrato.RASCUNHO

        contrato = await self.contrato_repo.create(**data)
        logger.info(
            "contrato_criado",
            extra={
                "contrato_id": str(contrato.id),
                "numero": numero,
                "tenant_id": str(self.tenant_id),
            },
        )
        return contrato

    async def gerar_faturas_mes(
        self,
        ano: int,
        mes: int,
        contrato_id: Optional[UUID] = None,
    ) -> list[Fatura]:
        """Generate monthly invoices for active contracts.

        Args:
            ano: Year for the invoice
            mes: Month for the invoice
            contrato_id: If provided, generate only for this contract
        """
        if contrato_id:
            contrato = await self.contrato_repo.get(contrato_id)
            contratos = [contrato] if contrato and contrato.status == StatusContrato.ATIVO else []
        else:
            contratos = await self.contrato_repo.list_active()

        referencia = f"{ano:04d}-{mes:02d}"
        faturas_criadas = []

        for contrato in contratos:
            if not contrato.valor_mensal or contrato.valor_mensal <= 0:
                continue

            # Check if invoice already exists for this period
            exists = await self.fatura_repo.check_existing(contrato.id, referencia)
            if exists:
                continue

            # Calculate due date
            dia = min(contrato.dia_vencimento_fatura, 28)  # Safe for all months
            try:
                data_vencimento = date(ano, mes, dia)
            except ValueError:
                data_vencimento = date(ano, mes, 28)

            # Get next invoice number
            count = await self.fatura_repo.count(filters={"contrato_id": contrato.id})
            numero_fatura = f"{contrato.numero_contrato}-F{(count + 1):03d}"

            fatura = await self.fatura_repo.create(
                contrato_id=contrato.id,
                client_id=contrato.client_id,
                numero=numero_fatura,
                referencia=referencia,
                valor=contrato.valor_mensal,
                data_vencimento=data_vencimento,
                status=StatusFatura.PENDENTE,
            )
            faturas_criadas.append(fatura)

            logger.info(
                "fatura_gerada",
                extra={
                    "fatura_id": str(fatura.id),
                    "contrato_id": str(contrato.id),
                    "referencia": referencia,
                    "valor": str(contrato.valor_mensal),
                },
            )

        return faturas_criadas

    async def verificar_vencimentos(self, dias: int = 30) -> list[Contrato]:
        """Check for contracts expiring within the given days."""
        return await self.contrato_repo.list_expiring(dias)

    async def reajustar_contrato(
        self,
        contrato_id: UUID,
        percentual: Decimal,
    ) -> Contrato | None:
        """Apply price adjustment to a contract.

        Args:
            contrato_id: Contract ID
            percentual: Adjustment percentage (e.g., 5.5 for 5.5%)
        """
        contrato = await self.contrato_repo.get(contrato_id)
        if not contrato:
            return None

        fator = 1 + (percentual / 100)
        novo_valor = None

        if contrato.valor_mensal:
            novo_valor = round(contrato.valor_mensal * fator, 2)

        update_data: dict[str, Any] = {}
        if novo_valor is not None:
            update_data["valor_mensal"] = novo_valor

        if not update_data:
            return contrato

        updated = await self.contrato_repo.update(contrato_id, **update_data)
        if updated:
            logger.info(
                "contrato_reajustado",
                extra={
                    "contrato_id": str(contrato_id),
                    "percentual": str(percentual),
                    "novo_valor_mensal": str(novo_valor),
                },
            )
        return updated
