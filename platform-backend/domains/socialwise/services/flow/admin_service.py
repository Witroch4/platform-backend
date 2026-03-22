"""Business logic extracted from the Socialwise Flow Builder admin routes."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any

from fastapi import status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.models.flow import Flow
from domains.socialwise.db.models.flow_campaign import FlowCampaign
from domains.socialwise.db.models.flow_session import FlowSession, FlowSessionStatus
from domains.socialwise.db.models.inbox_flow_canvas import InboxFlowCanvas
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from domains.socialwise.services.flow.canvas_sync import sync_canvas_to_normalized_flow
from domains.socialwise.services.flow.export_import import (
    canvas_to_n8n_format,
    n8n_format_to_canvas,
    validate_flow_import,
)

NODE_TYPE_REVERSE_MAP: dict[str, str] = {
    "TRANSFER": "handoff",
}


@dataclass(slots=True)
class FlowAdminServiceError(Exception):
    message: str
    status_code: int = status.HTTP_400_BAD_REQUEST
    payload: dict[str, Any] | None = None


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
    query = (
        select(Flow)
        .join(ChatwitInbox, Flow.inbox_id == ChatwitInbox.id)
        .join(UsuarioChatwit, ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id)
        .where(Flow.id == flow_id, UsuarioChatwit.app_user_id == user_id)
    )
    if include_graph:
        query = query.options(selectinload(Flow.nodes), selectinload(Flow.edges))

    result = await session.execute(query)
    return result.scalars().first()


def _node_count_from_canvas(canvas: dict[str, Any] | None) -> int:
    if isinstance(canvas, dict):
        nodes = canvas.get("nodes")
        if isinstance(nodes, list):
            return len(nodes)
    return 0


def _serialize_flow_list_item(flow: Flow) -> dict[str, Any]:
    return {
        "id": flow.id,
        "name": flow.name,
        "inboxId": flow.inbox_id,
        "isActive": flow.is_active,
        "isCampaign": flow.is_campaign,
        "nodeCount": _node_count_from_canvas(flow.canvas_json),
        "createdAt": flow.created_at,
        "updatedAt": flow.updated_at,
    }


def _runtime_node_to_canvas(flow: Flow, node: Any) -> dict[str, Any]:
    config = dict(node.config or {})
    canvas_type = NODE_TYPE_REVERSE_MAP.get(node.node_type, node.node_type.lower())

    if node.node_type == "REACTION":
        if config.get("emoji"):
            canvas_type = "emoji_reaction"
        elif config.get("text") or config.get("textReaction"):
            canvas_type = "text_reaction"

    node_data: dict[str, Any] = {
        "label": config.get("label") or flow.name,
        "isConfigured": True,
    }
    node_data.update(config)

    if node.node_type == "DELAY" and config.get("delayMs"):
        node_data["delaySeconds"] = round(float(config["delayMs"]) / 1000)
        node_data.pop("delayMs", None)

    return {
        "id": f"{canvas_type}_{node.id[:8]}",
        "type": canvas_type,
        "position": {"x": node.position_x, "y": node.position_y},
        "data": node_data,
    }


def flow_to_canvas(flow: Flow) -> dict[str, Any]:
    """Rebuild the editable canvas from normalized FlowNode and FlowEdge rows."""

    node_id_map: dict[str, str] = {}
    canvas_nodes: list[dict[str, Any]] = []

    for node in flow.nodes:
        canvas_node = _runtime_node_to_canvas(flow, node)
        node_id_map[node.id] = canvas_node["id"]
        canvas_nodes.append(canvas_node)

    canvas_edges: list[dict[str, Any]] = []
    for edge in flow.edges:
        source_id = node_id_map.get(edge.source_node_id, edge.source_node_id)
        target_id = node_id_map.get(edge.target_node_id, edge.target_node_id)
        edge_data: dict[str, Any] = {}
        if edge.button_id:
            edge_data["buttonId"] = edge.button_id
        if edge.condition_branch:
            edge_data["conditionBranch"] = edge.condition_branch

        canvas_edge: dict[str, Any] = {
            "id": f"edge_{source_id}_{target_id}_{edge.button_id or 'default'}",
            "source": source_id,
            "target": target_id,
            "type": "smoothstep",
            "animated": False,
        }
        if edge.button_id:
            canvas_edge["sourceHandle"] = edge.button_id
        if edge_data:
            canvas_edge["data"] = edge_data
        canvas_edges.append(canvas_edge)

    return {
        "nodes": canvas_nodes,
        "edges": canvas_edges,
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


async def list_flows(
    session: AsyncSession,
    user_id: str,
    inbox_id: str,
    is_campaign: bool,
) -> list[dict[str, Any]]:
    inbox = await _resolve_inbox_for_user(session, inbox_id, user_id)
    if inbox is None:
        raise FlowAdminServiceError(
            message="Acesso negado a esta caixa",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    result = await session.execute(
        select(Flow)
        .where(Flow.inbox_id == inbox_id, Flow.is_campaign == is_campaign)
        .order_by(Flow.updated_at.desc())
    )
    flows = result.scalars().all()
    return [_serialize_flow_list_item(flow) for flow in flows]


async def create_flow(
    session: AsyncSession,
    user_id: str,
    inbox_id: str,
    name: str,
    is_campaign: bool,
) -> dict[str, Any]:
    inbox = await _resolve_inbox_for_user(session, inbox_id, user_id)
    if inbox is None:
        raise FlowAdminServiceError(
            message="Acesso negado a esta caixa",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    existing_result = await session.execute(
        select(Flow.id).where(
            Flow.inbox_id == inbox_id,
            func.lower(Flow.name) == name.strip().lower(),
        )
    )
    if existing_result.scalar_one_or_none():
        raise FlowAdminServiceError(
            message=f'Já existe um flow com o nome "{name}" nesta caixa.',
            status_code=status.HTTP_409_CONFLICT,
        )

    flow = Flow(
        name=name.strip(),
        inbox_id=inbox_id,
        is_active=True,
        is_campaign=is_campaign,
    )
    session.add(flow)
    await session.flush()
    await session.refresh(flow)
    return _serialize_flow_list_item(flow)


async def get_flow_detail(
    session: AsyncSession,
    user_id: str,
    flow_id: str,
) -> dict[str, Any]:
    flow = await _resolve_flow_for_user(session, flow_id, user_id, include_graph=True)
    if flow is None:
        raise FlowAdminServiceError(
            message="Flow não encontrado ou acesso negado",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    canvas = None
    if flow.canvas_json:
        canvas = flow.canvas_json
    elif flow.nodes:
        canvas = flow_to_canvas(flow)

    return {
        "id": flow.id,
        "name": flow.name,
        "inboxId": flow.inbox_id,
        "isActive": flow.is_active,
        "isCampaign": flow.is_campaign,
        "canvas": canvas,
        "createdAt": flow.created_at,
        "updatedAt": flow.updated_at,
    }


async def update_flow_metadata(
    session: AsyncSession,
    user_id: str,
    flow_id: str,
    name: str | None,
    is_active: bool | None,
) -> dict[str, Any]:
    flow = await _resolve_flow_for_user(session, flow_id, user_id)
    if flow is None:
        raise FlowAdminServiceError(
            message="Flow não encontrado ou acesso negado",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if name:
        normalized_name = name.strip()
        conflict_result = await session.execute(
            select(Flow.id).where(
                Flow.inbox_id == flow.inbox_id,
                Flow.id != flow.id,
                func.lower(Flow.name) == normalized_name.lower(),
            )
        )
        if conflict_result.scalar_one_or_none():
            raise FlowAdminServiceError(
                message=f'Já existe um flow com o nome "{normalized_name}" nesta caixa.',
                status_code=status.HTTP_409_CONFLICT,
            )
        flow.name = normalized_name

    if is_active is not None:
        flow.is_active = is_active

    await session.flush()
    await session.refresh(flow)
    return {
        "id": flow.id,
        "name": flow.name,
        "inboxId": flow.inbox_id,
        "isActive": flow.is_active,
        "createdAt": flow.created_at,
        "updatedAt": flow.updated_at,
    }


async def update_flow_canvas(
    session: AsyncSession,
    user_id: str,
    flow_id: str,
    canvas: dict[str, Any],
) -> dict[str, Any]:
    flow = await _resolve_flow_for_user(session, flow_id, user_id)
    if flow is None:
        raise FlowAdminServiceError(
            message="Flow não encontrado ou acesso negado",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    flow.canvas_json = canvas
    await sync_canvas_to_normalized_flow(session, flow, canvas)
    await session.flush()
    await session.refresh(flow)

    return {
        "id": flow.id,
        "name": flow.name,
        "inboxId": flow.inbox_id,
        "isActive": flow.is_active,
        "isCampaign": flow.is_campaign,
        "canvasJson": flow.canvas_json,
        "createdAt": flow.created_at,
        "updatedAt": flow.updated_at,
    }


async def delete_flow(
    session: AsyncSession,
    user_id: str,
    flow_id: str,
) -> None:
    flow = await _resolve_flow_for_user(session, flow_id, user_id)
    if flow is None:
        raise FlowAdminServiceError(
            message="Flow não encontrado ou acesso negado",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    active_sessions = (
        await session.execute(
            select(func.count())
            .select_from(FlowSession)
            .where(
                FlowSession.flow_id == flow.id,
                FlowSession.status.in_(
                    [FlowSessionStatus.ACTIVE, FlowSessionStatus.WAITING_INPUT]
                ),
            )
        )
    ).scalar_one()

    if active_sessions:
        raise FlowAdminServiceError(
            message=(
                f"Não é possível deletar o flow. Existem {active_sessions} sessão(ões) ativa(s)."
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
            payload={
                "hint": (
                    "Use o painel de Métricas > Flow Admin para forçar a deleção ou abortar sessões."
                ),
                "activeSessions": active_sessions,
            },
        )

    linked_campaigns = (
        await session.execute(
            select(func.count()).select_from(FlowCampaign).where(FlowCampaign.flow_id == flow.id)
        )
    ).scalar_one()
    if linked_campaigns:
        raise FlowAdminServiceError(
            message=(
                f"Não é possível deletar o flow. Existem {linked_campaigns} campanha(s) vinculada(s)."
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
            payload={
                "hint": "Remova ou reprograme as campanhas vinculadas antes de deletar o flow.",
                "linkedCampaigns": linked_campaigns,
            },
        )

    await session.execute(delete(FlowSession).where(FlowSession.flow_id == flow.id))
    await session.delete(flow)
    await session.flush()


async def import_flow(
    session: AsyncSession,
    user_id: str,
    inbox_id: str,
    flow_data: dict[str, Any],
    new_name: str | None,
) -> dict[str, Any]:
    inbox = await _resolve_inbox_for_user(session, inbox_id, user_id)
    if inbox is None:
        raise FlowAdminServiceError(
            message="Inbox não encontrada ou acesso negado",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    validation = validate_flow_import(flow_data)
    if not validation["valid"]:
        raise FlowAdminServiceError(
            message="Estrutura do flow inválida",
            status_code=status.HTTP_400_BAD_REQUEST,
            payload={
                "details": validation["errors"],
                "warnings": validation["warnings"],
            },
        )

    canvas = n8n_format_to_canvas(flow_data)
    requested_name = (
        (new_name or "").strip()
        or str(((flow_data.get("meta") or {}).get("flowName")) or "").strip()
        or f"Flow Importado {int(time.time() * 1000)}"
    )

    existing_result = await session.execute(
        select(Flow.id).where(
            Flow.inbox_id == inbox_id,
            func.lower(Flow.name) == requested_name.lower(),
        )
    )
    final_name = (
        f"{requested_name} (cópia {time.strftime('%H%M%S')})"
        if existing_result.scalar_one_or_none()
        else requested_name
    )

    flow = Flow(
        name=final_name,
        inbox_id=inbox_id,
        is_active=True,
        canvas_json=canvas,
    )
    session.add(flow)
    await session.flush()
    await sync_canvas_to_normalized_flow(session, flow, canvas, flow_name=final_name)
    await session.refresh(flow)

    return {
        "id": flow.id,
        "name": flow.name,
        "inboxId": flow.inbox_id,
        "isActive": flow.is_active,
        "nodeCount": validation["node_count"],
        "connectionCount": validation["connection_count"],
        "warnings": validation["warnings"],
        "message": f'Flow "{flow.name}" importado com sucesso',
    }


async def export_flow(
    session: AsyncSession,
    user_id: str,
    flow_id: str,
) -> tuple[str, str]:
    flow = await _resolve_flow_for_user(session, flow_id, user_id, include_graph=True)
    if flow is None:
        raise FlowAdminServiceError(
            message="Flow não encontrado ou acesso negado",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    canvas: dict[str, Any]
    if flow.canvas_json:
        canvas = flow.canvas_json
    else:
        inbox_canvas_result = await session.execute(
            select(InboxFlowCanvas).where(InboxFlowCanvas.inbox_id == flow.inbox_id)
        )
        inbox_canvas = inbox_canvas_result.scalars().first()
        if inbox_canvas and inbox_canvas.canvas:
            canvas = inbox_canvas.canvas
        elif flow.nodes:
            canvas = flow_to_canvas(flow)
        else:
            canvas = {"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}

    export_data = canvas_to_n8n_format(
        canvas,
        {
            "flowId": flow.id,
            "flowName": flow.name,
            "inboxId": flow.inbox_id,
        },
    )

    safe_name = re.sub(r"[^a-zA-Z0-9\-_]+", "-", flow.name)
    safe_name = re.sub(r"-+", "-", safe_name).strip("-")[:50] or "flow"
    filename = f"flow-{safe_name}-{int(time.time() * 1000)}.json"
    return json.dumps(export_data, indent=2, ensure_ascii=False), filename
