"""
Contract management worker tasks.

Handles recurring invoice generation, overdue checks, and collection notices.
"""

import structlog
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select, distinct

from platform_core.db.sessions import AsyncSessionLocal
from domains.jusmonitoria.db.models.contrato import Contrato, StatusContrato
from domains.jusmonitoria.db.models.fatura import Fatura, StatusFatura
from domains.jusmonitoria.services.contrato_service import ContratoService
from domains.jusmonitoria.services.cobranca_service import CobrancaService
from domains.jusmonitoria.db.repositories.contrato import ContratoRepository
from domains.jusmonitoria.db.repositories.fatura import FaturaRepository
from domains.jusmonitoria.db.repositories.cobranca import CobrancaRepository

logger = structlog.get_logger(__name__)


async def check_vencimentos() -> None:
    """
    Daily task: check for overdue invoices and expiring contracts.

    - Marks pending invoices past due date as 'vencida'
    - Schedules collection notices for overdue invoices
    - Checks contracts expiring in 30/15/7 days
    - Updates expired active contracts to 'vencido' status
    """
    logger.info("check_vencimentos_started")

    async with AsyncSessionLocal() as session:
        # Get all tenant IDs with contracts
        result = await session.execute(
            select(distinct(Contrato.tenant_id))
        )
        tenant_ids = [row[0] for row in result.all()]

        for tenant_id in tenant_ids:
            try:
                await _check_tenant_vencimentos(session, tenant_id)
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(
                    "check_vencimentos_tenant_error",
                    tenant_id=str(tenant_id),
                    error=str(e),
                )

    logger.info("check_vencimentos_completed", tenants_processed=len(tenant_ids))


async def _check_tenant_vencimentos(session, tenant_id: UUID) -> None:
    """Process vencimentos for a single tenant."""
    fatura_repo = FaturaRepository(session, tenant_id)
    contrato_repo = ContratoRepository(session, tenant_id)
    cobranca_service = CobrancaService(session, tenant_id)

    # 1. Mark overdue invoices
    await fatura_repo.mark_overdue()

    # 2. Schedule collection notices for overdue invoices
    overdue_faturas = await fatura_repo.list_overdue()
    for fatura in overdue_faturas:
        try:
            await cobranca_service.agendar_cobrancas_contrato(fatura.contrato_id)
        except Exception as e:
            logger.warning(
                "cobranca_scheduling_error",
                fatura_id=str(fatura.id),
                error=str(e),
            )

    # 3. Check expiring contracts and update expired ones
    contrato_service = ContratoService(session, tenant_id)
    await contrato_service.verificar_vencimentos()

    logger.info(
        "tenant_vencimentos_processed",
        tenant_id=str(tenant_id),
        overdue_faturas=len(overdue_faturas),
    )


async def gerar_faturas_recorrentes() -> None:
    """
    Monthly task (1st of month): generate recurring invoices for active contracts.

    For each active contract with valor_mensal > 0, creates an invoice
    for the current month if one doesn't already exist.
    """
    logger.info("gerar_faturas_recorrentes_started")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(distinct(Contrato.tenant_id))
        )
        tenant_ids = [row[0] for row in result.all()]

        total_generated = 0
        for tenant_id in tenant_ids:
            try:
                contrato_service = ContratoService(session, tenant_id)
                generated = await contrato_service.gerar_faturas_mes()
                total_generated += generated
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(
                    "gerar_faturas_tenant_error",
                    tenant_id=str(tenant_id),
                    error=str(e),
                )

    logger.info(
        "gerar_faturas_recorrentes_completed",
        total_generated=total_generated,
        tenants_processed=len(tenant_ids),
    )


async def enviar_cobrancas_pendentes() -> None:
    """
    Daily task: send all pending collection notices via Chatwit.

    Processes all cobrancas with status=pendente across all tenants.
    """
    logger.info("enviar_cobrancas_pendentes_started")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(distinct(Contrato.tenant_id))
        )
        tenant_ids = [row[0] for row in result.all()]

        total_sent = 0
        total_failed = 0
        for tenant_id in tenant_ids:
            try:
                cobranca_service = CobrancaService(session, tenant_id)
                sent, failed = await cobranca_service.processar_cobrancas_pendentes()
                total_sent += sent
                total_failed += failed
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(
                    "enviar_cobrancas_tenant_error",
                    tenant_id=str(tenant_id),
                    error=str(e),
                )

    logger.info(
        "enviar_cobrancas_pendentes_completed",
        total_sent=total_sent,
        total_failed=total_failed,
        tenants_processed=len(tenant_ids),
    )
