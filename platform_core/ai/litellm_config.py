"""Shared LiteLLM configuration with CircuitBreaker, retry, and vision support.

Extracted from domains/jusmonitoria/ai/providers/litellm_config.py into shared
platform_core so both Socialwise and JusMonitorIA can use the same infra.

For OAB eval agents (Socialwise), vision calls go through ``call_vision()`` which
wraps ``acompletion`` with image_url content parts.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from typing import Any

import litellm
from litellm import acompletion
from litellm.exceptions import (
    APIConnectionError,
    APIError,
    RateLimitError,
    Timeout,
)

from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# ── LiteLLM global config ────────────────────────────────────────────────

litellm.drop_params = True
litellm.verbose = settings.debug

# ── Response dataclass ────────────────────────────────────────────────────

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


@dataclass
class LLMResponse:
    """Carries LLM text response together with usage metadata."""

    content: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    provider: str = "unknown"
    model: str = "unknown"


@dataclass
class VisionResponse:
    """Response from a vision (image + text) LLM call."""

    text: str
    provider: str = "unknown"
    model: str = "unknown"
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    duration_ms: int = 0
    was_fallback: bool = False


# ── Circuit Breaker ───────────────────────────────────────────────────────


class CircuitBreaker:
    """Circuit breaker pattern for provider failures."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures: dict[str, int] = {}
        self.last_failure_time: dict[str, float] = {}
        self.is_open: dict[str, bool] = {}

    def record_failure(self, provider_key: str) -> None:
        self.failures[provider_key] = self.failures.get(provider_key, 0) + 1
        self.last_failure_time[provider_key] = asyncio.get_event_loop().time()
        if self.failures[provider_key] >= self.failure_threshold:
            self.is_open[provider_key] = True

    def record_success(self, provider_key: str) -> None:
        self.failures[provider_key] = 0
        self.is_open[provider_key] = False

    def can_attempt(self, provider_key: str) -> bool:
        if not self.is_open.get(provider_key, False):
            return True
        last_failure = self.last_failure_time.get(provider_key, 0)
        current_time = asyncio.get_event_loop().time()
        if current_time - last_failure > self.recovery_timeout:
            self.failures[provider_key] = 0
            self.is_open[provider_key] = False
            return True
        return False


# ── Retry with jitter ─────────────────────────────────────────────────────


def _add_jitter(delay_ms: float) -> float:
    """Add ±30% jitter to prevent thundering herd."""
    factor = 0.7 + random.random() * 0.6  # noqa: S311
    return delay_ms * factor


def _is_timeout_error(error: Exception) -> bool:
    """Detect timeout/abort errors that should NOT be retried."""
    msg = str(error).lower()
    error_code = getattr(error, "code", "")
    return any(
        kw in msg for kw in ("timeout", "etimedout", "econnreset", "cancelled")
    ) or error_code in ("ETIMEDOUT",)


async def with_retry(
    fn,
    context: str,
    *,
    retries: int = 3,
    base_delay_ms: float = 2000,
    max_delay_ms: float = 10000,
):
    """Execute ``fn()`` with retry + exponential backoff + jitter.

    Timeouts/aborts skip retries and raise immediately for fast fallback.
    """
    last_error: Exception | None = None
    delays = [min(base_delay_ms * (2**i), max_delay_ms) for i in range(retries)]

    for attempt in range(1, retries + 2):
        try:
            return await fn()
        except Exception as error:
            last_error = error
            status = getattr(error, "status_code", None) or getattr(error, "status", None)

            if _is_timeout_error(error):
                logger.warning(
                    "retry_timeout_skip",
                    context=context,
                    attempt=attempt,
                    message=str(error)[:200],
                )
                raise

            is_retryable = status in RETRYABLE_STATUS_CODES
            if not is_retryable or attempt > retries:
                raise

            delay_ms = delays[attempt - 1] if attempt - 1 < len(delays) else delays[-1]
            delay_s = _add_jitter(delay_ms) / 1000
            logger.warning(
                "retry_attempt",
                context=context,
                attempt=attempt,
                retries=retries,
                status=status,
                delay_s=round(delay_s, 2),
            )
            await asyncio.sleep(delay_s)

    raise last_error  # type: ignore[misc]


# ── Prompt cleanup ────────────────────────────────────────────────────────

import re

_GEMINI_INSTRUCTIONS_PATTERN = re.compile(
    r"\[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI.*?---\s*", re.DOTALL
)


def clean_prompt_for_openai(system_instructions: str) -> str:
    """Remove Gemini-specific instructions from system prompt.

    CRITICAL: prevents confusing GPT with code_execution references.
    """
    cleaned = _GEMINI_INSTRUCTIONS_PATTERN.sub("", system_instructions)
    cleaned = re.sub(r"code_execution", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"execução de código Python", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"ferramenta 'code_ex[^']*'", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"Gemini 3 Agentic Vision", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"GEMINI_AGENTIC_VISION", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


# ── Model helpers ─────────────────────────────────────────────────────────


def is_gemini_model(model: str) -> bool:
    return model.lower().startswith("gemini")


def resolve_litellm_model(provider: str, model: str) -> str:
    """Build the LiteLLM model string ``provider/model``."""
    p = provider.lower()
    if p in ("openai",) and not model.startswith("openai/"):
        return f"openai/{model}"
    if p in ("gemini", "google") and not model.startswith("gemini/"):
        return f"gemini/{model}"
    if p in ("anthropic",) and not model.startswith("anthropic/"):
        return f"anthropic/{model}"
    return model


# ── Usage extraction ──────────────────────────────────────────────────────


def extract_usage(response) -> dict[str, int]:
    """Extract token usage from a LiteLLM response object."""
    usage = getattr(response, "usage", None)
    if not usage:
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    return {
        "input_tokens": getattr(usage, "prompt_tokens", 0) or 0,
        "output_tokens": getattr(usage, "completion_tokens", 0) or 0,
        "total_tokens": getattr(usage, "total_tokens", 0) or 0,
    }


# ── Core completion call ─────────────────────────────────────────────────

_circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60)


async def _call_completion(
    model: str,
    messages: list[dict[str, Any]],
    *,
    api_key: str | None = None,
    temperature: float = 0.0,
    max_tokens: int | None = None,
    timeout: int | None = None,
    response_format: dict | None = None,
    **kwargs: Any,
) -> Any:
    """Low-level LiteLLM acompletion with circuit breaker."""
    provider_key = model.split("/")[0] if "/" in model else model

    if not _circuit_breaker.can_attempt(provider_key):
        raise APIError(f"Circuit breaker open for {provider_key}", status_code=503, llm_provider=provider_key)

    try:
        extra: dict[str, Any] = {}
        if api_key:
            extra["api_key"] = api_key
        if max_tokens:
            extra["max_tokens"] = max_tokens
        if response_format:
            extra["response_format"] = response_format
        extra.update(kwargs)

        response = await acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            timeout=timeout or settings.litellm_timeout_seconds,
            **extra,
        )
        _circuit_breaker.record_success(provider_key)
        return response
    except (RateLimitError, Timeout, APIConnectionError, APIError):
        _circuit_breaker.record_failure(provider_key)
        raise


async def call_completion(
    model: str,
    messages: list[dict[str, Any]],
    *,
    api_key: str | None = None,
    temperature: float = 0.0,
    max_tokens: int | None = None,
    timeout: int | None = None,
    response_format: dict | None = None,
    retries: int = 3,
    base_delay_ms: float = 2000,
    max_delay_ms: float = 10000,
    **kwargs: Any,
) -> LLMResponse:
    """Call LLM completion with retry + circuit breaker."""
    raw = await with_retry(
        lambda: _call_completion(
            model,
            messages,
            api_key=api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            response_format=response_format,
            **kwargs,
        ),
        context=f"completion:{model}",
        retries=retries,
        base_delay_ms=base_delay_ms,
        max_delay_ms=max_delay_ms,
    )
    usage = extract_usage(raw)
    content = raw.choices[0].message.content or ""
    provider_name = model.split("/")[0] if "/" in model else "unknown"
    model_name = model.split("/", 1)[1] if "/" in model else model
    return LLMResponse(
        content=content,
        input_tokens=usage["input_tokens"],
        output_tokens=usage["output_tokens"],
        total_tokens=usage["total_tokens"],
        provider=provider_name,
        model=model_name,
    )


async def call_vision(
    model: str,
    system_prompt: str,
    user_prompt: str,
    image_base64: str,
    image_mime_type: str = "image/png",
    *,
    max_tokens: int | None = None,
    temperature: float = 0.0,
    timeout: int | None = None,
    retries: int = 3,
    base_delay_ms: float = 2000,
    max_delay_ms: float = 10000,
    **kwargs: Any,
) -> LLMResponse:
    """Call LLM with a single image (vision) via LiteLLM.

    Builds the standard ``image_url`` content part format that LiteLLM routes
    to the correct provider (OpenAI, Gemini, Claude).
    """
    image_url = f"data:{image_mime_type};base64,{image_base64}"
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": image_url, "detail": "high"},
                },
            ],
        },
    ]
    return await call_completion(
        model,
        messages,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
        retries=retries,
        base_delay_ms=base_delay_ms,
        max_delay_ms=max_delay_ms,
        **kwargs,
    )


async def call_vision_multi(
    model: str,
    system_prompt: str,
    user_prompt: str,
    images: list[dict[str, str]],
    *,
    max_tokens: int | None = None,
    temperature: float = 0.0,
    timeout: int | None = None,
    retries: int = 3,
    base_delay_ms: float = 2000,
    max_delay_ms: float = 10000,
    **kwargs: Any,
) -> LLMResponse:
    """Call LLM with multiple images.

    ``images`` is a list of ``{"base64": ..., "mime_type": ...}`` dicts.
    """
    content_parts: list[dict[str, Any]] = [{"type": "text", "text": user_prompt}]
    for img in images:
        mime = img.get("mime_type", "image/png")
        url = f"data:{mime};base64,{img['base64']}"
        content_parts.append(
            {"type": "image_url", "image_url": {"url": url, "detail": "high"}}
        )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content_parts},
    ]
    return await call_completion(
        model,
        messages,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
        retries=retries,
        base_delay_ms=base_delay_ms,
        max_delay_ms=max_delay_ms,
        **kwargs,
    )


async def call_structured(
    model: str,
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    *,
    max_tokens: int | None = None,
    temperature: float = 0.0,
    timeout: int | None = None,
    retries: int = 3,
    base_delay_ms: float = 2000,
    max_delay_ms: float = 10000,
    **kwargs: Any,
) -> LLMResponse:
    """Call LLM expecting structured JSON output (like Vercel AI generateObject).

    Uses ``response_format: {"type": "json_object"}`` via LiteLLM.
    """
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return await call_completion(
        model,
        messages,
        response_format={"type": "json_object"},
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
        retries=retries,
        base_delay_ms=base_delay_ms,
        max_delay_ms=max_delay_ms,
        **kwargs,
    )
