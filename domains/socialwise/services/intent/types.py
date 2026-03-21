"""Shared types for the SocialWise intent classification pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

BandType = Literal["HARD", "SOFT", "ROUTER"]
ChannelType = Literal["whatsapp", "instagram", "facebook"]
StrategyType = Literal[
    "direct_map",
    "direct_map_degraded",
    "warmup_buttons",
    "warmup_buttons_degraded",
    "router_llm",
    "router_llm_bypass",
    "button_flow",
    "button_handoff",
    "button_intent",
    "fallback_no_user",
    "fallback_no_config",
    "error_fallback",
]


@dataclass(slots=True)
class IntentCandidate:
    slug: str
    name: str
    desc: str = ""
    score: float | None = None
    threshold: float | None = None
    aliases: list[str] = field(default_factory=list)
    alias_matched: str | None = None


@dataclass(slots=True)
class ClassificationMetrics:
    route_total_ms: int
    embedding_ms: int | None = None
    llm_warmup_ms: int | None = None


@dataclass(slots=True)
class ClassificationResult:
    band: BandType
    score: float
    candidates: list[IntentCandidate]
    strategy: StrategyType
    metrics: ClassificationMetrics


@dataclass(slots=True)
class CacheKeyConfig:
    account_id: str
    inbox_id: str
    agent_id: str
    model: str
    prompt_version: str
    channel_type: ChannelType
    embedipreview: bool


@dataclass(slots=True)
class AssistantConfig:
    assistant_id: str
    model: str
    provider: str
    fallback_provider: str | None = None
    fallback_model: str | None = None
    instructions: str = ""
    developer: str = ""
    embedipreview: bool = True
    reasoning_effort: str | None = None
    verbosity: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    temp_schema: float = 0.1
    temp_copy: float = 0.4
    max_output_tokens: int = 648
    warmup_deadline_ms: int = 15000
    hard_deadline_ms: int = 15000
    soft_deadline_ms: int = 18000
    short_title_llm: bool = True
    tool_choice: str | None = "auto"
    propose_human_handoff: bool = True
    disable_intent_suggestion: bool = False
    inherit_from_agent: bool = True
    session_ttl_seconds: int = 86400
    session_ttl_dev_seconds: int = 300
    router_contingency_active: bool = False
    router_contingency_until: int | None = None


@dataclass(slots=True)
class RouterButton:
    title: str
    payload: str


@dataclass(slots=True)
class WarmupButtonsResult:
    response_text: str
    buttons: list[RouterButton]


@dataclass(slots=True)
class RouterDecision:
    mode: Literal["intent", "chat"]
    intent_payload: str
    response_text: str
    buttons: list[RouterButton]


@dataclass(slots=True)
class ButtonDetectionResult:
    is_button_click: bool
    button_id: str | None = None
    button_title: str | None = None
    detection_source: str = "none"


@dataclass(slots=True)
class ProcessorContext:
    user_text: str
    channel_type: str
    inbox_id: str
    chatwit_account_id: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    trace_id: str | None = None
    assistant_id: str | None = None
    original_payload: dict[str, Any] | None = None
    agent_supplement: str | None = None
    session_ttl_seconds: int | None = None
    session_ttl_dev_seconds: int | None = None


@dataclass(slots=True)
class SelectedIntent:
    slug: str
    payload: str
    source: Literal["classification", "router_button", "router_llm"]
    name: str | None = None
    score: float | None = None


@dataclass(slots=True)
class ProcessorResult:
    classification: ClassificationResult
    response: dict[str, Any] | None = None
    selected_intent: SelectedIntent | None = None
    action: Literal["resume_flow", "handoff"] | None = None
    flow_button_id: str | None = None
