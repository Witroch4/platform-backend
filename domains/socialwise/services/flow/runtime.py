"""Runtime dataclasses for the Socialwise Flow Engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

FlowNodeType = Literal[
    "START",
    "END",
    "TEXT_MESSAGE",
    "INTERACTIVE_MESSAGE",
    "TEMPLATE",
    "WHATSAPP_TEMPLATE",
    "MEDIA",
    "DELAY",
    "CONDITION",
    "SET_VARIABLE",
    "HTTP_REQUEST",
    "ADD_TAG",
    "REMOVE_TAG",
    "TRANSFER",
    "REACTION",
    "QUICK_REPLIES",
    "CAROUSEL",
    "CHATWIT_ACTION",
    "WAIT_FOR_REPLY",
    "GENERATE_PAYMENT_LINK",
]

FlowSessionStatus = Literal["ACTIVE", "WAITING_INPUT", "COMPLETED", "ERROR"]


@dataclass(slots=True)
class ExecutionLogEntry:
    node_id: str
    node_type: str
    timestamp: int
    duration_ms: int
    delivery_mode: Literal["sync", "async"]
    result: Literal["ok", "error", "skipped"]
    detail: str | None = None


@dataclass(slots=True)
class FlowSessionData:
    id: str
    flow_id: str
    conversation_id: str
    contact_id: str
    inbox_id: str
    status: str
    current_node_id: str | None
    variables: dict[str, Any]
    execution_log: list[ExecutionLogEntry]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


@dataclass(slots=True)
class RuntimeFlowNode:
    id: str
    node_type: str
    config: dict[str, Any]


@dataclass(slots=True)
class RuntimeFlowEdge:
    id: str
    source_node_id: str
    target_node_id: str
    button_id: str | None = None
    condition_branch: str | None = None


@dataclass(slots=True)
class RuntimeFlow:
    id: str
    name: str
    inbox_id: str
    nodes: list[RuntimeFlowNode]
    edges: list[RuntimeFlowEdge]


@dataclass(slots=True)
class ExecuteResult:
    status: FlowSessionStatus
    current_node_id: str | None = None
    variables: dict[str, Any] = field(default_factory=dict)
    execution_log: list[ExecutionLogEntry] = field(default_factory=list)
