"""TaskIQ worker for Socialwise Agendamento jobs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import httpx

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.agendamento import prepare_webhook_data
from domains.socialwise.tasks.scheduler import dynamic_schedule_source
from platform_core.config import settings
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@dataclass(slots=True)
class AgendamentoJobPayload:
    agendamento_id: str
    data: datetime
    user_id: str
    account_id: str
    diario: bool = False
    semanal: bool = False
    tratar_como_postagens_individuais: bool = False

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "AgendamentoJobPayload":
        raw_date = payload.get("Data") or payload.get("data")
        if isinstance(raw_date, datetime):
            parsed_date = raw_date if raw_date.tzinfo else raw_date.replace(tzinfo=timezone.utc)
        elif isinstance(raw_date, str):
            parsed_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        else:
            raise ValueError("Agendamento payload requires 'Data'")

        return cls(
            agendamento_id=str(payload["agendamentoId"]),
            data=parsed_date,
            user_id=str(payload["userId"]),
            account_id=str(payload["accountId"]),
            diario=bool(payload.get("Diario", False)),
            semanal=bool(payload.get("Semanal", False)),
            tratar_como_postagens_individuais=bool(payload.get("TratarComoPostagensIndividuais", False)),
        )

    def to_payload(self) -> dict[str, Any]:
        return {
            "agendamentoId": self.agendamento_id,
            "Data": self.data.isoformat(),
            "userId": self.user_id,
            "accountId": self.account_id,
            "Diario": self.diario,
            "Semanal": self.semanal,
            "TratarComoPostagensIndividuais": self.tratar_como_postagens_individuais,
        }

    def next_daily(self) -> "AgendamentoJobPayload":
        return AgendamentoJobPayload(
            agendamento_id=self.agendamento_id,
            data=self.data + timedelta(days=1),
            user_id=self.user_id,
            account_id=self.account_id,
            diario=True,
            semanal=False,
            tratar_como_postagens_individuais=self.tratar_como_postagens_individuais,
        )

    def next_weekly(self) -> "AgendamentoJobPayload":
        return AgendamentoJobPayload(
            agendamento_id=self.agendamento_id,
            data=self.data + timedelta(days=7),
            user_id=self.user_id,
            account_id=self.account_id,
            diario=False,
            semanal=True,
            tratar_como_postagens_individuais=self.tratar_como_postagens_individuais,
        )


def agendamento_schedule_ids(agendamento_id: str) -> dict[str, str]:
    base = f"socialwise:agendamento:{agendamento_id}"
    return {
        "main": f"{base}:main",
        "daily": f"{base}:daily",
        "weekly": f"{base}:weekly",
    }


async def enqueue_agendamento_task(
    payload: AgendamentoJobPayload,
    *,
    schedule_kind: str = "main",
) -> dict[str, str]:
    schedule_ids = agendamento_schedule_ids(payload.agendamento_id)
    scheduled_for = payload.data if payload.data.tzinfo else payload.data.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    if scheduled_for <= now:
        task = await process_agendamento_task.kiq(payload.to_payload())
        return {
            "dispatch": "immediate",
            "taskId": task.task_id,
            "scheduledFor": scheduled_for.isoformat(),
        }

    await (
        process_agendamento_task.kicker()
        .with_schedule_id(schedule_ids[schedule_kind])
        .schedule_by_time(
            dynamic_schedule_source,
            scheduled_for,
            payload.to_payload(),
        )
    )
    return {"dispatch": "scheduled", "scheduledFor": scheduled_for.isoformat(), "scheduleId": schedule_ids[schedule_kind]}


async def cancel_agendamento_schedules(agendamento_id: str) -> None:
    for schedule_id in agendamento_schedule_ids(agendamento_id).values():
        try:
            await dynamic_schedule_source.delete_schedule(schedule_id)
        except Exception:
            logger.debug("socialwise_agendamento_schedule_delete_ignored", schedule_id=schedule_id)


@broker.task(retry_on_error=True, max_retries=3)
async def process_agendamento_task(job_data: dict[str, Any]) -> dict[str, Any]:
    payload = AgendamentoJobPayload.from_payload(job_data)
    if not settings.socialwise_webhook_url:
        raise ValueError("WEBHOOK_URL/SOCIALWISE_WEBHOOK_URL is not configured for Socialwise agendamento worker")

    async with session_ctx() as session:
        prepared = await prepare_webhook_data(session, payload.agendamento_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            settings.socialwise_webhook_url,
            json=prepared.payload,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()

    scheduled_next: list[dict[str, str]] = []
    if prepared.agendamento.diario:
        scheduled_next.append(await enqueue_agendamento_task(payload.next_daily(), schedule_kind="daily"))
    if prepared.agendamento.semanal:
        scheduled_next.append(await enqueue_agendamento_task(payload.next_weekly(), schedule_kind="weekly"))

    logger.info(
        "socialwise_agendamento_processed",
        agendamento_id=payload.agendamento_id,
        status_code=response.status_code,
        next_runs=len(scheduled_next),
    )
    return {
        "success": True,
        "message": "Agendamento processado com sucesso",
        "statusCode": response.status_code,
        "scheduledNext": scheduled_next,
    }
