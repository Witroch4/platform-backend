"""Flow Builder import/export helpers used by the admin FastAPI routes."""

from __future__ import annotations

import copy
import secrets
import time
from typing import Any

FLOW_BUTTON_PREFIX = "flow_"


def _safe_id(prefix: str) -> str:
    final_prefix = f"{FLOW_BUTTON_PREFIX}{prefix}" if prefix in {"button", "payment"} else prefix
    return f"{final_prefix}_{int(time.time() * 1000)}_{secrets.token_hex(3)}"


def generate_element_id(element_type: str) -> str:
    """Generate Flow Builder compatible IDs for imported interactive elements."""

    return _safe_id(element_type)


def _get_interactive_buttons(node_data: dict[str, Any]) -> list[dict[str, Any]]:
    element_buttons = [
        element
        for element in node_data.get("elements") or []
        if isinstance(element, dict) and element.get("type") == "button"
    ]
    legacy_buttons = [button for button in node_data.get("buttons") or [] if isinstance(button, dict)]
    return element_buttons or legacy_buttons


def get_node_output_count(node: dict[str, Any]) -> int:
    node_type = str(node.get("type") or "")
    node_data = node.get("data") or {}

    if node_type == "interactive_message":
        return max(len(_get_interactive_buttons(node_data)), 1)

    if node_type == "condition":
        return 2

    if node_type == "end":
        return 0

    return 1


def _get_output_index_from_handle(source_handle: str | None, node: dict[str, Any]) -> int:
    if not source_handle:
        return 0

    if source_handle.startswith("btn_"):
        try:
            return int(source_handle.removeprefix("btn_"))
        except ValueError:
            return 0

    if source_handle == "true":
        return 0
    if source_handle == "false":
        return 1

    if str(node.get("type") or "") == "interactive_message":
        buttons = _get_interactive_buttons(node.get("data") or {})
        for index, button in enumerate(buttons):
            if button.get("id") == source_handle:
                return index

    return 0


def _get_handle_from_output_index(
    output_index: int,
    node_type: str,
    source_node: dict[str, Any] | None = None,
) -> str | None:
    if node_type == "interactive_message":
        if source_node:
            buttons = _get_interactive_buttons(source_node.get("data") or {})
            if output_index < len(buttons):
                button_id = buttons[output_index].get("id")
                if isinstance(button_id, str) and button_id:
                    return button_id
        return f"btn_{output_index}"

    if node_type == "condition":
        return "true" if output_index == 0 else "false"

    return None


def canvas_to_n8n_format(
    canvas: dict[str, Any],
    meta: dict[str, Any],
) -> dict[str, Any]:
    """Convert the React Flow canvas shape into the n8n-style export format."""

    edges_by_source: dict[str, list[dict[str, Any]]] = {}
    for edge in canvas.get("edges") or []:
        source = str(edge.get("source") or "")
        if not source:
            continue
        edges_by_source.setdefault(source, []).append(edge)

    connections: dict[str, dict[str, list[list[dict[str, Any]]]]] = {}
    for node in canvas.get("nodes") or []:
        node_id = str(node.get("id") or "")
        if not node_id:
            continue

        node_edges = edges_by_source.get(node_id, [])
        output_count = get_node_output_count(node)
        if output_count == 0 and not node_edges:
            continue

        outputs: list[list[dict[str, Any]]] = [[] for _ in range(max(output_count, 1))]
        for edge in node_edges:
            output_index = _get_output_index_from_handle(edge.get("sourceHandle"), node)
            while len(outputs) <= output_index:
                outputs.append([])
            outputs[output_index].append(
                {
                    "node": edge.get("target"),
                    "type": "main",
                    "index": 0,
                }
            )

        connections[node_id] = {"main": outputs}

    exported_nodes: list[dict[str, Any]] = []
    for node in canvas.get("nodes") or []:
        node_copy = copy.deepcopy(node)
        node_copy["outputs"] = get_node_output_count(node)
        exported_nodes.append(node_copy)

    return {
        "meta": {
            "version": "1.0",
            "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "flowId": meta.get("flowId"),
            "flowName": meta["flowName"],
            "inboxId": meta.get("inboxId"),
        },
        "nodes": exported_nodes,
        "connections": connections,
        "viewport": canvas.get("viewport") or {"x": 0, "y": 0, "zoom": 1},
    }


def n8n_format_to_canvas(export_data: dict[str, Any]) -> dict[str, Any]:
    """Convert the n8n-style export back into the Flow Builder canvas shape."""

    export_copy = copy.deepcopy(export_data)
    nodes = list(export_copy.get("nodes") or [])
    connections = export_copy.get("connections") or {}

    edges: list[dict[str, Any]] = []
    edge_index = 0

    nodes_by_id = {str(node.get("id") or ""): node for node in nodes}
    for source_id, source_connections in connections.items():
        source_node = nodes_by_id.get(source_id)
        if not source_node:
            continue

        outputs = source_connections.get("main") or []
        for output_index, targets in enumerate(outputs):
            for target in targets or []:
                source_handle = _get_handle_from_output_index(
                    output_index,
                    str(source_node.get("type") or ""),
                    source_node,
                )
                edge: dict[str, Any] = {
                    "id": f"edge_{source_id}_{target.get('node')}_{output_index}_{edge_index}",
                    "source": source_id,
                    "target": target.get("node"),
                    "sourceHandle": source_handle,
                    "type": "smoothstep",
                    "animated": False,
                }
                edge_index += 1

                if source_handle and source_node.get("type") == "interactive_message":
                    edge["data"] = {"buttonId": source_handle}

                edges.append(edge)

    sanitized_nodes: list[dict[str, Any]] = []
    button_id_map: dict[str, str] = {}

    for raw_node in nodes:
        node = {key: copy.deepcopy(value) for key, value in raw_node.items() if key != "outputs"}
        node_data = node.get("data") or {}

        if node.get("type") == "interactive_message" and isinstance(node_data, dict):
            elements = node_data.get("elements") or []
            for element in elements:
                if isinstance(element, dict) and element.get("type") == "button":
                    old_id = str(element.get("id") or "")
                    new_id = generate_element_id("button")
                    if old_id:
                        button_id_map[old_id] = new_id
                    element["id"] = new_id

            buttons = node_data.get("buttons") or []
            for button in buttons:
                if not isinstance(button, dict):
                    continue
                old_id = str(button.get("id") or "")
                mapped_id = button_id_map.get(old_id) if old_id else None
                if mapped_id is None:
                    mapped_id = generate_element_id("button")
                    if old_id:
                        button_id_map[old_id] = mapped_id
                button["id"] = mapped_id

            message = node_data.get("message")
            if isinstance(message, dict):
                action = message.get("action")
                if isinstance(action, dict):
                    for button in action.get("buttons") or []:
                        if not isinstance(button, dict):
                            continue
                        reply = button.get("reply")
                        reply_id = reply.get("id") if isinstance(reply, dict) else None
                        old_id = button.get("id") or reply_id
                        mapped_id = button_id_map.get(str(old_id or ""))
                        if mapped_id is None:
                            mapped_id = generate_element_id("button")
                        if button.get("id") is not None:
                            button["id"] = mapped_id
                        if button.get("payload") is not None:
                            button["payload"] = mapped_id
                        if isinstance(reply, dict) and reply.get("id") is not None:
                            reply["id"] = mapped_id

        sanitized_nodes.append(node)

    if button_id_map:
        for edge in edges:
            source_handle = edge.get("sourceHandle")
            if isinstance(source_handle, str) and source_handle in button_id_map:
                new_id = button_id_map[source_handle]
                edge["sourceHandle"] = new_id
                edge.setdefault("data", {})
                edge["data"]["buttonId"] = new_id

    return {
        "nodes": sanitized_nodes,
        "edges": edges,
        "viewport": export_copy.get("viewport") or {"x": 0, "y": 0, "zoom": 1},
    }


def validate_flow_import(data: Any) -> dict[str, Any]:
    """Validate the incoming n8n-style flow export before import."""

    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(data, dict):
        return {
            "valid": False,
            "errors": ["Dados inválidos: esperado objeto JSON"],
            "warnings": [],
            "node_count": 0,
            "connection_count": 0,
        }

    meta = data.get("meta") or {}
    nodes = data.get("nodes")
    connections = data.get("connections")

    if not meta.get("version"):
        errors.append("Campo meta.version ausente")
    if not meta.get("flowName"):
        warnings.append("Campo meta.flowName ausente (será usado nome padrão)")
    if not isinstance(nodes, list):
        errors.append("Campo nodes deve ser um array")
    if not isinstance(connections, dict):
        errors.append("Campo connections ausente ou inválido")

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "node_count": 0,
            "connection_count": 0,
        }

    valid_node_types = {
        "start",
        "interactive_message",
        "text_message",
        "emoji_reaction",
        "text_reaction",
        "handoff",
        "add_tag",
        "remove_tag",
        "end",
        "condition",
        "delay",
        "media",
        "wait_for_reply",
        "generate_payment_link",
        "whatsapp_template",
        "template",
        "button_template",
        "coupon_template",
        "call_template",
        "url_template",
        "chatwit_action",
        "quick_replies",
        "carousel",
    }

    node_ids: set[str] = set()
    for node in nodes:
        node_id = str(node.get("id") or "")
        node_type = str(node.get("type") or "")

        if not node_id:
            errors.append("Nó sem ID encontrado")
            continue
        if not node_type:
            errors.append(f"Nó {node_id} sem tipo definido")
            continue
        if node_type not in valid_node_types:
            warnings.append(f"Nó {node_id} tem tipo desconhecido: {node_type}")
        if node_id in node_ids:
            errors.append(f"ID de nó duplicado: {node_id}")
        node_ids.add(node_id)

        position = node.get("position") or {}
        if not isinstance(position.get("x"), (int, float)):
            warnings.append(f"Nó {node_id} sem posição válida")

    connection_count = 0
    for source_id, connection in connections.items():
        if source_id not in node_ids:
            warnings.append(f"Conexão de nó inexistente: {source_id}")
            continue
        outputs = connection.get("main")
        if not isinstance(outputs, list):
            warnings.append(f"Conexão inválida para nó {source_id}")
            continue
        for targets in outputs:
            if not isinstance(targets, list):
                continue
            for target in targets:
                connection_count += 1
                target_node = target.get("node")
                if not target_node:
                    warnings.append(f"Conexão sem nó destino em {source_id}")
                    continue
                if target_node not in node_ids:
                    warnings.append(f"Conexão para nó inexistente: {source_id} → {target_node}")

    if not any(str(node.get("type") or "") == "start" for node in nodes):
        warnings.append("Flow não tem nó de início (START)")

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "node_count": len(nodes),
        "connection_count": connection_count,
    }
