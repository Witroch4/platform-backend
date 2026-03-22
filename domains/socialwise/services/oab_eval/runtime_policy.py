"""Runtime policy — timeout/token budget resolution for OAB eval stages.

Port of: lib/oab-eval/runtime-policy.ts

Resolution chain: blueprint providerCache override → env config → bootstrap defaults.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from domains.socialwise.services.oab_eval.operation_control import LeadOperationStage

# ── Policy dataclass ──────────────────────────────────────────────────────


@dataclass
class OabRuntimePolicy:
    max_output_tokens: int
    timeout_ms: int
    retry_attempts: int
    retry_base_delay_ms: int
    retry_max_delay_ms: int

    @property
    def timeout_s(self) -> int:
        """Timeout in seconds (for LiteLLM)."""
        return max(1, self.timeout_ms // 1000)


# ── Bootstrap defaults ───────────────────────────────────────────────────

_BOOTSTRAP_DEFAULTS: dict[LeadOperationStage, OabRuntimePolicy] = {
    "transcription": OabRuntimePolicy(
        max_output_tokens=17_000,
        timeout_ms=120_000,
        retry_attempts=3,
        retry_base_delay_ms=2_000,
        retry_max_delay_ms=10_000,
    ),
    "mirror": OabRuntimePolicy(
        max_output_tokens=12_000,
        timeout_ms=180_000,
        retry_attempts=3,
        retry_base_delay_ms=2_000,
        retry_max_delay_ms=10_000,
    ),
    "analysis": OabRuntimePolicy(
        max_output_tokens=16_000,
        timeout_ms=240_000,
        retry_attempts=3,
        retry_base_delay_ms=2_000,
        retry_max_delay_ms=10_000,
    ),
}


# ── Provider cache extraction ─────────────────────────────────────────────


def get_blueprint_provider_overrides(
    metadata: Any,
    provider: str,
) -> dict[str, Any]:
    """Extract per-provider overrides from blueprint metadata.providerCache."""
    if not metadata or not isinstance(metadata, dict):
        return {}
    provider_cache = metadata.get("providerCache")
    if not provider_cache or not isinstance(provider_cache, dict):
        return {}
    entry = provider_cache.get(provider)
    if not entry or not isinstance(entry, dict):
        return {}
    return entry


# ── Resolution ────────────────────────────────────────────────────────────


def _resolve_number(
    override: int | float | None,
    fallback: int,
) -> int:
    """Pick override if valid positive number, else fallback."""
    if isinstance(override, (int, float)) and override > 0:
        return int(override)
    return fallback


def resolve_runtime_policy(
    *,
    stage: LeadOperationStage,
    provider: str,
    metadata: Any = None,
    explicit_max_output_tokens: int | None = None,
) -> OabRuntimePolicy:
    """Resolve runtime policy: override → bootstrap default."""
    defaults = _BOOTSTRAP_DEFAULTS[stage]
    overrides = get_blueprint_provider_overrides(metadata, provider)

    return OabRuntimePolicy(
        max_output_tokens=_resolve_number(
            overrides.get("maxOutputTokens") or explicit_max_output_tokens,
            defaults.max_output_tokens,
        ),
        timeout_ms=_resolve_number(
            overrides.get("timeoutMs"),
            defaults.timeout_ms,
        ),
        retry_attempts=max(
            1,
            _resolve_number(
                overrides.get("retryAttempts"),
                defaults.retry_attempts,
            ),
        ),
        retry_base_delay_ms=max(
            250,
            _resolve_number(
                overrides.get("retryBaseDelayMs"),
                defaults.retry_base_delay_ms,
            ),
        ),
        retry_max_delay_ms=max(
            500,
            _resolve_number(
                overrides.get("retryMaxDelayMs"),
                defaults.retry_max_delay_ms,
            ),
        ),
    )
