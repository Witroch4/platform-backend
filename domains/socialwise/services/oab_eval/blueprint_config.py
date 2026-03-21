"""Blueprint configuration loader for OAB eval agents.

Port of: getTranscriberConfig / getMirrorExtractorConfig / getAnalyzerConfig patterns.

3-tier blueprint discovery:
1. AiAgentBlueprint by linkedColumn (most recent by updatedAt)
2. AiAgentBlueprint by env var ID or name search
3. AiAssistant by env var ID or name search
4. Hardcoded defaults

The provider/model selection respects user's ``selected_provider`` preference.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.ai_agent_blueprint import AiAgentBlueprint
from domains.socialwise.db.models.ai_assistant import AiAssistant
from platform_core.ai.litellm_config import is_gemini_model, resolve_litellm_model
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# Gemini Agentic Vision instructions (injected when model is Gemini)
GEMINI_AGENTIC_VISION_INSTRUCTIONS = (
    "[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI 3 Agentic Vision]\n"
    "Você tem acesso à ferramenta code_execution que permite executar código Python "
    "para análise de imagem quando necessário. Use-a para:\n"
    "- Processar imagens com melhor resolução\n"
    "- Calcular totais e somas com precisão\n"
    "- Validar dados extraídos\n"
    "Combine análise visual direta com code_execution para máxima precisão.\n"
    "---"
)

# Default models
OPENAI_FALLBACK_MODEL = "gpt-4.1"
OPENAI_LAST_RESORT_MODEL = "gpt-4.1-mini"


@dataclass
class AgentConfig:
    """Resolved agent configuration."""

    model: str
    litellm_model: str  # "provider/model" for LiteLLM
    system_instructions: str
    max_output_tokens: int
    provider: str  # "OPENAI" | "GEMINI"
    reasoning_effort: str
    openai_fallback_model: str
    metadata: dict[str, Any] | None


def _get_provider_cache_entry(metadata: Any, provider: str) -> dict[str, Any] | None:
    """Extract per-provider config from blueprint metadata.providerCache."""
    if not metadata or not isinstance(metadata, dict):
        return None
    pc = metadata.get("providerCache")
    if not pc or not isinstance(pc, dict):
        return None
    entry = pc.get(provider)
    if not entry or not isinstance(entry, dict):
        return None
    return entry


def _resolve_openai_fallback(blueprint: AiAgentBlueprint | None) -> str:
    """Determine the OpenAI fallback model from blueprint cache or defaults."""
    if blueprint and blueprint.metadata_json:
        cached = _get_provider_cache_entry(blueprint.metadata_json, "OPENAI")
        if cached and cached.get("model") and not is_gemini_model(cached["model"]):
            return cached["model"]
    default_vision = os.environ.get("OAB_EVAL_VISION_MODEL", "gpt-4.1")
    if is_gemini_model(default_vision):
        return OPENAI_FALLBACK_MODEL
    return default_vision


async def load_blueprint_by_linked_column(
    session: AsyncSession,
    linked_column: str,
) -> AiAgentBlueprint | None:
    """Load the most recent blueprint linked to a specific column."""
    stmt = (
        select(AiAgentBlueprint)
        .where(AiAgentBlueprint.linked_column == linked_column)
        .order_by(AiAgentBlueprint.updated_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def load_blueprint_by_name(
    session: AsyncSession,
    env_var: str,
    search_terms: list[str],
) -> AiAgentBlueprint | None:
    """Load blueprint by env var ID or name search."""
    bp_id = os.environ.get(env_var)
    if bp_id:
        stmt = select(AiAgentBlueprint).where(AiAgentBlueprint.id == bp_id)
        result = await session.execute(stmt)
        bp = result.scalar_one_or_none()
        if bp:
            return bp

    # Fallback: search by name
    for term in search_terms:
        stmt = (
            select(AiAgentBlueprint)
            .where(AiAgentBlueprint.name.ilike(f"%{term}%"))
            .order_by(AiAgentBlueprint.updated_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        bp = result.scalar_one_or_none()
        if bp:
            return bp
    return None


async def load_assistant_fallback(
    session: AsyncSession,
    env_var: str,
    search_terms: list[str],
) -> AiAssistant | None:
    """Load AiAssistant as last-resort fallback."""
    assistant_id = os.environ.get(env_var)
    if assistant_id:
        stmt = (
            select(AiAssistant)
            .where(AiAssistant.id == assistant_id, AiAssistant.is_active.is_(True))
        )
        result = await session.execute(stmt)
        asst = result.scalar_one_or_none()
        if asst:
            return asst

    for term in search_terms:
        stmt = (
            select(AiAssistant)
            .where(AiAssistant.is_active.is_(True), AiAssistant.name.ilike(f"%{term}%"))
            .order_by(AiAssistant.updated_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        asst = result.scalar_one_or_none()
        if asst:
            return asst
    return None


def _build_config_from_blueprint(
    blueprint: AiAgentBlueprint,
    base_instructions: str,
    selected_provider: str | None,
    openai_fallback: str,
) -> AgentConfig:
    """Resolve config from a blueprint with provider preference."""
    metadata = blueprint.metadata_json or {}

    model = blueprint.model or os.environ.get("OAB_EVAL_VISION_MODEL", "gpt-4.1")
    max_tokens = blueprint.max_output_tokens or 0
    reasoning = blueprint.reasoning_effort or blueprint.thinking_level or "high"

    # Apply provider preference
    if selected_provider:
        cached = _get_provider_cache_entry(metadata, selected_provider)
        if cached and cached.get("model"):
            candidate = cached["model"]
            if selected_provider == "OPENAI" and not is_gemini_model(candidate):
                model = candidate
                max_tokens = int(cached.get("maxOutputTokens") or max_tokens)
                reasoning = cached.get("reasoningEffort") or reasoning
            elif selected_provider == "GEMINI" and is_gemini_model(candidate):
                model = candidate
                max_tokens = int(cached.get("maxOutputTokens") or max_tokens)
                reasoning = cached.get("thinkingLevel") or reasoning

        # Force-switch if mismatch
        bp_is_gemini = is_gemini_model(model)
        if selected_provider == "OPENAI" and bp_is_gemini:
            openai_cache = _get_provider_cache_entry(metadata, "OPENAI")
            model = (openai_cache or {}).get("model") or openai_fallback
            max_tokens = int((openai_cache or {}).get("maxOutputTokens") or max_tokens)
        elif selected_provider == "GEMINI" and not bp_is_gemini:
            gemini_cache = _get_provider_cache_entry(metadata, "GEMINI")
            model = (gemini_cache or {}).get("model", "gemini-3-flash-preview")
            if gemini_cache and is_gemini_model(model):
                max_tokens = int(gemini_cache.get("maxOutputTokens") or max_tokens)

    system_instructions = (blueprint.system_prompt or blueprint.instructions or base_instructions).strip()

    # Inject Gemini Agentic Vision instructions
    if is_gemini_model(model):
        system_instructions = f"{GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n{system_instructions}"

    # Normalize whitespace
    import re
    system_instructions = re.sub(r"\s+", " ", system_instructions).strip()

    effective_provider = "GEMINI" if is_gemini_model(model) else "OPENAI"

    return AgentConfig(
        model=model,
        litellm_model=resolve_litellm_model(effective_provider, model),
        system_instructions=system_instructions,
        max_output_tokens=max_tokens,
        provider=effective_provider,
        reasoning_effort=reasoning,
        openai_fallback_model=openai_fallback,
        metadata=metadata,
    )


async def get_agent_config(
    session: AsyncSession,
    *,
    linked_column: str,
    env_blueprint_id_var: str,
    env_assistant_id_var: str,
    search_terms: list[str],
    base_instructions: str,
    selected_provider: str | None = None,
) -> AgentConfig:
    """Full 4-tier config resolution for an OAB eval agent.

    1. Blueprint by linkedColumn
    2. Blueprint by env ID or name search
    3. AiAssistant by env ID or name search
    4. Hardcoded defaults
    """
    # Tier 1: linkedColumn
    try:
        bp = await load_blueprint_by_linked_column(session, linked_column)
        if bp:
            openai_fb = _resolve_openai_fallback(bp)
            logger.info("blueprint_loaded", source="linkedColumn", name=bp.name, model=bp.model)
            return _build_config_from_blueprint(bp, base_instructions, selected_provider, openai_fb)
    except Exception:
        logger.warning("blueprint_linked_column_failed", linked_column=linked_column)

    # Tier 2: env ID or name search
    try:
        bp = await load_blueprint_by_name(session, env_blueprint_id_var, search_terms)
        if bp:
            openai_fb = _resolve_openai_fallback(bp)
            logger.info("blueprint_loaded", source="name_search", name=bp.name, model=bp.model)
            return _build_config_from_blueprint(bp, base_instructions, selected_provider, openai_fb)
    except Exception:
        logger.warning("blueprint_name_search_failed")

    # Tier 3: AiAssistant fallback
    try:
        asst = await load_assistant_fallback(session, env_assistant_id_var, search_terms)
        if asst:
            model = asst.model or "gpt-4.1"
            system_instructions = (asst.instructions or base_instructions).strip()
            if is_gemini_model(model):
                system_instructions = f"{GEMINI_AGENTIC_VISION_INSTRUCTIONS}\n\n---\n\n{system_instructions}"
            import re
            system_instructions = re.sub(r"\s+", " ", system_instructions).strip()
            effective_provider = "GEMINI" if is_gemini_model(model) else "OPENAI"
            logger.info("assistant_loaded", name=asst.name, model=model)
            return AgentConfig(
                model=model,
                litellm_model=resolve_litellm_model(effective_provider, model),
                system_instructions=system_instructions,
                max_output_tokens=asst.max_output_tokens or 0,
                provider=effective_provider,
                reasoning_effort=asst.reasoning_effort or "high",
                openai_fallback_model=OPENAI_FALLBACK_MODEL,
                metadata=None,
            )
    except Exception:
        logger.warning("assistant_fallback_failed")

    # Tier 4: Hardcoded defaults
    default_model = os.environ.get("OAB_EVAL_VISION_MODEL", "gpt-4.1")
    effective_provider = "GEMINI" if is_gemini_model(default_model) else "OPENAI"
    logger.info("using_default_config", model=default_model)
    return AgentConfig(
        model=default_model,
        litellm_model=resolve_litellm_model(effective_provider, default_model),
        system_instructions=base_instructions,
        max_output_tokens=0,
        provider=effective_provider,
        reasoning_effort="high",
        openai_fallback_model=OPENAI_FALLBACK_MODEL,
        metadata=None,
    )
