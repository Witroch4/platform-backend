"""TaskIQ worker for LeadCells jobs (manuscrito, espelho, análise).

Port of: worker/WebhookWorkerTasks/leadcells.task.ts

Processes three job types:
- Manuscrito: OCR text → LeadOabData.provaManuscrita
- Espelho: mirror/correction text → LeadOabData.textoDOEspelho + metadata
- Análise: analysis URLs / preliminary data → LeadOabData fields
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.session_compat import session_ctx
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


# ── SSE helper (publishes to Redis for Next.js SSE manager) ──────────────


async def _publish_sse_notification(lead_id: str, payload: dict[str, Any], label: str) -> None:
    """Publish SSE notification via Redis pub/sub.

    The SSE manager subscribes to `sse:<leadId>` channels.
    """
    try:
        import json

        from redis.asyncio import Redis as AsyncRedis

        from platform_core.config import settings

        redis = AsyncRedis.from_url(str(settings.redis_url), decode_responses=True)
        try:
            channel = f"sse:{lead_id}"
            await redis.publish(channel, json.dumps(payload))
            logger.info("sse_notification_sent", lead_id=lead_id, label=label)
        finally:
            await redis.aclose()
    except Exception:
        logger.warning("sse_notification_failed", lead_id=lead_id, label=label, exc_info=True)


async def _touch_parent_lead(lead_oab_data_id: str) -> None:
    """Update updatedAt of the parent Lead record."""
    try:
        async with session_ctx() as session:
            result = await session.execute(
                select(LeadOabData.lead_id).where(LeadOabData.id == lead_oab_data_id).limit(1)
            )
            parent_lead_id = result.scalar_one_or_none()
            if parent_lead_id:
                parent_result = await session.execute(
                    select(Lead).where(Lead.id == parent_lead_id).limit(1)
                )
                parent_lead = parent_result.scalar_one_or_none()
                if parent_lead:
                    parent_lead.updated_at = datetime.now(timezone.utc)
                    await session.commit()
    except Exception as e:
        logger.warning("touch_parent_lead_failed", lead_oab_data_id=lead_oab_data_id, error=str(e))


# ── Manuscrito ───────────────────────────────────────────────────────────


async def _process_manuscrito(payload: dict[str, Any]) -> dict[str, Any]:
    lead_id = payload["leadID"]
    texto_da_prova: list[dict[str, str]] = payload.get("textoDAprova", [])

    conteudo_unificado = "\n\n---------------------------------\n\n".join(
        item.get("output", "") for item in texto_da_prova
    )

    async with session_ctx() as session:
        result = await session.execute(
            select(LeadOabData).where(LeadOabData.id == lead_id).limit(1)
        )
        lead_existente = result.scalar_one_or_none()
        if not lead_existente:
            raise ValueError(f"Lead não encontrado com ID: {lead_id}")

        lead_existente.prova_manuscrita = conteudo_unificado
        lead_existente.manuscrito_processado = True
        lead_existente.aguardando_manuscrito = False
        await session.commit()

    await _touch_parent_lead(lead_id)

    await _publish_sse_notification(
        lead_id,
        {
            "type": "leadUpdate",
            "message": "Seu manuscrito foi processado com sucesso!",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "Manuscrito",
    )

    return {"success": True, "message": "Manuscrito processado com sucesso"}


# ── Espelho ──────────────────────────────────────────────────────────────


_DESC_RE = re.compile(r"Descrição do Exame:\s*(.+)", re.IGNORECASE)
_INSCRICAO_RE = re.compile(r"Inscrição:\s*([^\n]+)", re.IGNORECASE)
_NOME_RE = re.compile(r"Nome do Examinando:\s*(.+)", re.IGNORECASE)
_SECCIONAL_RE = re.compile(r"Seccional:\s*(.+)", re.IGNORECASE)
_AREA_RE = re.compile(r"Área Jurídica:\s*(.+)", re.IGNORECASE)
_NOTA_RE = re.compile(r"Nota Final:\s*([0-9.,]+)", re.IGNORECASE)
_SITUACAO_RE = re.compile(r"Situação:\s*(.+)", re.IGNORECASE)


async def _process_espelho(payload: dict[str, Any]) -> dict[str, Any]:
    lead_id = payload["leadID"]
    texto_da_prova: list[dict[str, str]] = payload.get("textoDAprova", [])
    espelho_para_biblioteca = payload.get("espelhoparabiblioteca", False)

    conteudo_unificado = "\n\n---------------------------------\n\n".join(
        item.get("output", "") for item in texto_da_prova
    )

    async with session_ctx() as session:
        result = await session.execute(
            select(LeadOabData).where(LeadOabData.id == lead_id).limit(1)
        )
        lead_existente = result.scalar_one_or_none()
        if not lead_existente:
            raise ValueError(f"Lead não encontrado com ID: {lead_id}")

        lead_existente.texto_do_espelho = conteudo_unificado
        lead_existente.espelho_processado = True
        lead_existente.aguardando_espelho = False

        # Extract header metadata
        exames: list[str] = list(lead_existente.exames_participados or []) if lead_existente.exames_participados else []
        desc_match = _DESC_RE.search(conteudo_unificado)
        if desc_match:
            exame_desc = desc_match.group(1).strip()
            if exame_desc not in exames:
                exames.append(exame_desc)
        if exames:
            lead_existente.exames_participados = exames

        seccional_match = _SECCIONAL_RE.search(conteudo_unificado)
        if seccional_match:
            lead_existente.seccional = seccional_match.group(1).strip()

        area_match = _AREA_RE.search(conteudo_unificado)
        if area_match:
            lead_existente.area_juridica = area_match.group(1).strip()

        nota_match = _NOTA_RE.search(conteudo_unificado)
        if nota_match:
            lead_existente.nota_final = float(nota_match.group(1).replace(",", "."))

        situacao_match = _SITUACAO_RE.search(conteudo_unificado)
        if situacao_match:
            lead_existente.situacao = situacao_match.group(1).strip()

        inscricao_match = _INSCRICAO_RE.search(conteudo_unificado)
        if inscricao_match:
            lead_existente.inscricao = inscricao_match.group(1).strip()

        nome_match = _NOME_RE.search(conteudo_unificado)
        if nome_match and not lead_existente.nome_real:
            lead_existente.nome_real = nome_match.group(1).strip()

        await session.commit()

    await _touch_parent_lead(lead_id)

    message = (
        "Seu espelho para biblioteca foi processado com sucesso!"
        if espelho_para_biblioteca
        else "Seu espelho de correção foi processado com sucesso!"
    )
    await _publish_sse_notification(
        lead_id,
        {
            "type": "leadUpdate",
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "Espelho",
    )

    return {"success": True, "message": "Espelho processado com sucesso"}


# ── Análise ──────────────────────────────────────────────────────────────


async def _process_analise(payload: dict[str, Any]) -> dict[str, Any]:
    lead_id = payload["leadID"]
    analise_url = payload.get("analiseUrl")
    argumentacao_url = payload.get("argumentacaoUrl")
    analise_preliminar = payload.get("analisePreliminar")
    analise_simulado = payload.get("analiseSimulado", False)
    analise_validada_flag = payload.get("analiseValidada", False)
    analise_simulado_validada = payload.get("analiseSimuladoValidada", False)

    # NOTE: generatePdfInternally is handled by the Next.js worker (pdf-lib).
    # This Python port does NOT generate PDFs — the URLs must arrive pre-generated
    # or the enqueuer must ensure PDFs are generated before dispatching.

    async with session_ctx() as session:
        result = await session.execute(
            select(LeadOabData).where(LeadOabData.id == lead_id).limit(1)
        )
        lead_existente = result.scalar_one_or_none()
        if not lead_existente:
            raise ValueError(f"Lead não encontrado com ID: {lead_id}")

        lead_existente.aguardando_analise = False
        message = ""

        if analise_url:
            lead_existente.analise_url = analise_url
            if argumentacao_url:
                lead_existente.argumentacao_url = argumentacao_url
            lead_existente.analise_processada = True
            lead_existente.analise_validada = True
            message = (
                "Sua análise de simulado foi finalizada!"
                if analise_simulado
                else "Sua análise foi finalizada!"
            )
        elif analise_preliminar:
            lead_existente.analise_preliminar = analise_preliminar
            lead_existente.analise_processada = True
            message = (
                "Sua pré-análise de simulado está pronta!"
                if analise_simulado
                else "Sua pré-análise está pronta!"
            )
        elif analise_validada_flag or analise_simulado_validada:
            lead_existente.analise_validada = True
            message = (
                "Sua análise de simulado foi validada e está sendo finalizada!"
                if analise_simulado_validada
                else "Sua análise foi validada e está sendo finalizada!"
            )

        await session.commit()

    await _touch_parent_lead(lead_id)

    await _publish_sse_notification(
        lead_id,
        {
            "type": "leadUpdate",
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "Análise",
    )

    return {"success": True, "message": "Análise processada com sucesso"}


# ── TaskIQ entry-point ───────────────────────────────────────────────────


@broker.task(task_name="process_lead_cell_task", retry_on_error=True, max_retries=3)
async def process_lead_cell_task(payload: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a lead cell job based on type flags in the payload.

    Payload keys:
    - manuscrito=True → process manuscrito
    - espelho=True or espelhoparabiblioteca=True → process espelho
    - analise/analiseSimulado/analiseValidada/analiseSimuladoValidada → process análise
    """
    logger.info("lead_cell_job_received", lead_id=payload.get("leadID"))

    if payload.get("manuscrito"):
        return await _process_manuscrito(payload)
    elif payload.get("espelho") or payload.get("espelhoparabiblioteca"):
        return await _process_espelho(payload)
    elif any(
        payload.get(k)
        for k in ("analise", "analiseSimulado", "analiseValidada", "analiseSimuladoValidada")
    ):
        return await _process_analise(payload)
    else:
        raise ValueError("Tipo de job não reconhecido")
