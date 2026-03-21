"""Comarcas (jurisdições PJe) sync task — periodic collection via Taskiq.

Replaces the old in-process scheduler that lived inside the scraper's lifespan.
Now runs as a proper Taskiq-scheduled task in the backend, calling the scraper
via HTTP (POST /comarcas/coletar) — the scraper stays "dumb".

Flow:
  1. Read configured tribunais from settings
  2. For each tribunal, check freshness via GET /api/v1/pje/jurisdicoes/status
  3. If stale or incomplete, trigger POST http://scraper:8001/comarcas/coletar
  4. Log results
"""

import logging
from datetime import UTC, datetime

from platform_core.config import settings
from domains.jusmonitoria.services.scraper_client import coletar_comarcas
from platform_core.db.sessions import session_ctx
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker

logger = logging.getLogger(__name__)


def _parse_tribunais() -> list[str]:
    """Parse COMARCAS_REFRESH_TRIBUNAIS into a deduplicated list."""
    raw = (settings.comarcas_refresh_tribunais or "trf1").strip().lower()
    if not raw:
        return ["trf1"]

    seen: list[str] = []
    for item in raw.split(","):
        t = item.strip()
        if t and t not in seen:
            seen.append(t)
    return seen or ["trf1"]


async def _check_tribunal_freshness(tribunal: str, interval_hours: int) -> dict:
    """Check if a tribunal's comarca data is fresh enough.

    Uses `coleta_completa` flag per row — deterministic, no heuristic.

    Returns: {needs_collection: bool, reason: str, age_hours: float|None}
    """
    try:
        from sqlalchemy import select, func
        from domains.jusmonitoria.db.models.tpu import PjeJurisdicao

        async with session_ctx() as session:
            # Total rows for this tribunal
            total_result = await session.execute(
                select(func.count(PjeJurisdicao.id))
                .where(PjeJurisdicao.tribunal == tribunal)
            )
            total = total_result.scalar() or 0

            if total == 0:
                return {
                    "needs_collection": True,
                    "reason": "sem coleta anterior",
                    "age_hours": None,
                }

            # Count incomplete rows
            incomplete_result = await session.execute(
                select(func.count(PjeJurisdicao.id))
                .where(PjeJurisdicao.tribunal == tribunal)
                .where(PjeJurisdicao.coleta_completa == False)  # noqa: E712
            )
            incomplete = incomplete_result.scalar() or 0

            # Latest collection timestamp
            ultima_coleta_result = await session.execute(
                select(func.max(PjeJurisdicao.coletado_em))
                .where(PjeJurisdicao.tribunal == tribunal)
            )
            ultima_coleta = ultima_coleta_result.scalar()

            age_hours = None
            if ultima_coleta:
                if ultima_coleta.tzinfo is None:
                    from datetime import timezone
                    ultima_coleta = ultima_coleta.replace(tzinfo=timezone.utc)
                age_hours = (datetime.now(UTC) - ultima_coleta).total_seconds() / 3600

            # Incomplete rows → force re-collection
            if incomplete > 0:
                return {
                    "needs_collection": True,
                    "reason": (
                        f"{incomplete}/{total} combos incompletos"
                        f"{f' — {age_hours:.1f}h' if age_hours is not None else ''}"
                    ),
                    "age_hours": age_hours,
                }

            # All complete + fresh → skip
            if age_hours is not None and age_hours < interval_hours:
                return {
                    "needs_collection": False,
                    "reason": f"todos {total} combos completos ({age_hours:.1f}h)",
                    "age_hours": age_hours,
                }

            # All complete but stale → re-collect
            return {
                "needs_collection": True,
                "reason": f"dados com {age_hours:.1f}h (threshold={interval_hours}h)",
                "age_hours": age_hours,
            }

    except Exception as e:
        logger.warning(
            "comarcas_freshness_check_error",
            extra={"tribunal": tribunal, "error": str(e)},
        )
        return {
            "needs_collection": True,
            "reason": f"erro ao verificar freshness: {e}",
            "age_hours": None,
        }


@broker.task
async def task_sync_comarcas() -> dict:
    """Scheduled task: check freshness and trigger comarca collection for configured tribunais.

    This is the Taskiq replacement for the old in-process scheduler in scraper/app/main.py.
    """
    interval_days = settings.comarcas_refresh_interval_days
    interval_hours = interval_days * 24

    if interval_hours <= 0:
        logger.info("comarcas_sync_disabled (COMARCAS_REFRESH_INTERVAL_DAYS=0)")
        return {"status": "disabled"}

    tribunais = _parse_tribunais()

    logger.info(
        "comarcas_sync_start",
        extra={
            "tribunais": tribunais,
            "interval_days": interval_days,
        },
    )

    results = {}

    for tribunal in tribunais:
        # 1. Check freshness
        check = await _check_tribunal_freshness(tribunal, interval_hours)

        if not check["needs_collection"]:
            logger.info(
                "comarcas_sync_skip",
                extra={"tribunal": tribunal, "reason": check["reason"]},
            )
            results[tribunal] = {"action": "skipped", "reason": check["reason"]}
            continue

        # 2. Trigger collection on scraper
        logger.info(
            "comarcas_sync_triggering",
            extra={"tribunal": tribunal, "reason": check["reason"]},
        )

        try:
            resp = await coletar_comarcas(
                tribunal=tribunal,
                coletar_classes=True,
                coletar_tipos_parte=True,
            )
            status = resp.get("status", "unknown")
            results[tribunal] = {
                "action": "triggered",
                "scraper_status": status,
                "reason": check["reason"],
            }
            logger.info(
                "comarcas_sync_triggered",
                extra={"tribunal": tribunal, "scraper_status": status},
            )
        except Exception as e:
            logger.error(
                "comarcas_sync_trigger_error",
                extra={"tribunal": tribunal, "error": str(e)},
            )
            results[tribunal] = {"action": "error", "error": str(e)}

    logger.info("comarcas_sync_complete", extra={"results": results})
    return {"status": "completed", "results": results}


async def sync_comarcas_scheduled() -> None:
    """Wrapper for the scheduler (zero-arg callable).

    The scheduler calls this; it dispatches via Taskiq broker for proper
    single-execution guarantee.
    """
    await task_sync_comarcas.kiq()
