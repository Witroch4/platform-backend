"""TaskIQ worker for OAB mirror generation (correction sheet extraction).

Port of: worker/WebhookWorkerTasks/mirror-generation.task.ts

Processes a mirror generation job:
1. Create cancel monitor
2. Call generate_mirror() with progress callback
3. Save result to LeadOabData (textoDOEspelho + metadata)
4. Emit SSE events for status updates
"""

from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import update

from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.oab_eval.mirror_generator import generate_mirror
from domains.socialwise.services.oab_eval.operation_control import (
    CancelMonitor,
    LeadOperationCanceledError,
    build_job_id,
    clear_cancel,
    emit_operation_event,
)
from platform_core.ai.cost_tracker import track_cost
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@broker.task(task_name="process_mirror_generation_task", retry_on_error=True, max_retries=2)
async def process_mirror_generation_task(payload: dict[str, Any]) -> dict[str, Any]:
    """Process an OAB mirror generation job."""
    lead_id = payload["leadId"]
    especialidade = payload["especialidade"]
    espelho_padrao_id = payload.get("espelhoPadraoId")
    images = payload["images"]
    selected_provider = payload.get("selectedProvider")

    job_id = build_job_id("mirror", lead_id)
    monitor = CancelMonitor(lead_id=lead_id, stage="mirror", job_id=job_id)
    monitor.start()

    async def on_progress(step: str, data: Any) -> None:
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="mirror",
            status="processing",
            message=f"Extraindo espelho: {step}",
            meta=data if isinstance(data, dict) else {"step": step},
        )

    try:
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="mirror",
            status="processing",
            message="Iniciando extração do espelho...",
        )

        async with session_ctx() as session:
            result = await generate_mirror(
                session,
                lead_id=lead_id,
                especialidade=especialidade,
                espelho_padrao_id=espelho_padrao_id,
                images=images,
                selected_provider=selected_provider,
                on_progress=on_progress,
                cancel_check=monitor.check_cancelled,
            )

            # Save to LeadOabData
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(
                    texto_do_espelho=result.get("jsonMirror"),
                    espelho_processado=True,
                    aguardando_espelho=False,
                )
            )
            await session.execute(stmt)

            # Track cost
            token_usage = result.get("tokenUsage", {})
            if token_usage.get("total", 0) > 0:
                await track_cost(
                    session,
                    lead_id=lead_id,
                    stage="mirror",
                    provider=result.get("provider", "unknown"),
                    model=result.get("model", "unknown"),
                    input_tokens=token_usage.get("input", 0),
                    output_tokens=token_usage.get("output", 0),
                    duration_ms=result.get("durationMs", 0),
                )

            await session.commit()

        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="mirror",
            status="completed",
            message="Espelho extraído com sucesso",
        )

        logger.info("mirror_task_complete", lead_id=lead_id)

        return {
            "leadId": lead_id,
            "success": True,
            "processedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    except LeadOperationCanceledError:
        logger.info("mirror_cancelled", lead_id=lead_id)
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="mirror",
            status="canceled",
            message="Extração do espelho cancelada",
        )

        async with session_ctx() as session:
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(aguardando_espelho=False)
            )
            await session.execute(stmt)
            await session.commit()

        await clear_cancel(job_id)
        return {"leadId": lead_id, "success": False, "cancelled": True}

    except Exception as exc:
        logger.exception("mirror_task_failed", lead_id=lead_id)
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="mirror",
            status="failed",
            error=str(exc)[:500],
            message="Falha na extração do espelho",
        )

        async with session_ctx() as session:
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(aguardando_espelho=False)
            )
            await session.execute(stmt)
            await session.commit()

        raise

    finally:
        await monitor.stop()
