"""Shared AI infrastructure — LiteLLM config, provider management, agents, cost tracking."""

from platform_core.ai.base_agent import BaseAgent
from platform_core.ai.cost_tracker import track_cost, track_cost_batch
from platform_core.ai.litellm_config import (
    CircuitBreaker,
    EmbeddingResponse,
    LLMResponse,
    VisionResponse,
    call_completion,
    call_embedding,
    call_structured,
    call_vision,
    call_vision_multi,
    extract_usage,
    resolve_litellm_model,
)
from platform_core.ai.provider_manager import (
    ProviderEntry,
    ProviderManager,
    RateLimiter,
    provider_manager,
)

__all__ = [
    "BaseAgent",
    "CircuitBreaker",
    "EmbeddingResponse",
    "LLMResponse",
    "ProviderEntry",
    "ProviderManager",
    "RateLimiter",
    "VisionResponse",
    "call_completion",
    "call_embedding",
    "call_structured",
    "call_vision",
    "call_vision_multi",
    "extract_usage",
    "provider_manager",
    "resolve_litellm_model",
    "track_cost",
    "track_cost_batch",
]
