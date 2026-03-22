from __future__ import annotations

from domains.socialwise.services.flow.canvas_sync import build_node_config
from domains.socialwise.services.flow.export_import import (
    canvas_to_n8n_format,
    n8n_format_to_canvas,
    validate_flow_import,
)


def test_canvas_to_n8n_format_preserves_interactive_button_output_order():
    canvas = {
        "nodes": [
            {
                "id": "interactive_1",
                "type": "interactive_message",
                "position": {"x": 100, "y": 100},
                "data": {
                    "label": "Menu",
                    "elements": [
                        {"id": "flow_button_a", "type": "button", "title": "Primeiro"},
                        {"id": "flow_button_b", "type": "button", "title": "Segundo"},
                    ],
                },
            },
            {
                "id": "text_1",
                "type": "text_message",
                "position": {"x": 300, "y": 80},
                "data": {"text": "Opção A"},
            },
            {
                "id": "text_2",
                "type": "text_message",
                "position": {"x": 300, "y": 180},
                "data": {"text": "Opção B"},
            },
        ],
        "edges": [
            {
                "id": "edge_a",
                "source": "interactive_1",
                "target": "text_1",
                "sourceHandle": "flow_button_a",
            },
            {
                "id": "edge_b",
                "source": "interactive_1",
                "target": "text_2",
                "sourceHandle": "flow_button_b",
            },
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    exported = canvas_to_n8n_format(canvas, {"flowName": "Teste"})

    assert exported["connections"]["interactive_1"]["main"][0][0]["node"] == "text_1"
    assert exported["connections"]["interactive_1"]["main"][1][0]["node"] == "text_2"


def test_n8n_format_to_canvas_regenerates_button_ids_and_updates_edges():
    export_data = {
        "meta": {"version": "1.0", "flowName": "Teste"},
        "nodes": [
            {
                "id": "interactive_1",
                "type": "interactive_message",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "Menu",
                    "elements": [
                        {"id": "flow_button_old", "type": "button", "title": "Clique aqui"},
                    ],
                    "buttons": [
                        {"id": "flow_button_old", "title": "Clique aqui"},
                    ],
                    "message": {
                        "action": {
                            "buttons": [
                                {
                                    "id": "flow_button_old",
                                    "payload": "flow_button_old",
                                    "reply": {
                                        "id": "flow_button_old",
                                        "title": "Clique aqui",
                                    },
                                }
                            ]
                        }
                    },
                },
                "outputs": 1,
            },
            {
                "id": "text_1",
                "type": "text_message",
                "position": {"x": 200, "y": 0},
                "data": {"text": "Resposta"},
                "outputs": 1,
            },
        ],
        "connections": {
            "interactive_1": {
                "main": [[{"node": "text_1", "type": "main", "index": 0}]],
            }
        },
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    canvas = n8n_format_to_canvas(export_data)

    interactive_node = next(node for node in canvas["nodes"] if node["id"] == "interactive_1")
    new_button_id = interactive_node["data"]["elements"][0]["id"]
    edge = canvas["edges"][0]

    assert new_button_id != "flow_button_old"
    assert interactive_node["data"]["buttons"][0]["id"] == new_button_id
    assert interactive_node["data"]["message"]["action"]["buttons"][0]["id"] == new_button_id
    assert interactive_node["data"]["message"]["action"]["buttons"][0]["payload"] == new_button_id
    assert interactive_node["data"]["message"]["action"]["buttons"][0]["reply"]["id"] == new_button_id
    assert edge["sourceHandle"] == new_button_id
    assert edge["data"]["buttonId"] == new_button_id


def test_validate_flow_import_counts_connections_and_warns_without_start():
    export_data = {
        "meta": {"version": "1.0", "flowName": "Sem Start"},
        "nodes": [
            {
                "id": "text_1",
                "type": "text_message",
                "position": {"x": 0, "y": 0},
                "data": {"text": "Olá"},
            },
            {
                "id": "text_2",
                "type": "text_message",
                "position": {"x": 200, "y": 0},
                "data": {"text": "Tchau"},
            },
        ],
        "connections": {
            "text_1": {
                "main": [[{"node": "text_2", "type": "main", "index": 0}]],
            }
        },
    }

    validation = validate_flow_import(export_data)

    assert validation["valid"] is True
    assert validation["node_count"] == 2
    assert validation["connection_count"] == 1
    assert any("START" in warning for warning in validation["warnings"])


def test_build_node_config_normalizes_delay_and_text_reaction_nodes():
    delay_config = build_node_config(
        {
            "type": "delay",
            "data": {"delaySeconds": 9},
        }
    )
    reaction_config = build_node_config(
        {
            "type": "text_reaction",
            "data": {"textReaction": "Tudo certo"},
        }
    )

    assert delay_config == {"delayMs": 9000}
    assert reaction_config == {"text": "Tudo certo"}
