"""Canvas materialization helpers for Flow Builder admin routes."""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.base import generate_cuid
from domains.socialwise.db.models.flow import Flow, FlowEdge, FlowNode

NODE_TYPE_MAP: dict[str, str] = {
    "start": "START",
    "interactive_message": "INTERACTIVE_MESSAGE",
    "text_message": "TEXT_MESSAGE",
    "emoji_reaction": "REACTION",
    "text_reaction": "REACTION",
    "handoff": "TRANSFER",
    "add_tag": "ADD_TAG",
    "remove_tag": "REMOVE_TAG",
    "end": "END",
    "condition": "CONDITION",
    "delay": "DELAY",
    "media": "MEDIA",
    "wait_for_reply": "WAIT_FOR_REPLY",
    "generate_payment_link": "GENERATE_PAYMENT_LINK",
    "whatsapp_template": "WHATSAPP_TEMPLATE",
    "template": "WHATSAPP_TEMPLATE",
    "button_template": "WHATSAPP_TEMPLATE",
    "coupon_template": "WHATSAPP_TEMPLATE",
    "call_template": "WHATSAPP_TEMPLATE",
    "url_template": "WHATSAPP_TEMPLATE",
    "chatwit_action": "CHATWIT_ACTION",
    "quick_replies": "QUICK_REPLIES",
    "carousel": "CAROUSEL",
}


def build_node_config(node: dict[str, Any]) -> dict[str, Any]:
    """Extract the runtime config persisted in FlowNode.config."""

    node_type = str(node.get("type") or "")
    data = copy.deepcopy(node.get("data") or {})

    if node_type == "interactive_message":
        return {
            "messageId": data.get("messageId"),
            "elements": data.get("elements"),
            "body": data.get("body"),
            "header": data.get("header"),
            "footer": data.get("footer"),
            "buttons": data.get("buttons"),
            "label": data.get("label"),
        }
    if node_type == "text_message":
        return {"text": data.get("text")}
    if node_type == "emoji_reaction":
        return {"emoji": data.get("emoji")}
    if node_type == "text_reaction":
        return {"text": data.get("textReaction")}
    if node_type == "handoff":
        return {"assigneeType": "team", "internalNote": data.get("targetTeam")}
    if node_type == "add_tag":
        return {"tagName": data.get("tagName")}
    if node_type == "delay":
        seconds = data.get("delaySeconds") or 5
        return {"delayMs": int(seconds) * 1000}
    if node_type == "media":
        return {
            "mediaUrl": data.get("mediaUrl"),
            "filename": data.get("filename"),
            "caption": data.get("caption"),
            "mediaType": data.get("mediaType"),
            "mimeType": data.get("mimeType"),
        }
    if node_type == "wait_for_reply":
        return {
            "promptText": data.get("promptText"),
            "variableName": data.get("variableName"),
            "validationRegex": data.get("validationRegex"),
            "validationErrorMessage": data.get("validationErrorMessage"),
            "maxAttempts": data.get("maxAttempts"),
            "skipButtonLabel": data.get("skipButtonLabel"),
        }
    if node_type == "generate_payment_link":
        return {
            "provider": data.get("provider"),
            "handle": data.get("handle"),
            "amountCents": data.get("amountCents"),
            "description": data.get("description"),
            "customerEmailVar": data.get("customerEmailVar"),
            "outputVariable": data.get("outputVariable"),
            "linkIdVariable": data.get("linkIdVariable"),
        }
    if node_type == "end":
        return {"endMessage": data.get("endMessage")}
    if node_type == "start":
        return {"label": data.get("label"), "triggerType": data.get("triggerType")}
    return data


async def _create_flow_edge(
    session: AsyncSession,
    flow_id: str,
    source_node_id: str,
    target_node_id: str,
    button_id: str | None,
    condition_branch: str | None,
) -> None:
    session.add(
        FlowEdge(
            id=generate_cuid(),
            flow_id=flow_id,
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            button_id=button_id,
            condition_branch=condition_branch,
        )
    )
    await session.flush()


async def sync_canvas_to_normalized_flow(
    session: AsyncSession,
    flow: Flow,
    canvas: dict[str, Any],
    flow_name: str | None = None,
) -> str:
    """Materialize the React Flow canvas into FlowNode and FlowEdge rows."""

    start_node = next(
        (node for node in canvas.get("nodes") or [] if str(node.get("type") or "") == "start"),
        None,
    )
    extracted_name = flow_name or ((start_node or {}).get("data") or {}).get("label")
    if extracted_name and flow.name != extracted_name:
        flow.name = str(extracted_name)

    existing_nodes_result = await session.execute(select(FlowNode).where(FlowNode.flow_id == flow.id))
    existing_nodes = list(existing_nodes_result.scalars().all())

    existing_by_canvas_id: dict[str, FlowNode] = {}
    for existing_node in existing_nodes:
        canvas_id = (existing_node.config or {}).get("_canvasId")
        if isinstance(canvas_id, str) and canvas_id:
            existing_by_canvas_id[canvas_id] = existing_node

    await session.execute(delete(FlowEdge).where(FlowEdge.flow_id == flow.id))

    node_id_map: dict[str, str] = {}
    matched_existing_ids: set[str] = set()

    for node in canvas.get("nodes") or []:
        canvas_id = str(node.get("id") or "")
        if not canvas_id:
            continue

        config = build_node_config(node)
        config["_canvasId"] = canvas_id
        node_type = NODE_TYPE_MAP.get(str(node.get("type") or ""), str(node.get("type") or "").upper())
        position = node.get("position") or {}
        existing_node = existing_by_canvas_id.get(canvas_id)

        if existing_node:
            matched_existing_ids.add(existing_node.id)
            existing_node.node_type = node_type
            existing_node.config = config
            existing_node.position_x = float(position.get("x") or 0)
            existing_node.position_y = float(position.get("y") or 0)
            node_id_map[canvas_id] = existing_node.id
        else:
            db_node = FlowNode(
                id=generate_cuid(),
                flow_id=flow.id,
                node_type=node_type,
                config=config,
                position_x=float(position.get("x") or 0),
                position_y=float(position.get("y") or 0),
            )
            session.add(db_node)
            await session.flush()
            node_id_map[canvas_id] = db_node.id

    nodes_to_delete = [node.id for node in existing_nodes if node.id not in matched_existing_ids]
    if nodes_to_delete:
        await session.execute(delete(FlowNode).where(FlowNode.id.in_(nodes_to_delete)))

    edge_dedup: set[str] = set()
    canvas_nodes_map = {str(node.get("id") or ""): node for node in canvas.get("nodes") or []}
    covered_buttons_by_source: dict[str, set[str]] = {}

    for edge in canvas.get("edges") or []:
        source_handle = edge.get("sourceHandle")
        source_id = str(edge.get("source") or "")
        if isinstance(source_handle, str) and source_handle:
            covered_buttons_by_source.setdefault(source_id, set()).add(source_handle)

    for edge in canvas.get("edges") or []:
        source_id = node_id_map.get(str(edge.get("source") or ""))
        target_id = node_id_map.get(str(edge.get("target") or ""))
        if not source_id or not target_id:
            continue

        edge_data = edge.get("data") or {}
        condition_branch = edge_data.get("conditionBranch")
        if condition_branch is not None:
            condition_branch = str(condition_branch)

        source_handle = edge.get("sourceHandle")
        if not source_handle:
            source_node = canvas_nodes_map.get(str(edge.get("source") or ""))
            if isinstance(source_node, dict) and source_node.get("type") == "interactive_message":
                source_data = source_node.get("data") or {}
                element_buttons = [
                    element.get("id")
                    for element in source_data.get("elements") or []
                    if isinstance(element, dict) and element.get("type") == "button"
                ]
                legacy_buttons = [
                    button.get("id")
                    for button in source_data.get("buttons") or []
                    if isinstance(button, dict)
                ]
                all_button_ids = [button_id for button_id in (element_buttons or legacy_buttons) if button_id]
                covered_buttons = covered_buttons_by_source.get(str(edge.get("source") or ""), set())
                uncovered_button_ids = [
                    str(button_id) for button_id in all_button_ids if str(button_id) not in covered_buttons
                ]

                if uncovered_button_ids:
                    for button_id in uncovered_button_ids:
                        dedup_key = f"{source_id}|{target_id}|{button_id}"
                        if dedup_key in edge_dedup:
                            continue
                        edge_dedup.add(dedup_key)
                        await _create_flow_edge(
                            session,
                            flow.id,
                            source_id,
                            target_id,
                            button_id,
                            condition_branch,
                        )

                    default_dedup_key = f"{source_id}|{target_id}|"
                    if default_dedup_key not in edge_dedup:
                        edge_dedup.add(default_dedup_key)
                        await _create_flow_edge(
                            session,
                            flow.id,
                            source_id,
                            target_id,
                            None,
                            condition_branch,
                        )
                    continue

        dedup_key = f"{source_id}|{target_id}|{source_handle or ''}"
        if dedup_key in edge_dedup:
            continue
        edge_dedup.add(dedup_key)
        await _create_flow_edge(
            session,
            flow.id,
            source_id,
            target_id,
            str(source_handle) if source_handle else None,
            condition_branch,
        )

    await session.flush()
    return flow.id
