"""Business logic for the Leads Webhook Receiver (B.7.5e).

Port of: app/api/admin/leads-chatwit/webhook/route.ts

Handles 15+ payload types from external systems (manuscripts, mirrors,
analyses, appeals, etc.) via boolean flag detection.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis as AsyncRedis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.espelho_biblioteca import EspelhoBiblioteca
from domains.socialwise.db.models.espelho_padrao import EspelhoPadrao
from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class WebhookReceiverError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _publish_sse(lead_id: str, payload: dict[str, Any]) -> None:
    """Publish SSE notification via Redis pub/sub."""
    try:
        redis = AsyncRedis.from_url(str(settings.redis_url), decode_responses=True)
        try:
            channel = f"sse:{lead_id}"
            await redis.publish(channel, json.dumps(payload))
        finally:
            await redis.aclose()
    except Exception:
        logger.warning("sse_publish_failed", lead_id=lead_id, exc_info=True)


async def _resolve_lead_id(
    session: AsyncSession, data: dict[str, Any],
) -> str | None:
    """Resolve leadID from payload — first by explicit ID, then by phone."""
    lead_id = data.get("leadID") or data.get("leadId")
    if lead_id:
        return lead_id

    telefone = data.get("telefone")
    if not telefone:
        return None

    stmt = (
        select(LeadOabData.id)
        .join(Lead, Lead.id == LeadOabData.lead_id)
        .where(Lead.phone == telefone)
        .limit(1)
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row:
        logger.info("lead_resolved_by_phone", phone=telefone, lead_id=row)
    return row


async def _get_lead_data_for_sse(
    session: AsyncSession, lead_id: str,
) -> dict[str, Any] | None:
    """Fetch lead data for SSE with large fields masked."""
    stmt = select(LeadOabData).where(LeadOabData.id == lead_id)
    result = await session.execute(stmt)
    lo = result.scalar_one_or_none()
    if not lo:
        return None
    return {
        "id": lo.id,
        "nomeReal": lo.nome_real,
        "concluido": lo.concluido,
        "manuscritoProcessado": lo.manuscrito_processado,
        "aguardandoManuscrito": lo.aguardando_manuscrito,
        "espelhoProcessado": lo.espelho_processado,
        "aguardandoEspelho": lo.aguardando_espelho,
        "analiseProcessada": lo.analise_processada,
        "aguardandoAnalise": lo.aguardando_analise,
        "analiseValidada": lo.analise_validada,
        "situacao": lo.situacao,
        "notaFinal": lo.nota_final,
        "provaManuscrita": "[Omitido - manuscrito presente]" if lo.prova_manuscrita else None,
        "textoDOEspelho": "[Omitido - espelho presente]" if lo.texto_do_espelho else None,
    }


def _not_found_response(msg: str = "Lead não encontrado") -> dict[str, Any]:
    return {"success": False, "message": msg}


def _error_response(msg: str, status: int = 500) -> dict[str, Any]:
    return {"success": False, "message": msg, "_status_code": status}


# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------


async def process_webhook(
    session: AsyncSession, raw_data: Any,
) -> dict[str, Any]:
    """Process an incoming webhook payload by detecting its type and dispatching."""

    # Unwrap containers
    data = raw_data
    if isinstance(data, list) and len(data) > 0:
        data = data[0]
    if isinstance(data, dict) and "body" in data and isinstance(data["body"], dict):
        data = data["body"]
    if isinstance(data, dict) and isinstance(data.get("debug"), dict) and data["debug"].get("analisepreliminar") is True:
        data = data["debug"]

    if not isinstance(data, dict):
        return _error_response("Payload inválido", 400)

    # Detect payload type via boolean flags
    is_espelho = data.get("espelho") is True
    is_espelho_consultoria_fase2 = data.get("espelhoconsultoriafase2") is True
    is_espelho_para_biblioteca = data.get("espelhoparabiblioteca") is True
    is_espelho_padrao = data.get("espelhoPadrao") is True
    is_espelho_local_processado = data.get("espelhoLocalProcessado") is True
    is_manuscrito = data.get("manuscrito") is True and data.get("textoDAprova")
    is_analise = data.get("analise") is True
    is_analise_simulado = data.get("analisesimulado") is True
    is_analise_preliminar = data.get("analisepreliminar") is True
    is_analise_simulado_preliminar = data.get("analisesimuladopreliminar") is True
    is_analise_validada = data.get("analiseValidada") is True
    is_analise_simulado_validada = data.get("analisesimuladovalidado") is True
    is_analise_simulado_validada_cc = data.get("analiseSimuladoValidada") is True
    is_recurso_preliminar = data.get("RecursoFinalizado") is True and data.get("recursoPreliminar") is True
    is_recurso_validado = data.get("RecursoFinalizado") is True and data.get("recursoValidado") is True

    logger.info(
        "webhook_payload_type",
        espelho=is_espelho,
        manuscrito=is_manuscrito,
        analise=is_analise,
        analisePreliminar=is_analise_preliminar,
        analiseValidada=is_analise_validada,
        espelhoLocal=is_espelho_local_processado,
        espelhoPadrao=is_espelho_padrao,
        recursoPreliminar=is_recurso_preliminar,
        recursoValidado=is_recurso_validado,
    )

    # Dispatch to handlers
    if is_analise_preliminar:
        return await _handle_analise_preliminar(session, data)
    if is_espelho_local_processado:
        return await _handle_espelho_local(session, data)
    if is_recurso_preliminar:
        return await _handle_recurso_preliminar(session, data)
    if is_recurso_validado:
        return await _handle_recurso_validado(session, data)
    if is_espelho_padrao:
        return await _handle_espelho_padrao(session, data)
    if is_espelho_para_biblioteca:
        return await _handle_espelho_biblioteca(session, data)
    if is_analise_simulado_preliminar:
        return await _handle_analise_simulado_preliminar(session, data)
    if is_analise_validada:
        return await _handle_analise_validada(session, data)
    if data.get("consultoriafase2") is True:
        return await _handle_consultoria_fase2(session, data)
    if is_analise:
        return await _handle_analise(session, data)
    if is_analise_simulado:
        return await _handle_analise_simulado(session, data)
    if is_analise_simulado_validada or is_analise_simulado_validada_cc:
        return await _handle_analise_simulado_validada(session, data)
    if is_espelho and data.get("textoDOEspelho"):
        return await _handle_espelho_correcao(session, data)
    if is_espelho_consultoria_fase2:
        return await _handle_espelho_consultoria_fase2(session, data)
    if is_manuscrito:
        return await _handle_manuscrito(session, data)

    logger.warning("webhook_unrecognized", keys=list(data.keys()))
    return {
        "success": False,
        "message": "Payload não identificado",
        "debug": data,
    }


# ---------------------------------------------------------------------------
# Individual handlers
# ---------------------------------------------------------------------------


async def _handle_analise_preliminar(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response("Não foi possível identificar o lead")

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "analise",
        "leadID": lead_id,
        "analisePreliminar": data,
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "analise": True,
    })

    logger.info("analise_preliminar_queued", lead_id=lead_id)
    return {"success": True, "message": "Pré-análise de prova adicionada à fila de processamento"}


async def _handle_espelho_local(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = data.get("leadID") or data.get("leadId")
    if not lead_id:
        return _error_response("leadID é obrigatório para espelhos locais processados", 400)

    if not data.get("success"):
        error_msg = data.get("error", "Unknown error")
        await session.execute(
            update(LeadOabData)
            .where(LeadOabData.id == lead_id)
            .values(espelho_processado=False, aguardando_espelho=False)
        )
        await session.commit()
        await _publish_sse(lead_id, {
            "type": "mirrorError",
            "message": f"Erro ao gerar espelho: {error_msg}",
            "leadId": lead_id,
            "error": error_msg,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return _error_response(f"Erro ao processar espelho local: {error_msg}")

    markdown_mirror = data.get("markdownMirror")
    json_mirror = data.get("jsonMirror")
    if not markdown_mirror and not json_mirror:
        return _error_response("Espelho local processado mas sem dados de saída", 400)

    # Convert jsonMirror to string for storage
    texto_do_espelho = None
    if json_mirror:
        texto_do_espelho = json_mirror if isinstance(json_mirror, str) else json.dumps(json_mirror, ensure_ascii=False)
    elif markdown_mirror:
        texto_do_espelho = markdown_mirror

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            texto_do_espelho=texto_do_espelho,
            espelho_processado=True,
            aguardando_espelho=False,
        )
    )
    await session.commit()

    lead_data = await _get_lead_data_for_sse(session, lead_id)
    await _publish_sse(lead_id, {
        "type": "leadUpdate",
        "message": "Seu espelho de correção foi processado com sucesso!",
        "leadData": lead_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Espelho local processado e salvo com sucesso", "leadId": lead_id}


async def _handle_recurso_preliminar(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            recurso_preliminar=data.get("textoRecurso") or json.dumps(data, ensure_ascii=False),
            recurso_validado=False,
            aguardando_recurso=False,
        )
    )
    await session.commit()

    await _publish_sse(lead_id, {
        "type": "recurso_preliminar",
        "message": "Pré-recurso foi gerado e está aguardando validação!",
        "leadId": lead_id,
        "status": "recurso_preliminar_recebido",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Pré-recurso processado com sucesso"}


async def _handle_recurso_validado(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    recurso_url = data.get("recursoUrl")
    if not recurso_url:
        return _error_response("URL do recurso validado não fornecida (campo 'recursoUrl')", 400)

    recurso_argumentacao_url = data.get("recursoArgumentacaoUrl")

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            recurso_url=recurso_url,
            recurso_argumentacao_url=recurso_argumentacao_url,
            recurso_validado=True,
            aguardando_recurso=False,
        )
    )
    await session.commit()

    await _publish_sse(lead_id, {
        "type": "recurso_validado",
        "message": "Seu recurso foi validado e está pronto!",
        "leadId": lead_id,
        "status": "recurso_validado",
        "recursoUrl": recurso_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Recurso validado processado com sucesso"}


async def _handle_espelho_padrao(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    especialidade = data.get("especialidade")
    espelho_id = data.get("espelhoId")
    if not especialidade or not espelho_id:
        return _error_response("Especialidade e espelhoId são obrigatórios para espelhos padrão", 400)

    # Extract markdown text
    texto_markdown = None
    espelho_texto = data.get("espelhoPadraotexto")
    if isinstance(espelho_texto, list) and len(espelho_texto) > 0:
        primeiro_item = espelho_texto[0]
        texto_markdown = primeiro_item.get("output") if isinstance(primeiro_item, dict) else None

    if not texto_markdown:
        return _error_response("Texto do espelho padrão não fornecido", 400)

    # Clean markdown wrapper
    if texto_markdown.startswith("```markdown\n"):
        texto_markdown = texto_markdown.removeprefix("```markdown\n")
    if texto_markdown.endswith("```"):
        texto_markdown = texto_markdown.removesuffix("```")
    texto_markdown = texto_markdown.strip()

    stmt = select(EspelhoPadrao).where(EspelhoPadrao.id == espelho_id)
    result = await session.execute(stmt)
    espelho = result.scalar_one_or_none()

    if not espelho:
        return _error_response("Espelho padrão não encontrado", 404)

    await session.execute(
        update(EspelhoPadrao)
        .where(EspelhoPadrao.id == espelho_id)
        .values(
            texto_markdown=texto_markdown,
            processado=True,
            aguardando_processamento=False,
            total_usos=EspelhoPadrao.total_usos + 1,
        )
    )
    await session.commit()

    logger.info("espelho_padrao_updated", espelho_id=espelho_id)
    return {
        "success": True,
        "message": "Espelho padrão processado com sucesso",
        "espelhoId": espelho_id,
        "especialidade": especialidade,
    }


async def _handle_espelho_biblioteca(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    espelho_id = data.get("espelhoBibliotecaId")
    if not espelho_id:
        return _error_response("ID do espelho da biblioteca não fornecido (espelhoBibliotecaId)", 400)

    texto_do_espelho = data.get("textoDOEspelho")
    if not texto_do_espelho:
        return _error_response("Texto do espelho não fornecido para a biblioteca (textoDOEspelho)", 400)

    stmt = select(EspelhoBiblioteca).where(EspelhoBiblioteca.id == espelho_id)
    result = await session.execute(stmt)
    espelho = result.scalar_one_or_none()
    if not espelho:
        return _error_response("Espelho da biblioteca não encontrado", 404)

    # Extract image URLs
    urls_espelho: list[str] = []
    imagens = data.get("arquivos_imagens_espelho")
    if isinstance(imagens, list):
        urls_espelho = [item.get("url", "") for item in imagens if isinstance(item, dict) and item.get("url")]

    update_data: dict[str, Any] = {
        "texto_do_espelho": texto_do_espelho,
        "espelho_biblioteca_processado": True,
        "aguardando_espelho": False,
    }
    if urls_espelho:
        update_data["espelho_correcao"] = json.dumps(urls_espelho)

    await session.execute(
        update(EspelhoBiblioteca)
        .where(EspelhoBiblioteca.id == espelho_id)
        .values(**update_data)
    )
    await session.commit()

    await _publish_sse("biblioteca_geral", {
        "type": "espelho_biblioteca_processado",
        "message": "Novo espelho foi adicionado à biblioteca!",
        "espelhoId": espelho_id,
        "status": "espelho_biblioteca_processado",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Texto do espelho adicionado à biblioteca com sucesso", "espelhoId": espelho_id}


async def _handle_analise_simulado_preliminar(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            analise_preliminar=data,
            analise_validada=False,
            aguardando_analise=True,
        )
    )
    await session.commit()

    await _publish_sse(lead_id, {
        "type": "analise_simulado_preliminar",
        "message": "Pré-análise do seu simulado foi processada com sucesso!",
        "leadId": lead_id,
        "status": "analise_simulado_preliminar_recebida",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Pré-análise de simulado processada com sucesso"}


async def _handle_analise_validada(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    analise_url = data.get("analiseUrl")
    if not analise_url:
        return _error_response("URL da análise validada não fornecida (campo 'analiseUrl')", 400)

    argumentacao_url = data.get("argumentacaoUrl")

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "analise",
        "leadID": lead_id,
        "analiseUrl": analise_url,
        "argumentacaoUrl": argumentacao_url,
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "analiseValidada": True,
    })

    await _publish_sse(lead_id, {
        "type": "analise_validada",
        "message": "Sua análise foi validada e está pronta!",
        "leadId": lead_id,
        "status": "analise_validada",
        "analiseUrl": analise_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Análise validada processada com sucesso"}


async def _handle_consultoria_fase2(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    analise_url = data.get("analiseUrl")
    if not analise_url:
        return _error_response("URL da consultoria fase 2 não fornecida (campo 'analiseUrl')", 400)

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            analise_url=analise_url,
            analise_processada=True,
            analise_validada=True,
            aguardando_analise=False,
        )
    )
    await session.commit()

    await _publish_sse(lead_id, {
        "type": "consultoria_fase2",
        "message": "Sua consultoria fase 2 foi processada e está pronta!",
        "leadId": lead_id,
        "status": "consultoria_fase2_pronta",
        "analiseUrl": analise_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Consultoria fase 2 processada com sucesso"}


async def _handle_analise(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "analise",
        "leadID": lead_id,
        "analiseUrl": data.get("analiseUrl"),
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "analise": True,
    })

    return {"success": True, "message": "Análise adicionada à fila de processamento"}


async def _handle_analise_simulado(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "analise",
        "leadID": lead_id,
        "analiseUrl": data.get("analiseUrl"),
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "analiseSimulado": True,
    })

    return {"success": True, "message": "Análise de simulado adicionada à fila de processamento"}


async def _handle_analise_simulado_validada(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    analise_url = data.get("analiseUrl")
    if not analise_url:
        return _error_response("URL da análise de simulado validada não fornecida (campo 'analiseUrl')", 400)

    argumentacao_url = data.get("argumentacaoUrl")

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "analise",
        "leadID": lead_id,
        "analiseUrl": analise_url,
        "argumentacaoUrl": argumentacao_url,
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "analiseSimuladoValidada": True,
    })

    return {"success": True, "message": "Análise de simulado validada adicionada à fila de processamento"}


async def _handle_espelho_correcao(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    texto_do_espelho = data.get("textoDOEspelho")
    texto_da_prova = texto_do_espelho if isinstance(texto_do_espelho, list) else [{"output": texto_do_espelho}]

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "espelho",
        "leadID": lead_id,
        "textoDAprova": texto_da_prova,
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "espelho": True,
    })

    return {"success": True, "message": "Espelho adicionado à fila de processamento"}


async def _handle_espelho_consultoria_fase2(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    texto_do_espelho = data.get("textoDOEspelho")
    update_data: dict[str, Any] = {
        "espelho_processado": True,
        "aguardando_espelho": False,
    }

    if texto_do_espelho:
        update_data["texto_do_espelho"] = texto_do_espelho

    # Image URLs
    imagens = data.get("arquivos_imagens_espelho")
    if isinstance(imagens, list) and len(imagens) > 0:
        urls = [item.get("url", "") for item in imagens if isinstance(item, dict) and item.get("url")]
        if urls:
            update_data["espelho_correcao"] = json.dumps(urls)

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(**update_data)
    )
    await session.commit()

    await _publish_sse(lead_id, {
        "type": "espelho_consultoria_fase2",
        "message": "Espelho de consultoria fase 2 foi processado!",
        "leadId": lead_id,
        "status": "espelho_consultoria_fase2_processado",
        "textoDOEspelho": "presente" if texto_do_espelho else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Espelho de consultoria fase 2 processado com sucesso"}


async def _handle_manuscrito(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    lead_id = await _resolve_lead_id(session, data)
    if not lead_id:
        return _not_found_response()

    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    await process_lead_cell_task.kiq({
        "type": "manuscrito",
        "leadID": lead_id,
        "textoDAprova": data.get("textoDAprova"),
        "nome": data.get("nome"),
        "telefone": data.get("telefone"),
        "manuscrito": True,
    })

    return {"success": True, "message": "Manuscrito adicionado à fila de processamento"}
