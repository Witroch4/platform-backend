"""TaskIQ worker for Chatwit lead sync jobs.

Port of: worker/WebhookWorkerTasks/leads-chatwit.task.ts

Processes individual lead jobs from the Chatwit queue, delegating to
process_chatwit_lead_sync() for actual lead upsert logic.
"""

from __future__ import annotations

from typing import Any

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.leads.process_sync import process_chatwit_lead_sync
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@broker.task(task_name="process_lead_chatwit_task", retry_on_error=True, max_retries=3)
async def process_lead_chatwit_task(payload: dict[str, Any]) -> dict[str, Any]:
    """Process a single lead sync job from the Chatwit queue.

    Args:
        payload: Dict with 'usuario' and 'origem_lead'/'origemLead' keys.

    Returns:
        Dict with status, source_id, lead_created, lead_id, and arquivos count.
    """
    origem_lead = payload.get("origem_lead") or payload.get("origemLead") or {}
    source_id = origem_lead.get("source_id", "unknown")
    arquivos = origem_lead.get("arquivos", [])

    logger.info(
        "lead_chatwit_job_start",
        source_id=source_id,
        arquivos_count=len(arquivos) if isinstance(arquivos, list) else 0,
    )

    async with session_ctx() as session:
        result = await process_chatwit_lead_sync(session, payload)
        await session.commit()

    logger.info(
        "lead_chatwit_job_done",
        source_id=source_id,
        lead_created=result.lead_created,
        arquivos=result.arquivos,
    )

    return {
        "status": "processado",
        "source_id": source_id,
        "lead_created": result.lead_created,
        "lead_id": result.lead_id,
        "arquivos": result.arquivos,
    }
