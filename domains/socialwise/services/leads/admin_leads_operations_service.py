"""Business logic for the Leads Operations group (B.7.5e).

Port of:
- app/api/admin/leads-chatwit/operations/status/route.ts (GET)
- app/api/admin/leads-chatwit/operations/cancel/route.ts (POST)
- app/api/admin/leads-chatwit/batch/send-for-analysis/route.ts (POST)
- app/api/admin/leads-chatwit/atualizar-especialidade/route.ts (PUT)
- app/api/admin/leads-chatwit/register-token/route.ts (POST, GET)
- app/api/admin/leads-chatwit/custom-token/route.ts (deprecated 410)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis as AsyncRedis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.models.user import User
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class OperationsServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# Redis helpers for operation state (port of lib/oab-eval/operation-control.ts)
# ---------------------------------------------------------------------------

OPERATION_STATE_TTL = 86400  # 24h
OPERATION_CANCEL_TTL = 21600  # 6h
LEAD_OPERATION_STAGES = ("transcription", "mirror", "analysis")


def _build_job_id(stage: str, lead_id: str) -> str:
    return f"oab:{stage}:{lead_id}"


def _state_key(job_id: str) -> str:
    return f"oab:operation:state:{job_id}"


def _cancel_key(job_id: str) -> str:
    return f"oab:operation:cancel:{job_id}"


async def _get_redis() -> AsyncRedis:
    return AsyncRedis.from_url(str(settings.redis_url), decode_responses=True)


async def _get_operation_state(job_id: str) -> dict[str, Any] | None:
    redis = await _get_redis()
    try:
        raw = await redis.get(_state_key(job_id))
        if not raw:
            return None
        state = json.loads(raw)
        state["source"] = "redis"
        return state
    finally:
        await redis.aclose()


async def _set_operation_state(data: dict[str, Any]) -> dict[str, Any]:
    job_id = data.get("jobId", "")
    payload = {
        "leadId": data.get("leadId"),
        "jobId": job_id,
        "stage": data.get("stage"),
        "status": data.get("status"),
        "progress": data.get("progress"),
        "message": data.get("message"),
        "error": data.get("error"),
        "queueState": data.get("queueState"),
        "updatedAt": data.get("updatedAt") or datetime.now(timezone.utc).isoformat(),
    }
    # Clean None values
    payload = {k: v for k, v in payload.items() if v is not None}
    redis = await _get_redis()
    try:
        await redis.set(_state_key(job_id), json.dumps(payload), ex=OPERATION_STATE_TTL)
    finally:
        await redis.aclose()
    return payload


async def _request_cancel(data: dict[str, Any]) -> None:
    job_id = data.get("jobId", "")
    redis = await _get_redis()
    try:
        await redis.set(
            _cancel_key(job_id),
            json.dumps({
                "leadId": data.get("leadId"),
                "stage": data.get("stage"),
                "jobId": job_id,
                "message": data.get("message"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
            ex=OPERATION_CANCEL_TTL,
        )
        # Also update state to cancel_requested
        await _set_operation_state({
            **data,
            "status": "cancel_requested",
        })
    finally:
        await redis.aclose()


async def _clear_cancel(job_id: str) -> None:
    redis = await _get_redis()
    try:
        await redis.delete(_cancel_key(job_id))
    finally:
        await redis.aclose()


async def _emit_operation_event(data: dict[str, Any]) -> None:
    """Set operation state and publish SSE event via Redis pub/sub."""
    await _set_operation_state(data)
    lead_id = data.get("leadId", "")
    event = {
        "type": "leadOperation",
        "leadId": lead_id,
        "jobId": data.get("jobId"),
        "stage": data.get("stage"),
        "status": data.get("status"),
        "progress": data.get("progress"),
        "message": data.get("message"),
        "error": data.get("error"),
        "queueState": data.get("queueState"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    event = {k: v for k, v in event.items() if v is not None}
    redis = await _get_redis()
    try:
        channel = f"sse:lead:{lead_id}"
        await redis.publish(channel, json.dumps(event))
    except Exception:
        logger.warning("sse_event_publish_failed", lead_id=lead_id, exc_info=True)
    finally:
        await redis.aclose()


async def _publish_sse(lead_id: str, payload: dict[str, Any]) -> None:
    """Publish generic SSE notification."""
    redis = await _get_redis()
    try:
        channel = f"sse:lead:{lead_id}"
        await redis.publish(channel, json.dumps(payload))
    except Exception:
        logger.warning("sse_publish_failed", lead_id=lead_id, exc_info=True)
    finally:
        await redis.aclose()


# ---------------------------------------------------------------------------
# Database helpers (port of lib/oab-eval/operation-service.ts)
# ---------------------------------------------------------------------------

_LEAD_DATA_SELECT_FIELDS = [
    LeadOabData.id,
    LeadOabData.nome_real,
    LeadOabData.concluido,
    LeadOabData.manuscrito_processado,
    LeadOabData.aguardando_manuscrito,
    LeadOabData.espelho_processado,
    LeadOabData.aguardando_espelho,
    LeadOabData.analise_processada,
    LeadOabData.aguardando_analise,
    LeadOabData.analise_validada,
    LeadOabData.situacao,
    LeadOabData.nota_final,
]


async def _get_lead_operation_data(session: AsyncSession, lead_id: str) -> dict[str, Any] | None:
    """Fetch lead data for SSE serialization (with large fields masked)."""
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


async def _clear_awaiting_flag(session: AsyncSession, lead_id: str, stage: str) -> None:
    """Clear the 'aguardando' flag for the given stage."""
    field_map = {
        "transcription": "aguardando_manuscrito",
        "mirror": "aguardando_espelho",
        "analysis": "aguardando_analise",
    }
    field = field_map.get(stage)
    if not field:
        return
    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(**{field: False})
    )
    await session.commit()


async def _get_database_fallback(session: AsyncSession, lead_id: str, stage: str) -> dict[str, Any]:
    """Database-based status when queue/Redis data is unavailable."""
    stmt = select(LeadOabData).where(LeadOabData.id == lead_id)
    result = await session.execute(stmt)
    lo = result.scalar_one_or_none()

    if not lo:
        return {"status": "idle", "message": "Lead não encontrado"}

    stage_map = {
        "transcription": {
            "processed": lo.manuscrito_processado,
            "waiting": lo.aguardando_manuscrito,
        },
        "mirror": {
            "processed": lo.espelho_processado,
            "waiting": lo.aguardando_espelho,
        },
        "analysis": {
            "processed": lo.analise_processada,
            "waiting": lo.aguardando_analise,
        },
    }

    info = stage_map.get(stage, {"processed": False, "waiting": False})

    if info["processed"]:
        return {"status": "completed", "message": "Processamento concluído"}
    if info["waiting"]:
        return {"status": "queued", "message": "Aguardando processamento"}
    return {"status": "idle", "message": "Nenhuma operação em andamento"}


# ---------------------------------------------------------------------------
# 1. operations/status (GET)
# ---------------------------------------------------------------------------


async def get_operation_status(
    session: AsyncSession, lead_id: str, stage: str,
) -> dict[str, Any]:
    """Get current operation status from Redis state + database fallback."""
    if stage not in LEAD_OPERATION_STAGES:
        raise OperationsServiceError("stage inválido")

    job_id = _build_job_id(stage, lead_id)

    # Check Redis state
    redis_state = await _get_operation_state(job_id)
    if redis_state:
        return redis_state

    # Database fallback
    fallback = await _get_database_fallback(session, lead_id, stage)
    return {
        "leadId": lead_id,
        "jobId": job_id,
        "stage": stage,
        "status": fallback["status"],
        "message": fallback["message"],
        "source": "database",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# 2. operations/cancel (POST)
# ---------------------------------------------------------------------------


async def cancel_operation(
    session: AsyncSession, lead_id: str, stage: str,
) -> dict[str, Any]:
    """Cancel an operation — set cancel flag, clear awaiting, emit SSE."""
    if stage not in LEAD_OPERATION_STAGES:
        raise OperationsServiceError("stage inválido")

    job_id = _build_job_id(stage, lead_id)

    # Check Redis state to see if there's an active operation
    redis_state = await _get_operation_state(job_id)

    if redis_state and redis_state.get("status") == "processing":
        # Active operation — request cancellation
        await _request_cancel({
            "leadId": lead_id,
            "stage": stage,
            "jobId": job_id,
            "message": "Cancelamento solicitado pelo usuário.",
        })
        await _emit_operation_event({
            "leadId": lead_id,
            "jobId": job_id,
            "stage": stage,
            "status": "cancel_requested",
            "message": "Cancelamento solicitado. O worker vai encerrar a operação.",
            "queueState": "active",
        })
        return {
            "success": True,
            "operation": {
                "jobId": job_id,
                "leadId": lead_id,
                "stage": stage,
                "status": "cancel_requested",
            },
            "_status_code": 202,
        }

    # No active operation or waiting — cancel immediately
    try:
        await _clear_awaiting_flag(session, lead_id, stage)
    except Exception:
        logger.warning("clear_awaiting_flag_failed", lead_id=lead_id, stage=stage, exc_info=True)

    await _clear_cancel(job_id)
    await _emit_operation_event({
        "leadId": lead_id,
        "jobId": job_id,
        "stage": stage,
        "status": "canceled",
        "message": "Operação cancelada.",
        "queueState": None,
    })

    # SSE notification with lead data
    lead_data = await _get_lead_operation_data(session, lead_id)
    if lead_data:
        await _publish_sse(lead_id, {
            "type": "leadUpdate",
            "message": "Processamento cancelado.",
            "leadData": lead_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    return {
        "success": True,
        "operation": {
            "jobId": job_id,
            "leadId": lead_id,
            "stage": stage,
            "status": "canceled",
        },
    }


# ---------------------------------------------------------------------------
# 3. batch/send-for-analysis (POST)
# ---------------------------------------------------------------------------


async def batch_send_for_analysis(
    session: AsyncSession, leads_data: list[dict[str, Any]],
) -> dict[str, Any]:
    """Batch-enqueue leads for final analysis."""
    from domains.socialwise.tasks.lead_cells import process_lead_cell_task

    count = 0
    for item in leads_data:
        lead_id = item.get("leadId")
        if not lead_id:
            continue

        manuscrito = item.get("manuscrito")
        espelho = item.get("espelho")

        # Update DB with manuscrito + espelho data
        update_data: dict[str, Any] = {}
        if manuscrito is not None:
            update_data["prova_manuscrita"] = manuscrito
        if espelho is not None:
            espelho_images = espelho.get("imagens", []) if isinstance(espelho, dict) else []
            update_data["espelho_correcao"] = json.dumps(espelho_images) if espelho_images else None
            update_data["texto_do_espelho"] = espelho

        if update_data:
            await session.execute(
                update(LeadOabData)
                .where(LeadOabData.id == lead_id)
                .values(**update_data)
            )

        # Enqueue analysis job
        await process_lead_cell_task.kiq({
            "type": "analise",
            "leadID": lead_id,
            "analise": True,
        })
        count += 1

    if update_data:
        await session.commit()

    return {
        "message": f"{count} leads foram enfileirados para análise.",
        "_status_code": 202,
    }


# ---------------------------------------------------------------------------
# 4. atualizar-especialidade (PUT)
# ---------------------------------------------------------------------------


async def atualizar_especialidade(
    session: AsyncSession, payload: dict[str, Any],
) -> dict[str, Any]:
    """Update legal specialty and default mirror for a lead."""
    lead_id = payload.get("leadId")
    if not lead_id:
        raise OperationsServiceError("ID do lead é obrigatório")

    especialidade = payload.get("especialidade") or None
    espelho_padrao_id = payload.get("espelhoPadraoId") or None

    logger.info(
        "atualizar_especialidade",
        lead_id=lead_id,
        especialidade=especialidade,
        espelho_padrao_id=espelho_padrao_id,
    )

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            especialidade=especialidade,
            espelho_padrao_id=espelho_padrao_id,
        )
    )
    await session.commit()

    # Fetch updated record
    stmt = select(LeadOabData).where(LeadOabData.id == lead_id)
    result = await session.execute(stmt)
    lo = result.scalar_one_or_none()
    if not lo:
        raise OperationsServiceError("Lead não encontrado após atualização")

    return {
        "success": True,
        "message": "Especialidade e espelho padrão atualizados com sucesso",
        "lead": {
            "id": lo.id,
            "especialidade": lo.especialidade,
            "espelhoPadraoId": lo.espelho_padrao_id,
        },
    }


# ---------------------------------------------------------------------------
# 5. register-token (POST + GET)
# ---------------------------------------------------------------------------


async def register_token(
    session: AsyncSession, user_id: str, user_name: str | None, user_email: str | None,
    chatwit_access_token: str, chatwit_account_id: str,
) -> dict[str, Any]:
    """Register or update Chatwit token for a user."""
    token = chatwit_access_token.strip()
    account_id = chatwit_account_id.strip()

    if not token:
        raise OperationsServiceError("Token de acesso é obrigatório")
    if not account_id:
        raise OperationsServiceError("ID da conta Chatwit é obrigatório")

    # Ensure user exists
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    db_user = result.scalar_one_or_none()

    if not db_user:
        synthetic_email = user_email or f"{user_id}@local.invalid"
        db_user = User(id=user_id, email=synthetic_email, name=user_name or "Usuário")
        session.add(db_user)
        await session.flush()

    # Check token uniqueness
    stmt = select(UsuarioChatwit).where(
        UsuarioChatwit.chatwit_access_token == token,
        UsuarioChatwit.app_user_id != user_id,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise OperationsServiceError("Este token já está sendo usado por outro usuário")

    # Upsert UsuarioChatwit
    stmt = select(UsuarioChatwit).where(UsuarioChatwit.app_user_id == user_id)
    result = await session.execute(stmt)
    usuario = result.scalar_one_or_none()

    if usuario:
        await session.execute(
            update(UsuarioChatwit)
            .where(UsuarioChatwit.id == usuario.id)
            .values(
                chatwit_access_token=token,
                chatwit_account_id=account_id,
            )
        )
    else:
        from domains.socialwise.db.base import generate_cuid

        new_usuario = UsuarioChatwit(
            id=generate_cuid(),
            app_user_id=user_id,
            name=user_name or "Usuário",
            account_name="Conta Padrão",
            channel="WhatsApp",
            chatwit_account_id=account_id,
            chatwit_access_token=token,
        )
        session.add(new_usuario)

    await session.commit()

    logger.info("token_registered", user_id=user_id)

    return {"success": True, "message": "Token de acesso registrado com sucesso!"}


async def get_token_info(
    session: AsyncSession, user_id: str, user_name: str | None, user_email: str | None,
) -> dict[str, Any]:
    """Get current user token info."""
    # Ensure user exists
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    db_user = result.scalar_one_or_none()

    if not db_user:
        synthetic_email = user_email or f"{user_id}@local.invalid"
        db_user = User(id=user_id, email=synthetic_email, name=user_name or "Usuário")
        session.add(db_user)
        await session.flush()
        await session.commit()

    # Fetch UsuarioChatwit
    stmt = select(UsuarioChatwit).where(UsuarioChatwit.app_user_id == user_id)
    result = await session.execute(stmt)
    usuario = result.scalar_one_or_none()

    return {
        "user": {
            "id": db_user.id,
            "name": db_user.name,
            "email": db_user.email,
            "hasToken": bool(usuario and usuario.chatwit_access_token),
            "role": db_user.role,
            "chatwitAccessToken": (usuario.chatwit_access_token or "") if usuario else "",
            "chatwitAccountId": (usuario.chatwit_account_id or "") if usuario else "",
        }
    }
