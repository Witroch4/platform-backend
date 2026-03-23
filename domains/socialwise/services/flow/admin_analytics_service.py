"""Business logic for the Flow Analytics admin routes (B.7.6)."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import status
from redis.asyncio import Redis
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.models.flow import Flow, FlowEdge, FlowNode
from domains.socialwise.db.models.flow_session import FlowSession
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

KPI_CACHE_TTL_SECONDS = 30
HEATMAP_CACHE_TTL_SECONDS = 60
FUNNEL_CACHE_TTL_SECONDS = 60
MAX_DATE_RANGE_DAYS = 366

FLOW_TYPE_TO_BUILDER_TYPE: dict[str, str] = {
    "START": "start",
    "END": "end",
    "TEXT_MESSAGE": "text_message",
    "INTERACTIVE_MESSAGE": "interactive_message",
    "TEMPLATE": "template",
    "WHATSAPP_TEMPLATE": "whatsapp_template",
    "MEDIA": "media",
    "DELAY": "delay",
    "CONDITION": "condition",
    "SET_VARIABLE": "text_message",
    "HTTP_REQUEST": "text_message",
    "ADD_TAG": "add_tag",
    "REMOVE_TAG": "remove_tag",
    "TRANSFER": "handoff",
    "REACTION": "emoji_reaction",
    "QUICK_REPLIES": "quick_replies",
    "CAROUSEL": "carousel",
    "CHATWIT_ACTION": "chatwit_action",
    "WAIT_FOR_REPLY": "wait_for_reply",
    "GENERATE_PAYMENT_LINK": "generate_payment_link",
}

HEALTH_SEVERITY_ORDER = {
    "critical": 0,
    "warning": 1,
    "info": 2,
}


@dataclass(slots=True)
class FlowAnalyticsServiceError(Exception):
    message: str
    status_code: int = status.HTTP_400_BAD_REQUEST
    payload: dict[str, Any] | None = None


@dataclass(slots=True)
class AnalyticsFilters:
    inbox_id: str | None = None
    flow_id: str | None = None
    date_start: datetime | None = None
    date_end: datetime | None = None
    status: tuple[str, ...] = ()
    campaign: str | None = None
    channel_type: str | None = None
    user_tag: str | None = None


@dataclass(slots=True)
class ParsedExecutionLogEntry:
    node_id: str
    node_type: str
    timestamp_ms: int
    duration_ms: int
    delivery_mode: str
    result: str
    detail: str | None = None
    action: str | None = None
    button_clicked: str | None = None


@dataclass(slots=True)
class ParsedFlowSession:
    id: str
    flow_id: str
    flow_name: str
    inbox_id: str
    conversation_id: str
    contact_id: str
    status: str
    current_node_id: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    variables: dict[str, Any]
    execution_log: list[ParsedExecutionLogEntry]


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return _ensure_utc(value).isoformat().replace("+00:00", "Z")


def _to_epoch_ms(value: datetime) -> int:
    return int(_ensure_utc(value).timestamp() * 1000)


def _first_present(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return default
        try:
            return int(float(raw))
        except ValueError:
            return default
    return default


def _parse_datetime_value(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return _ensure_utc(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        normalized = raw.replace("Z", "+00:00")
        try:
            return _ensure_utc(datetime.fromisoformat(normalized))
        except ValueError:
            return None
    return None


def _is_reasonable_epoch_ms(value: int) -> bool:
    minimum = 946684800000  # 2000-01-01T00:00:00Z
    maximum = int((time.time() + 86400) * 1000)
    return minimum <= value <= maximum


def _parse_timestamp_ms(
    raw_value: Any,
    session_created_at: datetime,
    fallback_timestamp_ms: int,
) -> int:
    parsed_datetime = _parse_datetime_value(raw_value)
    if parsed_datetime is not None:
        return _to_epoch_ms(parsed_datetime)

    if isinstance(raw_value, (int, float)):
        numeric = int(raw_value)
        if _is_reasonable_epoch_ms(numeric):
            return numeric

        current_unix_seconds = int(time.time()) + 86400
        if 946684800 <= numeric <= current_unix_seconds:
            return numeric * 1000

    return fallback_timestamp_ms


def _normalize_execution_log(raw_log: Any, session_created_at: datetime) -> list[ParsedExecutionLogEntry]:
    if not isinstance(raw_log, list):
        return []

    session_created_ms = _to_epoch_ms(session_created_at)
    fallback_offset_ms = 0
    normalized: list[ParsedExecutionLogEntry] = []

    for item in raw_log:
        if not isinstance(item, dict):
            continue

        duration_ms = max(
            0,
            _safe_int(_first_present(item, "durationMs", "duration_ms", "duration"), 0),
        )
        fallback_timestamp_ms = session_created_ms + fallback_offset_ms
        timestamp_ms = _parse_timestamp_ms(
            _first_present(item, "timestamp", "createdAt", "created_at"),
            session_created_at,
            fallback_timestamp_ms,
        )

        if not _is_reasonable_epoch_ms(timestamp_ms):
            timestamp_ms = fallback_timestamp_ms

        normalized.append(
            ParsedExecutionLogEntry(
                node_id=str(_first_present(item, "nodeId", "node_id") or ""),
                node_type=str(_first_present(item, "nodeType", "node_type") or "UNKNOWN"),
                timestamp_ms=timestamp_ms,
                duration_ms=duration_ms,
                delivery_mode=str(_first_present(item, "deliveryMode", "delivery_mode") or "sync"),
                result=str(_first_present(item, "result", "status") or "ok"),
                detail=(
                    str(_first_present(item, "detail", "errorDetail", "error_detail"))
                    if _first_present(item, "detail", "errorDetail", "error_detail") is not None
                    else None
                ),
                action=(
                    str(_first_present(item, "action"))
                    if _first_present(item, "action") is not None
                    else None
                ),
                button_clicked=(
                    str(_first_present(item, "buttonClicked", "button_clicked"))
                    if _first_present(item, "buttonClicked", "button_clicked") is not None
                    else None
                ),
            )
        )
        fallback_offset_ms = max(fallback_offset_ms + duration_ms, timestamp_ms - session_created_ms + duration_ms)

    return normalized


def _normalize_flow_session(flow_session: FlowSession, flow_name: str) -> ParsedFlowSession:
    created_at = _ensure_utc(flow_session.created_at)
    completed_at = _ensure_utc(flow_session.completed_at) if flow_session.completed_at else None
    updated_at = _ensure_utc(flow_session.updated_at)
    variables = flow_session.variables if isinstance(flow_session.variables, dict) else {}
    execution_log = _normalize_execution_log(flow_session.execution_log, created_at)

    return ParsedFlowSession(
        id=flow_session.id,
        flow_id=flow_session.flow_id,
        flow_name=flow_name,
        inbox_id=flow_session.inbox_id,
        conversation_id=flow_session.conversation_id,
        contact_id=flow_session.contact_id,
        status=flow_session.status.value if hasattr(flow_session.status, "value") else str(flow_session.status),
        current_node_id=flow_session.current_node_id,
        created_at=created_at,
        updated_at=updated_at,
        completed_at=completed_at,
        variables=variables,
        execution_log=execution_log,
    )


def _get_node_name(node_type: str, node_id: str, config: dict[str, Any] | None) -> str:
    config = config or {}
    for key in ("name", "label"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    text_value = config.get("text")
    if isinstance(text_value, str) and text_value.strip():
        return text_value.strip()[:50]

    title_value = config.get("title")
    if isinstance(title_value, str) and title_value.strip():
        return title_value.strip()[:50]

    node_type_labels = {
        "START": "Início",
        "END": "Fim",
        "INTERACTIVE_MESSAGE": "Mensagem interativa",
        "TEXT_MESSAGE": "Mensagem de texto",
        "MEDIA": "Mídia",
        "DELAY": "Espera",
        "WAIT_FOR_REPLY": "Aguardar resposta",
        "WHATSAPP_TEMPLATE": "Template WhatsApp",
        "CHATWIT_ACTION": "Ação Chatwit",
        "GENERATE_PAYMENT_LINK": "Link de pagamento",
    }
    return node_type_labels.get(node_type, node_id)


def _serialize_flow_for_heatmap(flow: Flow) -> dict[str, Any]:
    sorted_nodes = sorted(flow.nodes, key=lambda node: (node.position_x, node.position_y, node.id))
    sorted_edges = sorted(flow.edges, key=lambda edge: edge.id)

    return {
        "id": flow.id,
        "name": flow.name,
        "nodes": [
            {
                "id": node.id,
                "type": FLOW_TYPE_TO_BUILDER_TYPE.get(node.node_type, "text_message"),
                "position": {
                    "x": node.position_x,
                    "y": node.position_y,
                },
                "data": {
                    "label": _get_node_name(node.node_type, node.id, node.config),
                },
            }
            for node in sorted_nodes
        ],
        "edges": [
            {
                "id": edge.id,
                "source": edge.source_node_id,
                "target": edge.target_node_id,
                **({"sourceHandle": edge.button_id} if edge.button_id else {}),
                **({"data": {"conditionBranch": edge.condition_branch}} if edge.condition_branch else {}),
            }
            for edge in sorted_edges
        ],
    }


def _extract_buttons(config: dict[str, Any] | None) -> list[dict[str, str]]:
    config = config or {}
    buttons: list[dict[str, str]] = []

    raw_buttons = config.get("buttons")
    if isinstance(raw_buttons, list):
        for button in raw_buttons:
            if not isinstance(button, dict):
                continue
            button_id = button.get("id")
            button_title = button.get("title") or button.get("text")
            if button_id and button_title:
                buttons.append({"id": str(button_id), "text": str(button_title)})

    action = config.get("action")
    if isinstance(action, dict):
        action_buttons = action.get("buttons")
        if isinstance(action_buttons, list):
            for button in action_buttons:
                if not isinstance(button, dict):
                    continue
                button_id = button.get("id")
                button_title = button.get("title") or button.get("text")
                if button_id and button_title:
                    buttons.append({"id": str(button_id), "text": str(button_title)})

    elements = config.get("elements")
    if isinstance(elements, list):
        for element in elements:
            if not isinstance(element, dict):
                continue
            if str(element.get("type") or "").lower() != "button":
                continue
            button_id = element.get("id")
            button_title = element.get("title") or element.get("text")
            if button_id and button_title:
                buttons.append({"id": str(button_id), "text": str(button_title)})

    deduped: dict[str, dict[str, str]] = {}
    for button in buttons:
        deduped[button["id"]] = button
    return list(deduped.values())


def _health_status(drop_off_rate: float) -> str:
    if drop_off_rate < 20:
        return "healthy"
    if drop_off_rate < 50:
        return "moderate"
    return "critical"


def _node_catalog(flow: Flow) -> dict[str, dict[str, Any]]:
    return {
        node.id: {
            "name": _get_node_name(node.node_type, node.id, node.config),
            "node_type": node.node_type,
            "builder_type": FLOW_TYPE_TO_BUILDER_TYPE.get(node.node_type, "text_message"),
            "config": node.config or {},
        }
        for node in flow.nodes
    }


def _active_or_abandoned_end(session: ParsedFlowSession) -> datetime:
    return session.completed_at or session.updated_at or _now_utc()


def _compute_kpis(sessions: list[ParsedFlowSession]) -> dict[str, Any]:
    total_sessions = len(sessions)
    if total_sessions == 0:
        return {
            "totalExecutions": 0,
            "completionRate": 0,
            "abandonmentRate": 0,
            "avgTimeToCompletion": 0,
            "avgTimeToAbandonment": 0,
            "errorRate": 0,
            "startToEndRate": 0,
            "startToFirstInteractionRate": 0,
            "avgClickThroughRate": 0,
            "avgResponseRateAfterDelay": 0,
        }

    completed_sessions = [session for session in sessions if session.status == "COMPLETED"]
    error_sessions = [session for session in sessions if session.status == "ERROR"]
    abandoned_sessions = [
        session for session in sessions if session.status not in {"COMPLETED", "ERROR"}
    ]

    total_completion_ms = 0
    completion_count = 0
    total_abandonment_ms = 0
    abandonment_count = 0
    start_to_end_count = 0
    start_to_first_interaction_count = 0
    total_interactive_messages = 0
    total_button_clicks = 0
    total_delay_nodes = 0
    responses_after_delay = 0

    for session in sessions:
        if session.status == "COMPLETED" and session.completed_at:
            total_completion_ms += max(0, _to_epoch_ms(session.completed_at) - _to_epoch_ms(session.created_at))
            completion_count += 1

        if session.status not in {"COMPLETED", "ERROR"}:
            abandonment_end = _active_or_abandoned_end(session)
            total_abandonment_ms += max(0, _to_epoch_ms(abandonment_end) - _to_epoch_ms(session.created_at))
            abandonment_count += 1

        if not session.execution_log:
            continue

        has_start_node = any(entry.node_type == "START" for entry in session.execution_log)
        has_end_node = any(entry.node_type == "END" for entry in session.execution_log)
        if has_start_node and has_end_node:
            start_to_end_count += 1

        if has_start_node and any(
            entry.node_type in {"INTERACTIVE_MESSAGE", "TEXT_MESSAGE", "MEDIA"}
            for entry in session.execution_log
        ):
            start_to_first_interaction_count += 1

        for index, entry in enumerate(session.execution_log):
            if entry.node_type == "INTERACTIVE_MESSAGE":
                total_interactive_messages += 1
                if (
                    entry.button_clicked
                    or entry.action == "button_click"
                    or (entry.detail and entry.detail.startswith("button:"))
                ):
                    total_button_clicks += 1

            if entry.node_type == "DELAY":
                total_delay_nodes += 1
                if index < len(session.execution_log) - 1:
                    responses_after_delay += 1

    completion_rate = (len(completed_sessions) / total_sessions) * 100
    error_rate = (len(error_sessions) / total_sessions) * 100
    abandonment_rate = (len(abandoned_sessions) / total_sessions) * 100
    avg_time_to_completion = total_completion_ms / completion_count if completion_count else 0
    avg_time_to_abandonment = total_abandonment_ms / abandonment_count if abandonment_count else 0
    start_to_end_rate = (start_to_end_count / total_sessions) * 100
    start_to_first_interaction_rate = (start_to_first_interaction_count / total_sessions) * 100
    avg_click_through_rate = (
        (total_button_clicks / total_interactive_messages) * 100
        if total_interactive_messages
        else 0
    )
    avg_response_rate_after_delay = (
        (responses_after_delay / total_delay_nodes) * 100 if total_delay_nodes else 0
    )

    return {
        "totalExecutions": total_sessions,
        "completionRate": round(completion_rate, 2),
        "abandonmentRate": round(abandonment_rate, 2),
        "avgTimeToCompletion": round(avg_time_to_completion),
        "avgTimeToAbandonment": round(avg_time_to_abandonment),
        "errorRate": round(error_rate, 2),
        "startToEndRate": round(start_to_end_rate, 2),
        "startToFirstInteractionRate": round(start_to_first_interaction_rate, 2),
        "avgClickThroughRate": round(avg_click_through_rate, 2),
        "avgResponseRateAfterDelay": round(avg_response_rate_after_delay, 2),
    }


def _compute_heatmap(
    sessions: list[ParsedFlowSession],
    flow: Flow,
) -> list[dict[str, Any]]:
    if not sessions:
        return []

    node_metrics: dict[str, dict[str, float]] = {}

    for session in sessions:
        visited_nodes: set[str] = set()
        for entry in session.execution_log:
            if not entry.node_id or entry.node_id in visited_nodes:
                continue
            visited_nodes.add(entry.node_id)
            metrics = node_metrics.setdefault(
                entry.node_id,
                {
                    "visit_count": 0,
                    "drop_offs": 0,
                    "total_time_before_leaving": 0,
                },
            )
            metrics["visit_count"] += 1

        if session.status == "COMPLETED" or not session.execution_log:
            continue

        last_entry = session.execution_log[-1]
        metrics = node_metrics.setdefault(
            last_entry.node_id,
            {
                "visit_count": 0,
                "drop_offs": 0,
                "total_time_before_leaving": 0,
            },
        )
        metrics["drop_offs"] += 1
        time_before_leaving = max(
            0,
            _to_epoch_ms(_active_or_abandoned_end(session)) - last_entry.timestamp_ms,
        )
        metrics["total_time_before_leaving"] += time_before_leaving

    start_node_visits = sum(
        1 for session in sessions if any(entry.node_type == "START" for entry in session.execution_log)
    ) or len(sessions)

    catalog = _node_catalog(flow)
    heatmap_data: list[dict[str, Any]] = []

    for node_id, metrics in node_metrics.items():
        visit_count = int(metrics["visit_count"])
        drop_off_count = int(metrics["drop_offs"])
        drop_off_rate = (drop_off_count / visit_count) * 100 if visit_count else 0
        avg_time_before_leaving = (
            metrics["total_time_before_leaving"] / drop_off_count if drop_off_count else 0
        )
        visit_percentage = (visit_count / start_node_visits) * 100 if start_node_visits else 0
        node_info = catalog.get(node_id, {})

        heatmap_data.append(
            {
                "nodeId": node_id,
                "nodeName": node_info.get("name", node_id),
                "nodeType": node_info.get("builder_type", "text_message"),
                "visitCount": visit_count,
                "visitPercentage": round(visit_percentage, 2),
                "avgTimeBeforeLeaving": round(avg_time_before_leaving),
                "dropOffRate": round(drop_off_rate, 2),
                "healthStatus": _health_status(drop_off_rate),
                "isBottleneck": drop_off_rate > 50,
            }
        )

    heatmap_data.sort(key=lambda item: (-item["visitCount"], item["nodeId"]))
    return heatmap_data


def _define_funnel_steps(flow: Flow) -> list[str]:
    sorted_nodes = sorted(flow.nodes, key=lambda node: (node.position_x, node.position_y, node.id))
    steps: list[str] = []

    start_node = next((node for node in sorted_nodes if node.node_type == "START"), None)
    if start_node:
        steps.append(start_node.id)

    for node in sorted_nodes:
        if node.node_type == "INTERACTIVE_MESSAGE":
            steps.append(node.id)

    end_node = next((node for node in sorted_nodes if node.node_type == "END"), None)
    if end_node:
        steps.append(end_node.id)

    return steps


def _compute_funnel(
    sessions: list[ParsedFlowSession],
    flow: Flow,
) -> list[dict[str, Any]]:
    if not sessions:
        return []

    funnel_node_ids = _define_funnel_steps(flow)
    if not funnel_node_ids:
        return []

    step_counts = [0 for _ in funnel_node_ids]
    for session in sessions:
        visited_nodes = {entry.node_id for entry in session.execution_log if entry.node_id}
        for index, node_id in enumerate(funnel_node_ids):
            if node_id not in visited_nodes:
                break
            if all(previous_id in visited_nodes for previous_id in funnel_node_ids[:index]):
                step_counts[index] += 1
            else:
                break

    start_count = step_counts[0] if step_counts else 0
    catalog = _node_catalog(flow)
    funnel_steps: list[dict[str, Any]] = []
    for index, node_id in enumerate(funnel_node_ids):
        session_count = step_counts[index]
        next_step_count = step_counts[index + 1] if index < len(step_counts) - 1 else session_count
        drop_off_count = max(0, session_count - next_step_count)
        drop_off_percentage = (drop_off_count / session_count) * 100 if session_count else 0
        percentage = (session_count / start_count) * 100 if start_count else 0
        node_info = catalog.get(node_id, {})

        funnel_steps.append(
            {
                "stepIndex": index,
                "nodeId": node_id,
                "nodeName": node_info.get("name", node_id),
                "sessionCount": session_count,
                "percentage": round(percentage, 2),
                "dropOffCount": drop_off_count,
                "dropOffPercentage": round(drop_off_percentage, 2),
            }
        )

    return funnel_steps


def _builder_node_type(node_type: str, config: dict[str, Any]) -> str:
    if node_type == "REACTION":
        if config.get("emoji"):
            return "emoji_reaction"
        return "text_reaction"
    return FLOW_TYPE_TO_BUILDER_TYPE.get(node_type, "text_message")


def _compute_node_details(
    flow: Flow,
    node_id: str,
    sessions: list[ParsedFlowSession],
) -> dict[str, Any] | None:
    node = next((candidate for candidate in flow.nodes if candidate.id == node_id), None)
    if node is None:
        return None

    visit_count = 0
    drop_offs = 0
    total_time_before_leaving = 0
    session_samples: list[dict[str, Any]] = []
    execution_log_samples: list[dict[str, Any]] = []
    button_stats: dict[str, dict[str, Any]] = {}
    start_node_visits = 0

    for session in sessions:
        if any(entry.node_type == "START" for entry in session.execution_log):
            start_node_visits += 1

        node_visits = [entry for entry in session.execution_log if entry.node_id == node_id]
        if not node_visits:
            continue

        visit_count += 1

        if len(session_samples) < 10:
            first_visit = node_visits[0]
            session_samples.append(
                {
                    "sessionId": session.id,
                    "status": session.status,
                    "visitedAt": first_visit.timestamp_ms,
                    "action": first_visit.action or first_visit.detail,
                }
            )

        for entry in node_visits:
            if len(execution_log_samples) >= 10:
                break
            execution_log_samples.append(
                {
                    "nodeId": entry.node_id,
                    "nodeType": entry.node_type,
                    "timestamp": entry.timestamp_ms,
                    "durationMs": entry.duration_ms,
                    "deliveryMode": entry.delivery_mode,
                    "result": entry.result,
                    "detail": entry.detail,
                }
            )

        if node.node_type == "INTERACTIVE_MESSAGE":
            for button in _extract_buttons(node.config):
                stats = button_stats.setdefault(
                    button["id"],
                    {
                        "buttonId": button["id"],
                        "buttonText": button["text"],
                        "clickCount": 0,
                        "impressions": 0,
                    },
                )
                stats["impressions"] += 1

        last_entry = session.execution_log[-1]
        if session.status != "COMPLETED" and last_entry.node_id == node_id:
            drop_offs += 1
            total_time_before_leaving += max(
                0,
                _to_epoch_ms(_active_or_abandoned_end(session)) - last_entry.timestamp_ms,
            )

        if node.node_type == "INTERACTIVE_MESSAGE":
            click_button_id: str | None = None
            for visit in node_visits:
                if visit.button_clicked:
                    click_button_id = visit.button_clicked
                    break
                if visit.detail and visit.detail.startswith("button:"):
                    click_button_id = visit.detail.replace("button:", "", 1).strip()
                    break

            if click_button_id is None:
                first_visit_index = next(
                    (index for index, entry in enumerate(session.execution_log) if entry.node_id == node_id),
                    -1,
                )
                if 0 <= first_visit_index < len(session.execution_log) - 1:
                    next_entry = session.execution_log[first_visit_index + 1]
                    if next_entry.detail and next_entry.detail.startswith("button:"):
                        click_button_id = next_entry.detail.replace("button:", "", 1).strip()

            if click_button_id and click_button_id in button_stats:
                button_stats[click_button_id]["clickCount"] += 1

    baseline_visits = start_node_visits or len(sessions)
    visit_percentage = (visit_count / baseline_visits) * 100 if baseline_visits else 0
    drop_off_rate = (drop_offs / visit_count) * 100 if visit_count else 0
    avg_time_before_leaving = total_time_before_leaving / drop_offs if drop_offs else 0
    button_metrics = []
    for stats in button_stats.values():
        impressions = stats["impressions"]
        click_count = stats["clickCount"]
        button_metrics.append(
            {
                **stats,
                "clickThroughRate": round((click_count / impressions) * 100, 2) if impressions else 0,
            }
        )

    button_metrics.sort(key=lambda item: (-item["impressions"], item["buttonText"]))

    return {
        "nodeId": node.id,
        "nodeName": _get_node_name(node.node_type, node.id, node.config),
        "nodeType": _builder_node_type(node.node_type, node.config or {}),
        "visitCount": visit_count,
        "visitPercentage": round(visit_percentage, 2),
        "avgTimeBeforeLeaving": round(avg_time_before_leaving),
        "dropOffRate": round(drop_off_rate, 2),
        "healthStatus": _health_status(drop_off_rate),
        "isBottleneck": drop_off_rate > 50,
        "buttonMetrics": button_metrics or None,
        "sessionSamples": session_samples,
        "executionLogSamples": execution_log_samples,
    }


def _severity_sort_key(alert: dict[str, Any]) -> tuple[int, str]:
    created_at = str(alert.get("createdAt") or "")
    return (HEALTH_SEVERITY_ORDER.get(str(alert.get("severity")), 99), created_at)


def _create_cache_key(prefix: str, signature: dict[str, Any]) -> str:
    encoded = json.dumps(signature, sort_keys=True, separators=(",", ":"), default=str)
    return f"{prefix}:{encoded}"


async def _cache_get(key: str) -> Any | None:
    try:
        redis = Redis.from_url(str(settings.redis_url), decode_responses=True)
        try:
            raw = await redis.get(key)
        finally:
            await redis.aclose()
    except Exception as exc:
        logger.warning("flow_analytics_cache_read_failed", key=key, error=str(exc))
        return None

    if not raw:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def _cache_set(key: str, ttl_seconds: int, value: Any) -> None:
    try:
        redis = Redis.from_url(str(settings.redis_url), decode_responses=True)
        try:
            await redis.setex(
                key,
                ttl_seconds,
                json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str),
            )
        finally:
            await redis.aclose()
    except Exception as exc:
        logger.warning(
            "flow_analytics_cache_write_failed",
            key=key,
            error=str(exc),
        )


def _merge_date_params(
    start_date: str | None = None,
    date_start: str | None = None,
    end_date: str | None = None,
    date_end: str | None = None,
) -> tuple[datetime | None, datetime | None]:
    resolved_start = _parse_datetime_value(start_date or date_start)
    resolved_end = _parse_datetime_value(end_date or date_end)

    if (start_date or date_start) and resolved_start is None:
        raise FlowAnalyticsServiceError("Data inicial inválida.", status.HTTP_400_BAD_REQUEST)
    if (end_date or date_end) and resolved_end is None:
        raise FlowAnalyticsServiceError("Data final inválida.", status.HTTP_400_BAD_REQUEST)

    if resolved_start and resolved_end and resolved_start > resolved_end:
        raise FlowAnalyticsServiceError(
            "Data inicial deve ser anterior à data final.",
            status.HTTP_400_BAD_REQUEST,
        )

    if resolved_start and resolved_end and (resolved_end - resolved_start) > timedelta(days=MAX_DATE_RANGE_DAYS):
        raise FlowAnalyticsServiceError(
            "Período máximo permitido é de 1 ano.",
            status.HTTP_400_BAD_REQUEST,
        )

    now = _now_utc()
    if resolved_start and resolved_start > now:
        raise FlowAnalyticsServiceError("Datas não podem estar no futuro.", status.HTTP_400_BAD_REQUEST)
    if resolved_end and resolved_end > now:
        raise FlowAnalyticsServiceError("Datas não podem estar no futuro.", status.HTTP_400_BAD_REQUEST)

    return resolved_start, resolved_end


def build_filters(
    *,
    inbox_id: str | None = None,
    flow_id: str | None = None,
    start_date: str | None = None,
    date_start: str | None = None,
    end_date: str | None = None,
    date_end: str | None = None,
    status_values: str | None = None,
    campaign: str | None = None,
    channel_type: str | None = None,
    user_tag: str | None = None,
) -> AnalyticsFilters:
    resolved_start, resolved_end = _merge_date_params(
        start_date=start_date,
        date_start=date_start,
        end_date=end_date,
        date_end=date_end,
    )

    status_tuple: tuple[str, ...] = ()
    if status_values:
        parsed = tuple(part.strip() for part in status_values.split(",") if part.strip())
        valid_statuses = {"ACTIVE", "WAITING_INPUT", "COMPLETED", "ERROR"}
        invalid_statuses = [item for item in parsed if item not in valid_statuses]
        if invalid_statuses:
            raise FlowAnalyticsServiceError(
                f"Status inválidos: {', '.join(invalid_statuses)}",
                status.HTTP_400_BAD_REQUEST,
            )
        status_tuple = parsed

    return AnalyticsFilters(
        inbox_id=inbox_id,
        flow_id=flow_id,
        date_start=resolved_start,
        date_end=resolved_end,
        status=status_tuple,
        campaign=campaign,
        channel_type=channel_type,
        user_tag=user_tag,
    )


async def _resolve_inbox_for_user(
    session: AsyncSession,
    inbox_id: str,
    user_id: str,
) -> ChatwitInbox | None:
    query = (
        select(ChatwitInbox)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(ChatwitInbox.id == inbox_id, UsuarioChatwit.app_user_id == user_id)
    )
    result = await session.execute(query)
    return result.scalars().first()


async def _resolve_flow_for_user(
    session: AsyncSession,
    flow_id: str,
    user_id: str,
    *,
    include_graph: bool = False,
) -> Flow | None:
    query: Select[tuple[Flow]] = (
        select(Flow)
        .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(Flow.id == flow_id, UsuarioChatwit.app_user_id == user_id)
    )
    if include_graph:
        query = query.options(selectinload(Flow.nodes), selectinload(Flow.edges))
    result = await session.execute(query)
    return result.scalars().first()


async def _load_flow_sessions(
    session: AsyncSession,
    flow_id: str,
    filters: AnalyticsFilters,
) -> list[FlowSession]:
    stmt = select(FlowSession).where(FlowSession.flow_id == flow_id)

    if filters.inbox_id:
        stmt = stmt.where(FlowSession.inbox_id == filters.inbox_id)
    if filters.date_start:
        stmt = stmt.where(FlowSession.created_at >= filters.date_start)
    if filters.date_end:
        stmt = stmt.where(FlowSession.created_at <= filters.date_end)
    if filters.status:
        stmt = stmt.where(FlowSession.status.in_(filters.status))

    stmt = stmt.order_by(FlowSession.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _load_accessible_sessions(
    session: AsyncSession,
    user_id: str,
    filters: AnalyticsFilters,
) -> list[ParsedFlowSession]:
    stmt = (
        select(FlowSession, Flow.name)
        .join(Flow, FlowSession.flow_id == Flow.id)
        .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(UsuarioChatwit.app_user_id == user_id)
    )

    if filters.inbox_id:
        stmt = stmt.where(Flow.inbox_id == filters.inbox_id)
    if filters.flow_id:
        stmt = stmt.where(Flow.id == filters.flow_id)
    if filters.date_start:
        stmt = stmt.where(FlowSession.created_at >= filters.date_start)
    if filters.date_end:
        stmt = stmt.where(FlowSession.created_at <= filters.date_end)
    if filters.status:
        stmt = stmt.where(FlowSession.status.in_(filters.status))

    stmt = stmt.order_by(FlowSession.created_at.desc())
    result = await session.execute(stmt)
    rows = result.all()

    return [
        _normalize_flow_session(flow_session, flow_name)
        for flow_session, flow_name in rows
    ]


async def get_analytics_index() -> dict[str, Any]:
    base_url = "/api/admin/mtf-diamante/flow-analytics"
    return {
        "message": "Flow Analytics API",
        "version": "2.0.0",
        "endpoints": [
            {
                "path": f"{base_url}/kpis",
                "method": "GET",
                "description": "Métricas executivas",
                "params": ["inboxId?", "flowId?", "startDate?/dateStart?", "endDate?/dateEnd?"],
            },
            {
                "path": f"{base_url}/heatmap",
                "method": "GET",
                "description": "Heatmap por nó",
                "params": ["flowId", "inboxId?", "startDate?/dateStart?", "endDate?/dateEnd?"],
            },
            {
                "path": f"{base_url}/funnel",
                "method": "GET",
                "description": "Funil de conversão",
                "params": ["flowId", "inboxId?", "startDate?/dateStart?", "endDate?/dateEnd?"],
            },
            {
                "path": f"{base_url}/node-details",
                "method": "GET",
                "description": "Detalhes de um nó",
                "params": ["flowId", "nodeId", "inboxId?", "startDate?/dateStart?", "endDate?/dateEnd?"],
            },
            {
                "path": f"{base_url}/alerts",
                "method": "GET",
                "description": "Alertas de qualidade",
                "params": ["inboxId", "flowId?", "startDate?/dateStart?", "endDate?/dateEnd?"],
            },
            {
                "path": f"{base_url}/sessions/{{sessionId}}",
                "method": "GET",
                "description": "Replay de sessão",
                "params": ["sessionId"],
            },
        ],
    }


async def get_kpis(
    session: AsyncSession,
    user_id: str,
    filters: AnalyticsFilters,
) -> dict[str, Any]:
    cache_key = _create_cache_key(
        "flow-analytics:kpis",
        {
            "userId": user_id,
            "inboxId": filters.inbox_id,
            "flowId": filters.flow_id,
            "dateStart": _to_iso(filters.date_start),
            "dateEnd": _to_iso(filters.date_end),
            "status": list(filters.status),
            "campaign": filters.campaign,
            "channelType": filters.channel_type,
            "userTag": filters.user_tag,
        },
    )
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    sessions = await _load_accessible_sessions(session, user_id, filters)
    result = _compute_kpis(sessions)
    await _cache_set(cache_key, KPI_CACHE_TTL_SECONDS, result)
    return result


async def get_heatmap(
    session: AsyncSession,
    user_id: str,
    filters: AnalyticsFilters,
) -> dict[str, Any]:
    if not filters.flow_id:
        raise FlowAnalyticsServiceError("flowId é obrigatório.", status.HTTP_400_BAD_REQUEST)

    flow = await _resolve_flow_for_user(session, filters.flow_id, user_id, include_graph=True)
    if flow is None:
        raise FlowAnalyticsServiceError(
            "Flow não encontrado ou acesso negado.",
            status.HTTP_404_NOT_FOUND,
        )

    cache_key = _create_cache_key(
        "flow-analytics:heatmap",
        {
            "userId": user_id,
            "flowId": flow.id,
            "inboxId": filters.inbox_id,
            "dateStart": _to_iso(filters.date_start),
            "dateEnd": _to_iso(filters.date_end),
        },
    )
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    flow_sessions = await _load_flow_sessions(session, flow.id, filters)
    parsed_sessions = [_normalize_flow_session(item, flow.name) for item in flow_sessions]
    result = {
        "flow": _serialize_flow_for_heatmap(flow),
        "heatmap": _compute_heatmap(parsed_sessions, flow),
    }
    await _cache_set(cache_key, HEATMAP_CACHE_TTL_SECONDS, result)
    return result


async def get_funnel(
    session: AsyncSession,
    user_id: str,
    filters: AnalyticsFilters,
) -> list[dict[str, Any]]:
    if not filters.flow_id:
        raise FlowAnalyticsServiceError("flowId é obrigatório.", status.HTTP_400_BAD_REQUEST)

    flow = await _resolve_flow_for_user(session, filters.flow_id, user_id, include_graph=True)
    if flow is None:
        raise FlowAnalyticsServiceError(
            "Flow não encontrado ou acesso negado.",
            status.HTTP_404_NOT_FOUND,
        )

    cache_key = _create_cache_key(
        "flow-analytics:funnel",
        {
            "userId": user_id,
            "flowId": flow.id,
            "inboxId": filters.inbox_id,
            "dateStart": _to_iso(filters.date_start),
            "dateEnd": _to_iso(filters.date_end),
        },
    )
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    flow_sessions = await _load_flow_sessions(session, flow.id, filters)
    parsed_sessions = [_normalize_flow_session(item, flow.name) for item in flow_sessions]
    result = _compute_funnel(parsed_sessions, flow)
    await _cache_set(cache_key, FUNNEL_CACHE_TTL_SECONDS, result)
    return result


async def get_node_details(
    session: AsyncSession,
    user_id: str,
    filters: AnalyticsFilters,
    node_id: str,
) -> dict[str, Any]:
    if not filters.flow_id:
        raise FlowAnalyticsServiceError("flowId é obrigatório.", status.HTTP_400_BAD_REQUEST)
    if not node_id:
        raise FlowAnalyticsServiceError("nodeId é obrigatório.", status.HTTP_400_BAD_REQUEST)

    flow = await _resolve_flow_for_user(session, filters.flow_id, user_id, include_graph=True)
    if flow is None:
        raise FlowAnalyticsServiceError(
            "Flow não encontrado ou acesso negado.",
            status.HTTP_404_NOT_FOUND,
        )

    flow_sessions = await _load_flow_sessions(session, flow.id, filters)
    parsed_sessions = [_normalize_flow_session(item, flow.name) for item in flow_sessions]
    result = _compute_node_details(flow, node_id, parsed_sessions)
    if result is None:
        raise FlowAnalyticsServiceError("Nó não encontrado.", status.HTTP_404_NOT_FOUND)
    return result


async def get_alerts(
    session: AsyncSession,
    user_id: str,
    filters: AnalyticsFilters,
) -> list[dict[str, Any]]:
    if not filters.inbox_id:
        raise FlowAnalyticsServiceError("inboxId é obrigatório.", status.HTTP_400_BAD_REQUEST)

    inbox = await _resolve_inbox_for_user(session, filters.inbox_id, user_id)
    if inbox is None:
        raise FlowAnalyticsServiceError(
            "Acesso negado a esta caixa.",
            status.HTTP_403_FORBIDDEN,
        )

    if filters.flow_id:
        flow = await _resolve_flow_for_user(session, filters.flow_id, user_id, include_graph=True)
        if flow is None:
            raise FlowAnalyticsServiceError(
                "Flow não encontrado ou acesso negado.",
                status.HTTP_404_NOT_FOUND,
            )
        flows = [flow]
    else:
        result = await session.execute(
            select(Flow)
            .options(selectinload(Flow.nodes))
            .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
            .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
            .where(
                Flow.inbox_id == filters.inbox_id,
                UsuarioChatwit.app_user_id == user_id,
            )
        )
        flows = list(result.scalars().all())

    flow_map = {flow.id: flow for flow in flows}
    flow_sessions = await _load_accessible_sessions(session, user_id, filters)
    relevant_sessions = [
        flow_session for flow_session in flow_sessions if flow_session.inbox_id == filters.inbox_id
    ]

    alerts: list[dict[str, Any]] = []
    node_stats: dict[tuple[str, str], dict[str, Any]] = {}

    for parsed_session in relevant_sessions:
        visited_nodes: set[str] = set()
        flow = flow_map.get(parsed_session.flow_id)
        node_catalog = _node_catalog(flow) if flow else {}

        for entry in parsed_session.execution_log:
            if not entry.node_id or entry.node_id in visited_nodes:
                continue
            visited_nodes.add(entry.node_id)
            stats = node_stats.setdefault(
                (parsed_session.flow_id, entry.node_id),
                {
                    "visitCount": 0,
                    "dropOffCount": 0,
                    "flowName": parsed_session.flow_name,
                    "nodeName": node_catalog.get(entry.node_id, {}).get("name", entry.node_id),
                },
            )
            stats["visitCount"] += 1

        if parsed_session.status != "COMPLETED" and parsed_session.execution_log:
            last_entry = parsed_session.execution_log[-1]
            stats = node_stats.setdefault(
                (parsed_session.flow_id, last_entry.node_id),
                {
                    "visitCount": 0,
                    "dropOffCount": 0,
                    "flowName": parsed_session.flow_name,
                    "nodeName": node_catalog.get(last_entry.node_id, {}).get("name", last_entry.node_id),
                },
            )
            stats["dropOffCount"] += 1

    now = _now_utc()
    for (flow_id, node_id), stats in node_stats.items():
        visit_count = int(stats["visitCount"])
        drop_off_count = int(stats["dropOffCount"])
        if visit_count < 5:
            continue
        drop_off_rate = (drop_off_count / visit_count) * 100 if visit_count else 0
        if drop_off_rate <= 50:
            continue
        alerts.append(
            {
                "id": f"high-dropoff:{flow_id}:{node_id}",
                "type": "high_dropoff",
                "severity": "critical",
                "title": "Taxa de abandono crítica",
                "message": (
                    f"Nó com {drop_off_rate:.1f}% de abandono "
                    f"({drop_off_count}/{visit_count} sessões)"
                ),
                "flowId": flow_id,
                "flowName": stats["flowName"],
                "nodeId": node_id,
                "nodeName": stats["nodeName"],
                "metadata": {
                    "dropOffRate": round(drop_off_rate, 2),
                    "totalSessions": visit_count,
                    "dropOffCount": drop_off_count,
                },
                "createdAt": _to_iso(now),
            }
        )

    stuck_cutoff = now - timedelta(minutes=60)
    stuck_stmt = (
        select(FlowSession, Flow.name)
        .join(Flow, FlowSession.flow_id == Flow.id)
        .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(
            UsuarioChatwit.app_user_id == user_id,
            Flow.inbox_id == filters.inbox_id,
            FlowSession.status == "WAITING_INPUT",
            FlowSession.updated_at < stuck_cutoff,
        )
    )
    if filters.flow_id:
        stuck_stmt = stuck_stmt.where(Flow.id == filters.flow_id)

    stuck_rows = (await session.execute(stuck_stmt.limit(50))).all()
    for flow_session, flow_name in stuck_rows:
        inactive_minutes = max(
            0,
            int((_now_utc() - _ensure_utc(flow_session.updated_at)).total_seconds() // 60),
        )
        alerts.append(
            {
                "id": f"stuck-session:{flow_session.id}",
                "type": "stuck_session",
                "severity": "warning",
                "title": "Sessão travada",
                "message": f"Sessão aguardando entrada há {inactive_minutes} minutos",
                "flowId": flow_session.flow_id,
                "flowName": flow_name,
                "sessionId": flow_session.id,
                "metadata": {
                    "conversationId": flow_session.conversation_id,
                    "inactiveMinutes": inactive_minutes,
                    "lastUpdate": _to_iso(flow_session.updated_at),
                },
                "createdAt": _to_iso(now),
            }
        )

    recurring_cutoff = now - timedelta(hours=1)
    error_stmt = (
        select(FlowSession, Flow.name)
        .join(Flow, FlowSession.flow_id == Flow.id)
        .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(
            UsuarioChatwit.app_user_id == user_id,
            Flow.inbox_id == filters.inbox_id,
            FlowSession.status == "ERROR",
            FlowSession.created_at >= recurring_cutoff,
        )
    )
    if filters.flow_id:
        error_stmt = error_stmt.where(Flow.id == filters.flow_id)

    error_rows = (await session.execute(error_stmt)).all()
    errors_by_node: dict[tuple[str, str], dict[str, Any]] = {}
    for flow_session, flow_name in error_rows:
        parsed_session = _normalize_flow_session(flow_session, flow_name)
        last_entry = parsed_session.execution_log[-1] if parsed_session.execution_log else None
        node_id = flow_session.current_node_id or (last_entry.node_id if last_entry else None)
        if not node_id:
            continue
        flow = flow_map.get(flow_session.flow_id)
        node_name = (
            _node_catalog(flow).get(node_id, {}).get("name", node_id) if flow is not None else node_id
        )
        stats = errors_by_node.setdefault(
            (flow_session.flow_id, node_id),
            {
                "count": 0,
                "flowName": flow_name,
                "nodeName": node_name,
            },
        )
        stats["count"] += 1

    for (flow_id, node_id), stats in errors_by_node.items():
        if stats["count"] < 5:
            continue
        alerts.append(
            {
                "id": f"recurring-error:{flow_id}:{node_id}",
                "type": "recurring_error",
                "severity": "critical",
                "title": "Erro recorrente detectado",
                "message": f"{stats['count']} erros no mesmo nó na última hora",
                "flowId": flow_id,
                "flowName": stats["flowName"],
                "nodeId": node_id,
                "nodeName": stats["nodeName"],
                "metadata": {
                    "errorCount": stats["count"],
                    "timeWindow": "1 hour",
                },
                "createdAt": _to_iso(now),
            }
        )

    alerts.sort(key=_severity_sort_key)
    return alerts


async def get_session_detail(
    session: AsyncSession,
    user_id: str,
    session_id: str,
) -> dict[str, Any]:
    query = (
        select(FlowSession)
        .options(
            selectinload(FlowSession.flow).selectinload(Flow.nodes),
        )
        .join(Flow, FlowSession.flow_id == Flow.id)
        .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(
            FlowSession.id == session_id,
            UsuarioChatwit.app_user_id == user_id,
        )
    )
    result = await session.execute(query)
    flow_session = result.scalars().first()
    if flow_session is None or flow_session.flow is None:
        raise FlowAnalyticsServiceError(
            "Sessão não encontrada ou acesso negado.",
            status.HTTP_404_NOT_FOUND,
        )

    parsed_session = _normalize_flow_session(flow_session, flow_session.flow.name)
    node_lookup = _node_catalog(flow_session.flow)

    execution_log = []
    for entry in parsed_session.execution_log:
        node_name = node_lookup.get(entry.node_id, {}).get("name", entry.node_id)
        execution_log.append(
            {
                "timestamp": _to_iso(
                    datetime.fromtimestamp(entry.timestamp_ms / 1000, tz=UTC)
                ),
                "nodeId": entry.node_id,
                "nodeName": node_name,
                "nodeType": entry.node_type,
                "action": entry.action or entry.detail or "executed",
                "durationMs": entry.duration_ms,
                "deliveryMode": entry.delivery_mode,
                "status": "error" if entry.result == "error" else "skipped" if entry.result == "skipped" else "ok",
                **({"errorDetail": entry.detail} if entry.result == "error" and entry.detail else {}),
            }
        )

    inactivity_time = None
    if parsed_session.status in {"WAITING_INPUT", "ERROR"}:
        inactivity_time = max(
            0,
            _to_epoch_ms(_now_utc()) - _to_epoch_ms(parsed_session.updated_at),
        )

    last_node_visited = parsed_session.current_node_id or (
        parsed_session.execution_log[-1].node_id if parsed_session.execution_log else None
    )

    return {
        "id": parsed_session.id,
        "flowId": parsed_session.flow_id,
        "flowName": parsed_session.flow_name,
        "conversationId": parsed_session.conversation_id,
        "contactId": parsed_session.contact_id,
        "status": parsed_session.status,
        "createdAt": _to_iso(parsed_session.created_at),
        "completedAt": _to_iso(parsed_session.completed_at),
        "variables": parsed_session.variables,
        "executionLog": execution_log,
        "lastNodeVisited": last_node_visited,
        "inactivityTime": inactivity_time,
    }
