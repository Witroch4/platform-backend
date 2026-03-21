"""Scrape pipeline tasks — orchestrate 3-phase granular scraping via Taskiq.

Architecture:
  task_orquestrar_pipeline(sync_config_id)
    ├─ For each tribunal applicable to the UF:
    │   └─ task_listar_processos(sync_config_id, tribunal)
    │       ├─ For each processo found:
    │       │   └─ task_detalhar_processo(sync_config_id, tribunal, numero)
    │       │       ├─ Upsert processo (partes, movimentações)
    │       │       └─ For each doc_link:
    │       │           └─ task_baixar_documento(sync_config_id, tribunal, numero, doc_url)
    │       │               └─ Attach doc to processo
    └─ Mark sync complete

Each task is atomic and independently retryable via ScrapeJob tracking.
Progress is broadcast to connected WebSocket clients after each step.
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from domains.jusmonitoria.services.scraper_client import baixar_documento, detalhar_processo, listar_processos
from domains.jusmonitoria.db.session_compat import AsyncSessionLocal
from domains.jusmonitoria.db.repositories.caso_oab import CasoOABRepository, OABSyncConfigRepository
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker

logger = logging.getLogger(__name__)

# Delay between pipeline operations to avoid overloading the scraper
DELAY_BETWEEN_TRIBUNALS = 10  # seconds
DELAY_BETWEEN_PROCESSES = 5   # seconds
DELAY_BETWEEN_DOCUMENTS = 3   # seconds
SCRAPER_ALERT_FAILURE_RATE_THRESHOLD = 0.5

# Mapping: UF → list of tribunals to search
# All federal TRFs — lawyers can have cases in ANY federal tribunal regardless of OAB state
_ALL_TRFS = ["trf1", "trf3", "trf5", "trf6"]

UF_TRIBUNAIS = {
    # Ceará: estadual + ALL federal (lawyer can have cases anywhere)
    "CE": ["tjce", "tjce2g"] + _ALL_TRFS,
    "PE": _ALL_TRFS,
    "AL": _ALL_TRFS,
    "SE": _ALL_TRFS,
    "RN": _ALL_TRFS,
    "PB": _ALL_TRFS,
    "BA": _ALL_TRFS,
    "MG": _ALL_TRFS,
    "GO": _ALL_TRFS,
    "DF": _ALL_TRFS,
    "MT": _ALL_TRFS,
    "TO": _ALL_TRFS,
    "PA": _ALL_TRFS,
    "AM": _ALL_TRFS,
    "MA": _ALL_TRFS,
    "PI": _ALL_TRFS,
    "AP": _ALL_TRFS,
    "RR": _ALL_TRFS,
    "AC": _ALL_TRFS,
    "RO": _ALL_TRFS,
    "RJ": _ALL_TRFS,
    "ES": _ALL_TRFS,
    "SP": _ALL_TRFS,
    "MS": _ALL_TRFS,
    "RS": _ALL_TRFS,
    "SC": _ALL_TRFS,
    "PR": _ALL_TRFS,
}


def _get_tribunais_for_uf(uf: str) -> list[str]:
    """Return the list of tribunal codes to search for a given UF."""
    return UF_TRIBUNAIS.get(uf.upper(), ["trf1"])


# ──────────────────────────────────────────────────────────────────
# WebSocket progress helper
# ──────────────────────────────────────────────────────────────────

async def _broadcast_progress(tenant_id: UUID, sync_config_id: UUID, data: dict) -> None:
    """Broadcast pipeline progress to WebSocket clients."""
    try:
        # Import here to avoid circular imports (websocket module imports models)
        from domains.jusmonitoria.api.v1.websocket import manager
        await manager.broadcast_to_tenant(
            {
                "type": "oab_sync_progress",
                "sync_config_id": str(sync_config_id),
                "data": data,
            },
            tenant_id,
        )
    except Exception as e:
        logger.debug(f"ws_broadcast_error: {e}")


def _should_emit_scraper_alert(
    total_tribunals: int,
    error_count: int,
    blocked_count: int,
) -> bool:
    """Raise an operational alert when scraper failures spike."""
    if total_tribunals <= 0:
        return False

    failure_count = error_count + blocked_count
    failure_rate = failure_count / total_tribunals

    return (
        blocked_count > 0
        or error_count == total_tribunals
        or failure_rate >= SCRAPER_ALERT_FAILURE_RATE_THRESHOLD
    )


async def _emit_scraper_alert(
    tenant_id: UUID,
    sync_config_id: UUID,
    oab_numero: str,
    oab_uf: str,
    total_tribunals: int,
    errors: list[dict[str, str]],
    blocked_count: int,
) -> None:
    """Emit a critical operational alert for scraper instability."""
    failure_count = len(errors) + blocked_count
    failure_rate = round((failure_count / total_tribunals) * 100, 2) if total_tribunals else 0.0
    payload = {
        "type": "oab_sync_alert",
        "severity": "critical" if len(errors) == total_tribunals else "warning",
        "oab": f"{oab_uf}{oab_numero}",
        "sync_config_id": str(sync_config_id),
        "blocked_count": blocked_count,
        "error_count": len(errors),
        "failure_rate": failure_rate,
        "errors": errors,
    }

    logger.critical("scraper_failure_spike", extra=payload)
    await _broadcast_progress(tenant_id, sync_config_id, payload)


# ──────────────────────────────────────────────────────────────────
# Task 1: Orchestrator
# ──────────────────────────────────────────────────────────────────

@broker.task
async def task_orquestrar_pipeline(
    tenant_id_str: str,
    sync_config_id_str: str,
    oab_numero: str,
    oab_uf: str,
    tribunais: list[str] | None = None,
    user_id_str: str | None = None,
    nome_advogado: str | None = None,
) -> dict:
    """Top-level orchestrator — kicks off Phase 1 for each tribunal.

    This is the entry point. It replaces the old monolithic sync_oab_background.
    nome_advogado is used as fallback when OAB search returns 0 results.
    """
    tenant_id = UUID(tenant_id_str)
    sync_config_id = UUID(sync_config_id_str)

    if not tribunais:
        tribunais = _get_tribunais_for_uf(oab_uf)

    logger.info("pipeline_start", extra={
        "oab": f"{oab_uf}{oab_numero}",
        "tribunais": tribunais,
        "sync_config_id": sync_config_id_str,
    })

    async with AsyncSessionLocal() as session:
        sync_repo = OABSyncConfigRepository(session, tenant_id)

        # Update progress
        await sync_repo.update(
            sync_config_id,
            status="running",
            erro_mensagem=None,
            progresso_detalhado={
                "fase_atual": "listing",
                "tribunais": tribunais,
                "tribunais_status": dict.fromkeys(tribunais, "pending"),
                "total_processos": 0,
                "processados": 0,
                "total_docs": 0,
                "docs_baixados": 0,
            },
        )
        await session.commit()

    await _broadcast_progress(tenant_id, sync_config_id, {
        "fase": "starting",
        "tribunais": tribunais,
    })

    total_processos = 0
    total_novos = 0
    total_mov = 0
    total_docs = 0
    errors = []
    blocked_count = 0

    for i, tribunal in enumerate(tribunais):
        # Check if sync was cancelled by user before each tribunal
        async with AsyncSessionLocal() as check_session:
            check_repo = OABSyncConfigRepository(check_session, tenant_id)
            config = await check_repo.get(sync_config_id)
            if config and config.status != "running":
                logger.info("pipeline_cancelled", extra={
                    "oab": f"{oab_uf}{oab_numero}",
                    "cancelled_at_tribunal": tribunal,
                })
                return {
                    "sucesso": False,
                    "total": total_processos,
                    "novos_processos": total_novos,
                    "novas_movimentacoes": total_mov,
                    "docs_baixados": total_docs,
                    "blocked_count": blocked_count,
                    "errors": errors,
                    "cancelled": True,
                }

        try:
            result = await _pipeline_tribunal(
                tenant_id=tenant_id,
                sync_config_id=sync_config_id,
                oab_numero=oab_numero,
                oab_uf=oab_uf,
                tribunal=tribunal,
                user_id_str=user_id_str,
                nome_advogado=nome_advogado,
            )
            total_processos += result.get("total", 0)
            total_novos += result.get("novos_processos", 0)
            total_mov += result.get("novas_movimentacoes", 0)
            total_docs += result.get("docs_baixados", 0)
            if result.get("blocked"):
                blocked_count += 1
        except Exception as e:
            logger.error(f"pipeline_tribunal_error tribunal={tribunal} error={e}")
            errors.append({"tribunal": tribunal, "error": str(e)})

        if i < len(tribunais) - 1:
            await asyncio.sleep(DELAY_BETWEEN_TRIBUNALS)

    # Mark sync complete
    async with AsyncSessionLocal() as session:
        sync_repo = OABSyncConfigRepository(session, tenant_id)
        final_status = "idle" if not errors else ("error" if len(errors) == len(tribunais) else "idle")
        erro_msg = "; ".join(f"{e['tribunal']}: {e['error']}" for e in errors) if errors else None

        await sync_repo.update(
            sync_config_id,
            status=final_status,
            ultimo_sync=datetime.now(UTC),
            total_processos=total_processos,
            erro_mensagem=erro_msg,
            progresso_detalhado={
                "fase_atual": "completed",
                "total_processos": total_processos,
                "novos_processos": total_novos,
                "novas_movimentacoes": total_mov,
                "docs_baixados": total_docs,
                "blocked_count": blocked_count,
                "errors": errors,
            },
        )
        await session.commit()

    await _broadcast_progress(tenant_id, sync_config_id, {
        "fase": "completed",
        "total_processos": total_processos,
        "novos_processos": total_novos,
        "novas_movimentacoes": total_mov,
        "docs_baixados": total_docs,
        "blocked_count": blocked_count,
        "errors": errors,
    })

    if _should_emit_scraper_alert(len(tribunais), len(errors), blocked_count):
        await _emit_scraper_alert(
            tenant_id=tenant_id,
            sync_config_id=sync_config_id,
            oab_numero=oab_numero,
            oab_uf=oab_uf,
            total_tribunals=len(tribunais),
            errors=errors,
            blocked_count=blocked_count,
        )

    logger.info("pipeline_complete", extra={
        "oab": f"{oab_uf}{oab_numero}",
        "total": total_processos,
        "novos": total_novos,
        "docs": total_docs,
        "blocked_count": blocked_count,
    })

    return {
        "sucesso": True,
        "total": total_processos,
        "novos_processos": total_novos,
        "novas_movimentacoes": total_mov,
        "docs_baixados": total_docs,
        "blocked_count": blocked_count,
        "errors": errors,
    }


# ──────────────────────────────────────────────────────────────────
# Per-tribunal pipeline (listing → detail → docs)
# ──────────────────────────────────────────────────────────────────

async def _pipeline_tribunal(
    tenant_id: UUID,
    sync_config_id: UUID,
    oab_numero: str,
    oab_uf: str,
    tribunal: str,
    user_id_str: str | None = None,
    nome_advogado: str | None = None,
) -> dict:
    """Run the full pipeline for one tribunal."""
    user_id = UUID(user_id_str) if user_id_str else None

    await _broadcast_progress(tenant_id, sync_config_id, {
        "fase": "listing",
        "tribunal": tribunal,
    })

    # Phase 1: List processes (with name fallback when OAB returns 0)
    listing_result = await listar_processos(oab_numero, oab_uf, tribunal, nome_advogado=nome_advogado)

    if not listing_result.get("sucesso"):
        msg = listing_result.get("mensagem", "Erro desconhecido")
        logger.warning(f"pipeline_listing_failed tribunal={tribunal} msg={msg}")

        if listing_result.get("blocked"):
            # Captcha — don't retry, mark as blocked
            logger.critical(
                "pipeline_listing_blocked",
                extra={"tribunal": tribunal, "oab": f"{oab_uf}{oab_numero}"},
            )
            return {
                "total": 0,
                "novos_processos": 0,
                "novas_movimentacoes": 0,
                "docs_baixados": 0,
                "blocked": True,
            }

        raise RuntimeError(f"Listing failed for {tribunal}: {msg}")

    processos_basicos = listing_result.get("processos", [])
    total = listing_result.get("total", len(processos_basicos))
    metodo_busca = listing_result.get("fonte", "oab")

    logger.info(f"pipeline_listed tribunal={tribunal} total={total} parsed={len(processos_basicos)} fonte={metodo_busca}")

    await _broadcast_progress(tenant_id, sync_config_id, {
        "fase": "listing_done",
        "tribunal": tribunal,
        "total": total,
        "metodo_busca": metodo_busca,
    })

    novos_processos = 0
    total_mov = 0
    docs_baixados = 0

    for i, proc_basico in enumerate(processos_basicos):
        numero = proc_basico.get("numero", "")
        if not numero:
            continue

        await _broadcast_progress(tenant_id, sync_config_id, {
            "fase": "detailing",
            "tribunal": tribunal,
            "numero": numero,
            "index": i + 1,
            "total": len(processos_basicos),
        })

        try:
            # Phase 2: Detail this process
            detail_result = await detalhar_processo(tribunal, numero, oab_numero, oab_uf, nome_advogado=nome_advogado)

            if not detail_result.get("sucesso"):
                logger.warning(f"pipeline_detail_failed tribunal={tribunal} numero={numero}")
                # Still upsert the basic info (from list)
                async with AsyncSessionLocal() as session:
                    caso_repo = CasoOABRepository(session, tenant_id)
                    caso_existia = await caso_repo.get_by_numero(numero) is not None
                    _, novas_mov = await caso_repo.upsert_from_scraper(
                        numero=numero,
                        processo_data=proc_basico,
                        oab_numero=oab_numero,
                        oab_uf=oab_uf,
                        criado_por=user_id,
                        tribunal=tribunal,
                    )
                    if not caso_existia:
                        novos_processos += 1
                    total_mov += novas_mov
                    await session.commit()
                continue

            # Merge basic + detail data
            processo_completo = {**proc_basico}
            processo_completo["partes_detalhadas"] = detail_result.get("partes_detalhadas", [])
            processo_completo["movimentacoes"] = detail_result.get("movimentacoes", [])
            doc_links = detail_result.get("doc_links", [])

            # Upsert processo (without docs for now)
            async with AsyncSessionLocal() as session:
                caso_repo = CasoOABRepository(session, tenant_id)
                caso_existia = await caso_repo.get_by_numero(numero) is not None
                _, novas_mov = await caso_repo.upsert_from_scraper(
                    numero=numero,
                    processo_data=processo_completo,
                    oab_numero=oab_numero,
                    oab_uf=oab_uf,
                    criado_por=user_id,
                    tribunal=tribunal,
                )
                if not caso_existia:
                    novos_processos += 1
                total_mov += novas_mov
                await session.commit()

            await _broadcast_progress(tenant_id, sync_config_id, {
                "fase": "detail_done",
                "tribunal": tribunal,
                "numero": numero,
                "doc_links": len(doc_links),
            })

            # Phase 3: Download documents
            for j, doc_link in enumerate(doc_links):
                doc_url = doc_link.get("url", "")
                if not doc_url:
                    continue

                await _broadcast_progress(tenant_id, sync_config_id, {
                    "fase": "downloading",
                    "tribunal": tribunal,
                    "numero": numero,
                    "doc_index": j + 1,
                    "doc_total": len(doc_links),
                })

                try:
                    doc_result = await baixar_documento(
                        tribunal=tribunal,
                        numero_processo=numero,
                        doc_url=doc_url,
                        doc_index=doc_link.get("index", j),
                        doc_description=doc_link.get("description", ""),
                    )

                    if doc_result.get("sucesso"):
                        docs_baixados += 1

                        # Attach doc to processo
                        async with AsyncSessionLocal() as session:
                            caso_repo = CasoOABRepository(session, tenant_id)
                            await caso_repo.add_document_to_processo(
                                numero=numero,
                                doc_data={
                                    "nome": doc_result.get("nome", f"doc_{j}"),
                                    "tipo": doc_result.get("tipo", "ANEXO"),
                                    "s3_url": doc_result.get("s3_url", ""),
                                    "tamanho_bytes": doc_result.get("tamanho_bytes", 0),
                                    "id_processo_doc": doc_result.get("doc_id", ""),
                                },
                            )
                            await session.commit()

                except Exception as e:
                    logger.warning(f"pipeline_doc_error tribunal={tribunal} numero={numero} doc={j} error={e}")

                if j < len(doc_links) - 1:
                    await asyncio.sleep(DELAY_BETWEEN_DOCUMENTS)

        except Exception as e:
            logger.error(f"pipeline_detail_error tribunal={tribunal} numero={numero} error={e}")

        if i < len(processos_basicos) - 1:
            await asyncio.sleep(DELAY_BETWEEN_PROCESSES)

    return {
        "total": len(processos_basicos),
        "novos_processos": novos_processos,
        "novas_movimentacoes": total_mov,
        "docs_baixados": docs_baixados,
    }
