"""TaskIQ worker for OAB analysis generation (comparative analysis).

Port of: worker/WebhookWorkerTasks/analysis-generation.task.ts

Processes an analysis job:
1. Create cancel monitor
2. Call run_analysis() with progress callback
3. Save result to LeadOabData.analisePreliminar
4. Emit SSE events for status updates
"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import update

from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.oab_eval.analysis_agent import run_analysis
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


@broker.task(task_name="process_analysis_generation_task", retry_on_error=True, max_retries=2)
async def process_analysis_generation_task(payload: dict[str, Any]) -> dict[str, Any]:
    """Process an OAB analysis generation job."""
    lead_id = payload["leadId"]
    texto_prova = payload["textoProva"]
    texto_espelho = payload["textoEspelho"]
    selected_provider = payload.get("selectedProvider")

    job_id = build_job_id("analysis", lead_id)
    monitor = CancelMonitor(lead_id=lead_id, stage="analysis", job_id=job_id)
    monitor.start()

    async def on_progress(step: str, data: Any) -> None:
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="analysis",
            status="processing",
            message=f"Analisando: {step}",
            meta=data if isinstance(data, dict) else {"step": step},
        )

    try:
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="analysis",
            status="processing",
            message="Iniciando análise comparativa...",
        )

        async with session_ctx() as session:
            result = await run_analysis(
                session,
                lead_id=lead_id,
                texto_prova=texto_prova,
                texto_espelho=texto_espelho,
                selected_provider=selected_provider,
                on_progress=on_progress,
                cancel_check=monitor.check_cancelled,
            )

            if result.get("success"):
                # Save analysis result
                stmt = (
                    update(LeadOabData)
                    .where(LeadOabData.lead_id == lead_id)
                    .values(
                        analise_preliminar=result.get("analysis"),
                        analise_processada=True,
                        aguardando_analise=False,
                    )
                )
                await session.execute(stmt)

                # Track cost
                token_usage = result.get("tokenUsage", {})
                if token_usage.get("total", 0) > 0:
                    await track_cost(
                        session,
                        lead_id=lead_id,
                        stage="analysis",
                        provider=result.get("provider", "unknown"),
                        model=result.get("model", "unknown"),
                        input_tokens=token_usage.get("input", 0),
                        output_tokens=token_usage.get("output", 0),
                        duration_ms=result.get("processingTimeMs", 0),
                    )
            else:
                # Mark as failed but not waiting
                stmt = (
                    update(LeadOabData)
                    .where(LeadOabData.lead_id == lead_id)
                    .values(aguardando_analise=False)
                )
                await session.execute(stmt)

            await session.commit()

        status = "completed" if result.get("success") else "failed"
        message = "Análise concluída" if result.get("success") else f"Falha: {result.get('error', 'unknown')}"

        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="analysis",
            status=status,
            message=message,
            error=result.get("error") if not result.get("success") else None,
        )

        logger.info("analysis_task_complete", lead_id=lead_id, success=result.get("success"))

        return {
            "leadId": lead_id,
            "success": result.get("success", False),
            "processedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    except LeadOperationCanceledError:
        logger.info("analysis_cancelled", lead_id=lead_id)
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="analysis",
            status="canceled",
            message="Análise cancelada pelo usuário",
        )

        async with session_ctx() as session:
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(aguardando_analise=False)
            )
            await session.execute(stmt)
            await session.commit()

        await clear_cancel(job_id)
        return {"leadId": lead_id, "success": False, "cancelled": True}

    except Exception as exc:
        logger.exception("analysis_task_failed", lead_id=lead_id)
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="analysis",
            status="failed",
            error=str(exc)[:500],
            message="Falha na análise",
        )

        async with session_ctx() as session:
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(aguardando_analise=False)
            )
            await session.execute(stmt)
            await session.commit()

        raise

    finally:
        await monitor.stop()
