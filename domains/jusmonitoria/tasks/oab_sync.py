"""OAB Scraper sync worker task.

Runs 2x/day to sync all OAB cases across tenants.
Rate-limited to avoid overwhelming tribunals.

Two sync modes:
- sync_oab_background: legacy monolithic (deprecated, kept for backward compat)
- task_orquestrar_pipeline: new 3-phase pipeline (preferred)
"""

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select

from domains.jusmonitoria.db.session_compat import AsyncSessionLocal
from domains.jusmonitoria.db.models.oab_sync_config import OABSyncConfig
from domains.jusmonitoria.db.models.tenant import Tenant
from domains.jusmonitoria.db.models.user_oab import UserOAB
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker

logger = logging.getLogger(__name__)


@broker.task
async def sync_oab_background(
    tenant_id_str: str,
    oab_numero: str,
    oab_uf: str,
    user_id_str: str | None = None,
) -> dict:
    """DEPRECATED legacy background task — kept for in-flight jobs.

    New callers should use task_orquestrar_pipeline instead.
    """
    from domains.jusmonitoria.services.caso_oab_service import _do_oab_sync
    from domains.jusmonitoria.db.repositories.caso_oab import CasoOABRepository, OABSyncConfigRepository

    tenant_id = UUID(tenant_id_str)
    user_id = UUID(user_id_str) if user_id_str else None

    async with AsyncSessionLocal() as session:
        caso_repo = CasoOABRepository(session, tenant_id)
        sync_repo = OABSyncConfigRepository(session, tenant_id)

        sync_config = await sync_repo.get_by_oab(oab_numero, oab_uf)
        if not sync_config:
            logger.error("sync_oab_background_config_missing",
                         extra={"oab": oab_numero, "uf": oab_uf})
            return {}

        try:
            result = await _do_oab_sync(
                session, sync_config.id, sync_repo, caso_repo,
                oab_numero, oab_uf, user_id,
            )
        except Exception as exc:
            logger.exception("sync_oab_background_error",
                             extra={"oab": oab_numero, "uf": oab_uf, "error": str(exc)})
            await sync_repo.update(sync_config.id, status="error", erro_mensagem=str(exc))
            await session.commit()
            return {}

        logger.info("sync_oab_background_done",
                    extra={"tenant_id": tenant_id_str, "oab": oab_numero, "result": result})
        return result

# Delay between scrapes of different OABs (seconds)
INTER_OAB_DELAY = 30


async def _ensure_sync_configs_for_user_oabs(session) -> None:
    """Garante que cada UserOAB ativa tenha um OABSyncConfig correspondente.

    Cria registros faltantes sem sobrescrever os existentes.
    Usado como pré-passo do sync agendado para manter consistência entre as tabelas.
    """
    from domains.jusmonitoria.db.repositories.caso_oab import OABSyncConfigRepository

    # Busca todas as UserOABs ativas agrupadas por (tenant_id, oab_numero, oab_uf)
    result = await session.execute(
        select(UserOAB).where(UserOAB.ativo.is_(True))
    )
    user_oabs = list(result.scalars().all())

    if not user_oabs:
        return

    # Agrupar por tenant para evitar N queries no OABSyncConfig
    tenant_oabs: dict[str, list[UserOAB]] = {}
    for user_oab in user_oabs:
        key = str(user_oab.tenant_id)
        tenant_oabs.setdefault(key, []).append(user_oab)

    from uuid import UUID

    for tenant_id_str, oabs in tenant_oabs.items():
        tenant_id = UUID(tenant_id_str)
        sync_repo = OABSyncConfigRepository(session, tenant_id)

        for user_oab in oabs:
            existing = await sync_repo.get_by_oab(user_oab.oab_numero, user_oab.oab_uf)
            if not existing:
                await sync_repo.get_or_create(
                    user_oab.oab_numero,
                    user_oab.oab_uf,
                    nome_advogado=user_oab.nome_advogado,
                )
                logger.info(
                    "oab_sync_config_auto_created",
                    extra={
                        "tenant_id": tenant_id_str,
                        "oab": f"{user_oab.oab_uf}{user_oab.oab_numero}",
                    },
                )


async def sync_all_oab_jobs() -> dict:
    """Scheduled task: sync all active OAB configs across tenants.

    Groups by (oab_numero, oab_uf) to avoid duplicate scrapes for the same OAB.
    Processes sequentially with delays to respect TRF1 rate limits.

    Também garante consistência: cria OABSyncConfig para qualquer UserOAB ativa
    que ainda não tenha um registro de sync correspondente.
    """
    from platform_core.config import settings

    if not settings.oab_scraper_sync_enabled:
        logger.info("oab_scraper_sync_disabled (OAB_SCRAPER_SYNC_ENABLED=false)")
        return {"status": "disabled", "oabs_synced": 0, "total_processos": 0}

    logger.info("oab_sync_all_starting")

    async with AsyncSessionLocal() as session:
        # Garantir consistência: criar OABSyncConfig para UserOABs sem sync config
        await _ensure_sync_configs_for_user_oabs(session)
        await session.commit()

        # Get all active sync configs across all tenants
        result = await session.execute(
            select(OABSyncConfig).where(OABSyncConfig.status != "disabled")
        )
        configs = list(result.scalars().all())

        if not configs:
            logger.info("oab_sync_no_configs")
            return {"oabs_synced": 0, "total_processos": 0}

        # Group by (oab_numero, oab_uf) to deduplicate across tenants
        oab_groups: dict[tuple[str, str], list[OABSyncConfig]] = {}
        for config in configs:
            key = (config.oab_numero, config.oab_uf)
            oab_groups.setdefault(key, []).append(config)

        logger.info("oab_sync_groups", extra={
            "unique_oabs": len(oab_groups),
            "total_configs": len(configs),
        })

        stats = {"oabs_synced": 0, "total_processos": 0, "errors": 0}

        for (oab_numero, oab_uf), tenant_configs in oab_groups.items():
            try:
                await _sync_oab_for_tenants(session, oab_numero, oab_uf, tenant_configs)
                stats["oabs_synced"] += 1
            except Exception as e:
                logger.error("oab_sync_error", extra={
                    "oab": f"{oab_uf}{oab_numero}",
                    "error": str(e),
                })
                stats["errors"] += 1

            # Rate limit between different OABs
            if len(oab_groups) > 1:
                await asyncio.sleep(INTER_OAB_DELAY)

        logger.info("oab_sync_all_completed", extra=stats)
        return stats


async def _sync_oab_for_tenants(
    session,
    oab_numero: str,
    oab_uf: str,
    configs: list[OABSyncConfig],
) -> None:
    """Enqueue the pipeline for each tenant that uses this OAB.

    Uses the new 3-phase pipeline instead of the monolithic scrape.
    """
    from domains.jusmonitoria.tasks.scrape_pipeline import task_orquestrar_pipeline
    from domains.jusmonitoria.db.repositories.caso_oab import OABSyncConfigRepository

    for config in configs:
        try:
            # Mark running
            sync_repo = OABSyncConfigRepository(session, config.tenant_id)
            await sync_repo.update(config.id, status="running", erro_mensagem=None)
            await session.commit()

            # Dispatch pipeline (pass stored lawyer name for name-based fallback)
            await task_orquestrar_pipeline.kiq(
                tenant_id_str=str(config.tenant_id),
                sync_config_id_str=str(config.id),
                oab_numero=oab_numero,
                oab_uf=oab_uf,
                nome_advogado=config.nome_advogado,
            )
            logger.info("oab_sync_tenant_enqueued", extra={
                "tenant_id": str(config.tenant_id),
                "oab": f"{oab_uf}{oab_numero}",
            })
        except Exception as e:
            logger.error("oab_sync_tenant_error", extra={
                "tenant_id": str(config.tenant_id),
                "oab": f"{oab_uf}{oab_numero}",
                "error": str(e),
            })
