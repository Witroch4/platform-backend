"""Internal task bridge routes for Socialwise workers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from domains.socialwise.tasks.agendamento import (
    AgendamentoJobPayload,
    cancel_agendamento_schedules,
    enqueue_agendamento_task,
)
from domains.socialwise.tasks.flow_builder import process_flow_builder_task
from domains.socialwise.tasks.flow_campaign import process_flow_campaign_task
from domains.socialwise.tasks.lead_cells import process_lead_cell_task
from domains.socialwise.tasks.leads_chatwit import process_lead_chatwit_task
from domains.socialwise.tasks.scheduler import dynamic_schedule_source
from platform_core.auth.dependencies import require_api_key
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/socialwise/tasks", tags=["socialwise-tasks"])


class EnqueueSocialwiseTaskRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    kind: Literal["flow_builder", "flow_campaign", "lead_chatwit", "lead_cell", "agendamento"]
    payload: dict[str, Any] = Field(default_factory=dict)
    action: Literal["enqueue", "cancel"] = "enqueue"
    schedule_at: datetime | None = Field(default=None, alias="scheduleAt")
    schedule_id: str | None = Field(default=None, alias="scheduleId")
    schedule_kind: str | None = Field(default=None, alias="scheduleKind")

    @model_validator(mode="after")
    def validate_request(self) -> "EnqueueSocialwiseTaskRequest":
        if self.action == "cancel" and self.kind != "agendamento":
            raise ValueError("Only agendamento tasks support cancel action")

        if self.schedule_at and self.kind != "flow_builder":
            raise ValueError("scheduleAt is currently supported only for flow_builder tasks")

        if self.schedule_id and not self.schedule_at:
            raise ValueError("scheduleId requires scheduleAt")

        if self.action == "cancel" and not (
            self.payload.get("agendamentoId") or self.payload.get("agendamento_id")
        ):
            raise ValueError("Agendamento cancel requires agendamentoId")

        return self


def _normalize_datetime(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def _enqueue_flow_builder(request: EnqueueSocialwiseTaskRequest) -> dict[str, Any]:
    if request.schedule_at:
        scheduled_for = _normalize_datetime(request.schedule_at)
        schedule_id = request.schedule_id or f"socialwise:flow-builder:{uuid4().hex}"
        await (
            process_flow_builder_task.kicker()
            .with_schedule_id(schedule_id)
            .schedule_by_time(
                dynamic_schedule_source,
                scheduled_for,
                request.payload,
            )
        )
        return {
            "kind": request.kind,
            "action": request.action,
            "dispatch": "scheduled",
            "scheduleId": schedule_id,
            "scheduledFor": scheduled_for.isoformat(),
        }

    task = await process_flow_builder_task.kiq(request.payload)
    return {
        "kind": request.kind,
        "action": request.action,
        "dispatch": "immediate",
        "taskId": task.task_id,
    }


async def _enqueue_flow_campaign(request: EnqueueSocialwiseTaskRequest) -> dict[str, Any]:
    task = await process_flow_campaign_task.kiq(request.payload)
    return {
        "kind": request.kind,
        "action": request.action,
        "dispatch": "immediate",
        "taskId": task.task_id,
    }


async def _enqueue_lead_chatwit(request: EnqueueSocialwiseTaskRequest) -> dict[str, Any]:
    task = await process_lead_chatwit_task.kiq(request.payload)
    return {
        "kind": request.kind,
        "action": request.action,
        "dispatch": "immediate",
        "taskId": task.task_id,
    }


async def _enqueue_lead_cell(request: EnqueueSocialwiseTaskRequest) -> dict[str, Any]:
    task = await process_lead_cell_task.kiq(request.payload)
    return {
        "kind": request.kind,
        "action": request.action,
        "dispatch": "immediate",
        "taskId": task.task_id,
    }


async def _enqueue_agendamento(request: EnqueueSocialwiseTaskRequest) -> dict[str, Any]:
    if request.action == "cancel":
        agendamento_id = str(request.payload.get("agendamentoId") or request.payload.get("agendamento_id"))
        await cancel_agendamento_schedules(agendamento_id)
        return {
            "kind": request.kind,
            "action": request.action,
            "dispatch": "cancelled",
            "agendamentoId": agendamento_id,
        }

    result = await enqueue_agendamento_task(
        AgendamentoJobPayload.from_payload(request.payload),
        schedule_kind=request.schedule_kind or "main",
    )
    return {
        "kind": request.kind,
        "action": request.action,
        **result,
    }


@router.post("/enqueue")
async def enqueue_socialwise_task(
    request: EnqueueSocialwiseTaskRequest,
    _: Annotated[str, Depends(require_api_key)],
):
    try:
        dispatchers = {
            "flow_builder": _enqueue_flow_builder,
            "flow_campaign": _enqueue_flow_campaign,
            "lead_chatwit": _enqueue_lead_chatwit,
            "lead_cell": _enqueue_lead_cell,
            "agendamento": _enqueue_agendamento,
        }
        response = await dispatchers[request.kind](request)
        return {"success": True, **response}
    except ValidationError as exc:
        return JSONResponse({"success": False, "error": "Payload inválido", "details": exc.errors()}, status_code=400)
    except ValueError as exc:
        return JSONResponse({"success": False, "error": str(exc)}, status_code=400)
    except Exception as exc:
        logger.exception(
            "socialwise_task_bridge_enqueue_failed",
            kind=request.kind,
            action=request.action,
            error=str(exc),
        )
        return JSONResponse(
            {"success": False, "error": "Falha ao enfileirar task no Socialwise bridge"},
            status_code=500,
        )
