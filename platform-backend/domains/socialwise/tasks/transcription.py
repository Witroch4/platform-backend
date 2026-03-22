"""TaskIQ worker for OAB transcription (manuscript OCR).

Port of: lib/oab-eval/transcription-queue.ts

Processes a transcription job:
1. Create cancel monitor
2. Call transcribe_manuscript() with per-page progress callback
3. SSE throttling: max 1 emit per 800ms
4. Cost tracking: batch CostEvents
5. Save result to LeadOabData.provaManuscrita
6. Enqueue downstream manuscrito job (lead_cells)
"""

from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import select, update

from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.oab_eval.operation_control import (
    CancelMonitor,
    LeadOperationCanceledError,
    build_job_id,
    clear_cancel,
    emit_operation_event,
)
from domains.socialwise.services.oab_eval.transcription_agent import (
    PageCompleteDetail,
    transcribe_manuscript,
)
from platform_core.ai.cost_tracker import track_cost_batch
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)

SSE_THROTTLE_MS = 800


@broker.task(task_name="process_transcription_task", retry_on_error=True, max_retries=2)
async def process_transcription_task(payload: dict[str, Any]) -> dict[str, Any]:
    """Process an OAB transcription job."""
    lead_id = payload["leadId"]
    images = payload["images"]  # list of URLs
    selected_provider = payload.get("selectedProvider")
    concurrency = payload.get("concurrency")

    job_id = build_job_id("transcription", lead_id)
    monitor = CancelMonitor(lead_id=lead_id, stage="transcription", job_id=job_id)
    monitor.start()

    last_sse_time = 0.0
    cost_events: list[dict[str, Any]] = []
    trace_id = f"transcription:{lead_id}:{int(time.time())}"

    async def on_page_complete(page_index: int, page_label: str, detail: PageCompleteDetail | None) -> None:
        nonlocal last_sse_time

        # Accumulate cost event
        if detail and detail.tokens_in + detail.tokens_out > 0:
            cost_events.append({
                "lead_id": lead_id,
                "stage": "transcription",
                "provider": detail.provider,
                "model": detail.model,
                "input_tokens": detail.tokens_in,
                "output_tokens": detail.tokens_out,
                "duration_ms": detail.duration_ms,
                "was_fallback": detail.was_fallback,
                "trace_id": trace_id,
            })

        # SSE throttling
        now = time.monotonic() * 1000
        if now - last_sse_time < SSE_THROTTLE_MS:
            return
        last_sse_time = now

        total_pages = len(images)
        progress = {
            "currentPage": page_index + 1,
            "totalPages": total_pages,
            "percentage": round(((page_index + 1) / total_pages) * 100),
        }

        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="transcription",
            status="processing",
            progress=progress,
            message=f"Transcrevendo página {page_index + 1}/{total_pages}",
        )

    try:
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="transcription",
            status="processing",
            message="Iniciando transcrição...",
        )

        async with session_ctx() as session:
            result = await transcribe_manuscript(
                session,
                lead_id=lead_id,
                images=images,
                selected_provider=selected_provider,
                concurrency=concurrency,
                on_page_complete=on_page_complete,
                cancel_check=monitor.check_cancelled,
            )

            # Save result to LeadOabData
            prova_manuscrita = {
                "pages": result.pages,
                "combinedText": result.combined_text,
                "segments": result.segments,
                "textoDAprova": result.texto_da_prova,
                "tokenUsage": result.token_usage,
                "primaryProvider": result.primary_provider,
                "primaryModel": result.primary_model,
            }

            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(
                    prova_manuscrita=prova_manuscrita,
                    manuscrito_processado=True,
                    aguardando_manuscrito=False,
                )
            )
            await session.execute(stmt)

            # Batch persist cost events
            if cost_events:
                await track_cost_batch(session, cost_events)

            await session.commit()

        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="transcription",
            status="completed",
            message="Transcrição concluída",
            meta={
                "pages": len(result.pages),
                "tokens": result.token_usage.get("totalInput", 0) + result.token_usage.get("totalOutput", 0),
            },
        )

        logger.info(
            "transcription_task_complete",
            lead_id=lead_id,
            pages=len(result.pages),
        )

        return {
            "leadId": lead_id,
            "success": True,
            "pages": len(result.pages),
            "processedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    except LeadOperationCanceledError:
        logger.info("transcription_cancelled", lead_id=lead_id)
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="transcription",
            status="canceled",
            message="Transcrição cancelada pelo usuário",
        )

        async with session_ctx() as session:
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(aguardando_manuscrito=False)
            )
            await session.execute(stmt)
            await session.commit()

        await clear_cancel(job_id)
        return {"leadId": lead_id, "success": False, "cancelled": True}

    except Exception as exc:
        logger.exception("transcription_task_failed", lead_id=lead_id)
        await emit_operation_event(
            lead_id=lead_id,
            job_id=job_id,
            stage="transcription",
            status="failed",
            error=str(exc)[:500],
            message="Falha na transcrição",
        )

        async with session_ctx() as session:
            stmt = (
                update(LeadOabData)
                .where(LeadOabData.lead_id == lead_id)
                .values(aguardando_manuscrito=False)
            )
            await session.execute(stmt)
            await session.commit()

        raise

    finally:
        await monitor.stop()
