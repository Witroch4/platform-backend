"""
TPU Sync Task

Sincroniza dados das Tabelas Processuais Unificadas (TPU) do CNJ:
  - tpu_classes  (classes processuais)
  - tpu_assuntos (assuntos / matérias)

Roda automaticamente:
  - No startup do backend SE as tabelas estiverem vazias
  - Via scheduler semanal (toda segunda-feira às 04:00)
  - Via trigger manual pelo painel de admin
"""

import asyncio
import logging

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert

from domains.jusmonitoria.services.tpu.cnj_client import CnjTpuClient
from domains.jusmonitoria.db.session_compat import AsyncSessionLocal
from domains.jusmonitoria.db.models.tpu import TpuAssunto, TpuClasse, TpuDocumento
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.base import BaseTask

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Helpers de upsert (reaproveitados de scripts/sync_tpu.py)
# ---------------------------------------------------------------------------


async def _upsert_classes(session, classes_data: list[dict]) -> int:
    if not classes_data:
        return 0

    logger.info("tpu_sync_upsert_classes_start", total=len(classes_data))
    BATCH = 1000

    # Pass 1 — sem hierarquia
    for i in range(0, len(classes_data), BATCH):
        batch = classes_data[i : i + BATCH]
        values = [
            {
                "codigo": item.get("cod_item"),
                "nome": item.get("nome"),
                "cod_item_pai": None,
                "glossario": item.get("descricao_glossario"),
                "sigla": item.get("sigla"),
                "natureza": item.get("natureza"),
                "polo_ativo": item.get("polo_ativo"),
                "polo_passivo": item.get("polo_passivo"),
            }
            for item in batch
        ]
        stmt = insert(TpuClasse).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["codigo"],
            set_={
                "nome": stmt.excluded.nome,
                "glossario": stmt.excluded.glossario,
                "sigla": stmt.excluded.sigla,
                "natureza": stmt.excluded.natureza,
                "polo_ativo": stmt.excluded.polo_ativo,
                "polo_passivo": stmt.excluded.polo_passivo,
                "updated_at": func.now(),
            },
        )
        await session.execute(stmt)

    # Pass 2 — estabelece hierarquia
    existing_ids: set[int] = {
        row[0] for row in (await session.execute(select(TpuClasse.codigo))).all()
    }
    for i in range(0, len(classes_data), BATCH):
        batch = classes_data[i : i + BATCH]
        values = []
        for item in batch:
            cod_pai = item.get("cod_item_pai")
            values.append(
                {
                    "codigo": item.get("cod_item"),
                    "nome": item.get("nome"),
                    "cod_item_pai": cod_pai if cod_pai and cod_pai in existing_ids else None,
                }
            )
        stmt = insert(TpuClasse).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["codigo"],
            set_={"cod_item_pai": stmt.excluded.cod_item_pai},
        )
        await session.execute(stmt)

    await session.commit()
    logger.info("tpu_sync_upsert_classes_done", total=len(classes_data))
    return len(classes_data)


async def _upsert_assuntos(session, assuntos_data: list[dict]) -> int:
    if not assuntos_data:
        return 0

    logger.info("tpu_sync_upsert_assuntos_start", total=len(assuntos_data))
    BATCH = 1000

    # Pass 1 — sem hierarquia
    for i in range(0, len(assuntos_data), BATCH):
        batch = assuntos_data[i : i + BATCH]
        values = [
            {
                "codigo": item.get("cod_item"),
                "nome": item.get("nome"),
                "cod_item_pai": None,
                "glossario": item.get("descricao_glossario"),
                "artigo": item.get("artigo"),
            }
            for item in batch
        ]
        stmt = insert(TpuAssunto).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["codigo"],
            set_={
                "nome": stmt.excluded.nome,
                "glossario": stmt.excluded.glossario,
                "artigo": stmt.excluded.artigo,
                "updated_at": func.now(),
            },
        )
        await session.execute(stmt)

    # Pass 2 — estabelece hierarquia
    existing_ids: set[int] = {
        row[0] for row in (await session.execute(select(TpuAssunto.codigo))).all()
    }
    for i in range(0, len(assuntos_data), BATCH):
        batch = assuntos_data[i : i + BATCH]
        values = []
        for item in batch:
            cod_pai = item.get("cod_item_pai")
            values.append(
                {
                    "codigo": item.get("cod_item"),
                    "nome": item.get("nome"),
                    "cod_item_pai": cod_pai if cod_pai and cod_pai in existing_ids else None,
                }
            )
        stmt = insert(TpuAssunto).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["codigo"],
            set_={"cod_item_pai": stmt.excluded.cod_item_pai},
        )
        await session.execute(stmt)

    await session.commit()
    logger.info("tpu_sync_upsert_assuntos_done", total=len(assuntos_data))
    return len(assuntos_data)


# ---------------------------------------------------------------------------
# Upsert documentos
# ---------------------------------------------------------------------------


async def _upsert_documentos(session, documentos_data: list[dict]) -> int:
    if not documentos_data:
        return 0

    logger.info("tpu_sync_upsert_documentos_start", total=len(documentos_data))
    BATCH = 1000

    for i in range(0, len(documentos_data), BATCH):
        batch = documentos_data[i : i + BATCH]
        values = [
            {
                "codigo": item.get("cod_item"),
                "nome": (item.get("nome") or "").strip(),
                "cod_item_pai": item.get("cod_item_pai"),
                "glossario": (item.get("descricao_glossario") or item.get("descricao_documento") or "").strip() or None,
            }
            for item in batch
            if item.get("cod_item") and (item.get("nome") or "").strip()
        ]
        if not values:
            continue
        stmt = insert(TpuDocumento).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["codigo"],
            set_={
                "nome": stmt.excluded.nome,
                "cod_item_pai": stmt.excluded.cod_item_pai,
                "glossario": stmt.excluded.glossario,
                "updated_at": func.now(),
            },
        )
        await session.execute(stmt)

    await session.commit()
    logger.info("tpu_sync_upsert_documentos_done", total=len(documentos_data))
    return len(documentos_data)


# ---------------------------------------------------------------------------
# Task principal — registrada no scheduler e no broker
# ---------------------------------------------------------------------------


async def sync_tpu_from_cnj() -> dict:
    """
    Baixa e persiste classes + assuntos + documentos do CNJ.
    Retorna um resumo com totais.
    """
    logger.info("tpu_sync_started")
    client = CnjTpuClient(timeout=120)

    try:
        logger.info("tpu_sync_downloading_classes")
        classes_data = await client.get_classes()

        logger.info("tpu_sync_downloading_assuntos")
        assuntos_data = await client.get_assuntos()

        logger.info("tpu_sync_downloading_documentos")
        documentos_data = await client.get_documentos()

        async with AsyncSessionLocal() as session:
            total_classes = await _upsert_classes(session, classes_data)
            total_assuntos = await _upsert_assuntos(session, assuntos_data)
            total_documentos = await _upsert_documentos(session, documentos_data)

        result = {"classes": total_classes, "assuntos": total_assuntos, "documentos": total_documentos}
        logger.info("tpu_sync_completed", **result)
        return result

    except Exception as exc:
        logger.error("tpu_sync_failed", error=str(exc), exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Taskiq task (para trigger via broker / API de admin)
# ---------------------------------------------------------------------------


@broker.task
async def sync_tpu_task() -> dict:
    """Taskiq-registered wrapper para o sync TPU."""
    return await sync_tpu_from_cnj()


# ---------------------------------------------------------------------------
# Startup check — roda se as tabelas estiverem vazias
# ---------------------------------------------------------------------------


async def ensure_tpu_populated() -> None:
    """
    Chamado no startup do backend.
    Se tpu_classes e tpu_assuntos estiverem vazias, executa o sync imediatamente.
    Isso garante que um ambiente recém-criado (./dev.sh build) funcione
    sem precisar rodar nenhum comando manual.
    """
    try:
        async with AsyncSessionLocal() as session:
            count_result = await session.execute(
                text("SELECT COUNT(*) FROM tpu_assuntos")
            )
            count = count_result.scalar_one()

            docs_result = await session.execute(text("SELECT COUNT(*) FROM tpu_documentos"))
            doc_count = docs_result.scalar_one()

        if count == 0 or doc_count == 0:
            logger.info(
                "tpu_sync_startup_trigger",
                reason=f"tabelas vazias (assuntos={count}, documentos={doc_count}) — iniciando sync automático",
            )
            # Roda em background para não bloquear o startup
            asyncio.create_task(sync_tpu_from_cnj())
        else:
            logger.info("tpu_sync_startup_skip", total_assuntos=count, total_documentos=doc_count)

    except Exception as exc:
        # Não quebra o startup se o sync falhar
        logger.warning("tpu_sync_startup_check_failed", error=str(exc))
