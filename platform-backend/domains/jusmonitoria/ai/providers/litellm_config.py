"""LiteLLM configuration — thin re-export from platform_core.

Original implementation moved to:
- platform_core/ai/litellm_config.py (CircuitBreaker, LLMResponse, call_*)
- platform_core/ai/provider_manager.py (ProviderManager, RateLimiter, chains)

This file kept for backward compatibility with ~20 consumers in
domains/jusmonitoria/ that import from here.
"""

# Re-export core types and functions
from platform_core.ai.litellm_config import (
    CircuitBreaker,
    LLMResponse,
    call_completion,
    call_embedding,
    call_structured,
    call_vision,
    call_vision_multi,
    extract_usage,
    resolve_litellm_model,
)
from platform_core.ai.provider_manager import (
    ProviderManager,
    RateLimiter,
    provider_manager,
)

# Backward-compatible aliases
LiteLLMConfig = ProviderManager
litellm_config = provider_manager

__all__ = [
    "CircuitBreaker",
    "LLMResponse",
    "LiteLLMConfig",
    "ProviderManager",
    "RateLimiter",
    "call_completion",
    "call_embedding",
    "call_structured",
    "call_vision",
    "call_vision_multi",
    "extract_usage",
    "litellm_config",
    "provider_manager",
    "resolve_litellm_model",
]
