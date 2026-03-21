"""Service for OAB-scraped case management.

Supports two modes:
1. Pipeline (new) — 3-phase granular scraping via Taskiq tasks
2. Legacy        — monolithic scrape via oab_finder_service (deprecated)
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.services.oab_finder_service import consultar_oab  # legacy
from domains.jusmonitoria.db.models.user_oab import UserOAB
from domains.jusmonitoria.db.repositories.caso_oab import CasoOABRepository, OABSyncConfigRepository

logger = logging.getLogger(__name__)

# Cooldown between manual syncs (minutes)
MANUAL_SYNC_COOLDOWN_MINUTES = 5

# If a sync is "running" for more than this, consider it stuck and auto-reset
STALE_SYNC_TIMEOUT_MINUTES = 10


async def _do_oab_sync(
    session: AsyncSession,
    sync_config_id: UUID,
    sync_repo: OABSyncConfigRepository,
    caso_repo: CasoOABRepository,
    oab_numero: str,
    oab_uf: str,
    user_id: Optional[UUID] = None,
) -> dict:
    """Execute the actual scraping + upsert.  Assumes status is already 'running'."""
    result = await consultar_oab(oab_numero, oab_uf)

    if not result.get("sucesso"):
        erro = result.get("mensagem", "Erro desconhecido")
        await sync_repo.update(sync_config_id, status="error", erro_mensagem=erro)
        await session.commit()
        return {
            "sucesso": False,
            "mensagem": erro,
            "total": 0,
            "novos_processos": 0,
            "novas_movimentacoes": 0,
        }

    processos = result.get("processos", [])
    novos_processos = 0
    total_novas_mov = 0

    for proc in processos:
        numero = proc.get("numero", "")
        if not numero:
            continue

        caso_existia = await caso_repo.get_by_numero(numero) is not None
        _, novas_mov = await caso_repo.upsert_from_scraper(
            numero=numero,
            processo_data=proc,
            oab_numero=oab_numero,
            oab_uf=oab_uf,
            criado_por=user_id,
        )

        if not caso_existia:
            novos_processos += 1
        total_novas_mov += novas_mov

    await sync_repo.update(
        sync_config_id,
        status="idle",
        ultimo_sync=datetime.now(timezone.utc),
        total_processos=len(processos),
        erro_mensagem=None,
    )
    await session.commit()

    logger.info("oab_sync_completed", extra={
        "oab": f"{oab_uf}{oab_numero}",
        "total": len(processos),
        "novos_processos": novos_processos,
        "novas_movimentacoes": total_novas_mov,
    })

    return {
        "sucesso": True,
        "mensagem": f"{len(processos)} processos sincronizados.",
        "total": len(processos),
        "novos_processos": novos_processos,
        "novas_movimentacoes": total_novas_mov,
    }


async def sync_oab(
    session: AsyncSession,
    tenant_id: UUID,
    oab_numero: str,
    oab_uf: str,
    user_id: Optional[UUID] = None,
) -> dict:
    """Synchronous (blocking) OAB sync — used by scheduled workers.

    Returns dict with stats: {sucesso, total, novos_processos, novas_movimentacoes, mensagem}.
    """
    caso_repo = CasoOABRepository(session, tenant_id)
    sync_repo = OABSyncConfigRepository(session, tenant_id)

    sync_config = await sync_repo.get_or_create(oab_numero, oab_uf)

    # Skip cooldown for scheduled jobs (only manual triggers enforce it)
    await sync_repo.update(sync_config.id, status="running", erro_mensagem=None)
    await session.flush()

    logger.info("oab_sync_starting", extra={
        "tenant_id": str(tenant_id), "oab": f"{oab_uf}{oab_numero}",
    })

    return await _do_oab_sync(
        session, sync_config.id, sync_repo, caso_repo, oab_numero, oab_uf, user_id
    )


async def enqueue_sync_oab(
    session: AsyncSession,
    tenant_id: UUID,
    oab_numero: str,
    oab_uf: str,
    user_id: Optional[UUID] = None,
    nome_advogado: Optional[str] = None,
) -> dict:
    """Enqueue OAB sync as a background task — returns immediately.

    If nome_advogado is not provided but user_id is, fetches user.full_name
    to use as fallback for name-based search when OAB returns 0 results.

    Returns dict: {sucesso, mensagem, queued}.
    """
    # Resolve lawyer name from user profile if not explicitly provided
    if not nome_advogado and user_id:
        from domains.jusmonitoria.db.repositories.user_repository import UserRepository
        user_repo = UserRepository(session, tenant_id)
        user = await user_repo.get_by_id(user_id)
        if user and user.full_name:
            nome_advogado = user.full_name

    sync_repo = OABSyncConfigRepository(session, tenant_id)
    sync_config = await sync_repo.get_or_create(oab_numero, oab_uf, nome_advogado=nome_advogado)

    # Already running — don't queue again
    if sync_config.status == "running":
        return {
            "sucesso": True,
            "mensagem": "Sincronização já está em andamento.",
            "queued": False,
            "total": sync_config.total_processos,
            "novos_processos": 0,
            "novas_movimentacoes": 0,
        }

    # Cooldown for manual triggers
    if sync_config.ultimo_sync:
        elapsed = datetime.now(timezone.utc) - sync_config.ultimo_sync
        if elapsed < timedelta(minutes=MANUAL_SYNC_COOLDOWN_MINUTES):
            remaining = MANUAL_SYNC_COOLDOWN_MINUTES - int(elapsed.total_seconds() / 60)
            return {
                "sucesso": False,
                "mensagem": f"Aguarde {remaining} minuto(s) antes de sincronizar novamente.",
                "queued": False,
                "total": sync_config.total_processos,
                "novos_processos": 0,
                "novas_movimentacoes": 0,
            }

    # Mark running and commit so the worker sees the updated state
    await sync_repo.update(sync_config.id, status="running", erro_mensagem=None)
    await session.commit()

    # Dispatch to Taskiq worker (fire-and-forget) — use the new pipeline
    from domains.jusmonitoria.tasks.scrape_pipeline import task_orquestrar_pipeline  # local import avoids circular
    await task_orquestrar_pipeline.kiq(
        tenant_id_str=str(tenant_id),
        sync_config_id_str=str(sync_config.id),
        oab_numero=oab_numero,
        oab_uf=oab_uf,
        user_id_str=str(user_id) if user_id else None,
        nome_advogado=nome_advogado or sync_config.nome_advogado,
    )

    logger.info("oab_sync_enqueued", extra={
        "tenant_id": str(tenant_id), "oab": f"{oab_uf}{oab_numero}",
        "nome_advogado": nome_advogado or sync_config.nome_advogado,
    })

    return {
        "sucesso": True,
        "mensagem": "Sincronização iniciada em segundo plano.",
        "queued": True,
        "total": sync_config.total_processos,
        "novos_processos": 0,
        "novas_movimentacoes": 0,
    }


async def get_sync_status(
    session: AsyncSession,
    tenant_id: UUID,
    oab_numero: str,
    oab_uf: str,
) -> dict:
    """Get sync status for an OAB number.

    Auto-resets stale "running" syncs (worker crash / restart).
    """
    sync_repo = OABSyncConfigRepository(session, tenant_id)
    config = await sync_repo.get_by_oab(oab_numero, oab_uf)

    if not config:
        # Fallback: cases may exist from scraper pipeline without OABSyncConfig
        caso_repo = CasoOABRepository(session, tenant_id)
        summary = await caso_repo.get_sync_summary_by_oab(oab_numero, oab_uf)
        return {
            "ultimo_sync": summary["last_sync"],
            "status": "idle",
            "total_processos": summary["count"],
            "oab_numero": oab_numero,
            "oab_uf": oab_uf,
        }

    # Auto-reset stale sync: if running for too long, worker probably died
    if config.status == "running" and config.updated_at:
        elapsed = datetime.now(timezone.utc) - config.updated_at.replace(tzinfo=timezone.utc)
        if elapsed > timedelta(minutes=STALE_SYNC_TIMEOUT_MINUTES):
            logger.warning("stale_sync_auto_reset", extra={
                "oab": f"{oab_uf}{oab_numero}",
                "stuck_for_minutes": int(elapsed.total_seconds() / 60),
            })
            await sync_repo.update(
                config.id,
                status="idle",
                erro_mensagem="Sincronização interrompida (timeout). Tente novamente.",
            )
            await session.commit()
            await session.refresh(config)

    ultimo_sync = config.ultimo_sync
    total_processos = config.total_processos

    # Fallback: config exists but ultimo_sync not set (e.g. sync was queued but never completed)
    if not ultimo_sync:
        caso_repo = CasoOABRepository(session, tenant_id)
        summary = await caso_repo.get_sync_summary_by_oab(oab_numero, oab_uf)
        ultimo_sync = summary["last_sync"]
        if summary["count"] > (total_processos or 0):
            total_processos = summary["count"]

    return {
        "ultimo_sync": ultimo_sync,
        "status": config.status,
        "total_processos": total_processos,
        "oab_numero": config.oab_numero,
        "oab_uf": config.oab_uf,
        "progresso_detalhado": config.progresso_detalhado,
    }


async def cancel_sync(
    session: AsyncSession,
    tenant_id: UUID,
    oab_numero: str,
    oab_uf: str,
) -> dict:
    """Cancel a running sync by resetting status to idle."""
    sync_repo = OABSyncConfigRepository(session, tenant_id)
    config = await sync_repo.get_by_oab(oab_numero, oab_uf)

    if not config:
        return {"sucesso": False, "mensagem": "Nenhuma sincronização encontrada."}

    if config.status != "running":
        return {"sucesso": False, "mensagem": "Nenhuma sincronização em andamento."}

    await sync_repo.update(
        config.id,
        status="idle",
        erro_mensagem="Cancelado pelo usuário.",
        progresso_detalhado=None,
    )
    await session.commit()

    logger.info("sync_cancelled_by_user", extra={"oab": f"{oab_uf}{oab_numero}"})

    return {"sucesso": True, "mensagem": "Sincronização cancelada."}


async def enqueue_sync_all_oabs(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
) -> dict:
    """Enqueue sync for ALL active OABs of the current user.

    Iterates through user_oabs and enqueues a pipeline for each one.
    Respects cooldowns and skips OABs already running.
    Returns summary with per-OAB results.
    """
    result = await session.execute(
        select(UserOAB).where(
            UserOAB.tenant_id == tenant_id,
            UserOAB.user_id == user_id,
            UserOAB.ativo.is_(True),
        )
    )
    user_oabs = list(result.scalars().all())

    if not user_oabs:
        return {
            "sucesso": False,
            "mensagem": "Nenhuma OAB ativa encontrada. Cadastre suas OABs no perfil.",
            "total_oabs": 0,
            "enqueued": 0,
            "skipped": 0,
            "details": [],
        }

    enqueued = 0
    skipped = 0
    details: list[dict] = []

    for oab in user_oabs:
        oab_result = await enqueue_sync_oab(
            session=session,
            tenant_id=tenant_id,
            oab_numero=oab.oab_numero,
            oab_uf=oab.oab_uf,
            user_id=user_id,
            nome_advogado=oab.nome_advogado,
        )
        if oab_result.get("queued"):
            enqueued += 1
        else:
            skipped += 1
        details.append({
            "oab_numero": oab.oab_numero,
            "oab_uf": oab.oab_uf,
            **oab_result,
        })

    return {
        "sucesso": True,
        "mensagem": f"{enqueued} OAB(s) sincronizando, {skipped} ignorada(s).",
        "total_oabs": len(user_oabs),
        "enqueued": enqueued,
        "skipped": skipped,
        "details": details,
    }


async def get_all_sync_statuses(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
) -> list[dict]:
    """Get sync status for ALL active OABs of the current user."""
    result = await session.execute(
        select(UserOAB).where(
            UserOAB.tenant_id == tenant_id,
            UserOAB.user_id == user_id,
            UserOAB.ativo.is_(True),
        )
    )
    user_oabs = list(result.scalars().all())

    statuses = []
    for oab in user_oabs:
        status = await get_sync_status(session, tenant_id, oab.oab_numero, oab.oab_uf)
        status["is_primary"] = oab.is_primary
        statuses.append(status)

    return statuses
