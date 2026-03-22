"""Analysis agent — comparative analysis of exam transcript vs. correction mirror.

Port of: lib/oab-eval/analysis-agent.ts

Pipeline:
1. Load blueprint config (ANALISE_CELL)
2. Build prompt with textoProva + textoEspelho
3. Call generateObject (structured JSON output) via LiteLLM
4. DETERMINISTIC gabarito injection from espelho JSON (never from LLM)
5. Return structured analysis with points, scores, arguments
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Callable, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.ai.litellm_config import (
    call_structured,
    clean_prompt_for_openai,
    resolve_litellm_model,
    with_retry,
)
from platform_core.logging.config import get_logger
from domains.socialwise.services.oab_eval.blueprint_config import (
    OPENAI_FALLBACK_MODEL,
    get_agent_config,
)
from domains.socialwise.services.oab_eval.runtime_policy import resolve_runtime_policy

logger = get_logger(__name__)


# ── Gabarito map (deterministic) ─────────────────────────────────────────


def _normalize_item_id(raw: str) -> str:
    """Normalize item ID for matching.

    'Quesito PECA-07' → 'peca-07'
    'Questão 4 - Item B' → 'q4-b'
    """
    cleaned = re.sub(r"^(Quesito|Item|Questão|Peca)\s*", "", raw, flags=re.IGNORECASE)
    cleaned = cleaned.strip().lower().replace(" ", "-")
    # q4-item-b → q4-b
    cleaned = re.sub(r"-item-", "-", cleaned)
    return cleaned


def _build_gabarito_map(texto_espelho: str) -> dict[str, str]:
    """Parse espelho JSON to extract item descriptions for deterministic lookup.

    Returns map: normalized_id → description (gabarito text).
    """
    try:
        espelho = json.loads(texto_espelho) if isinstance(texto_espelho, str) else texto_espelho
    except (json.JSONDecodeError, TypeError):
        return {}

    gabarito: dict[str, str] = {}

    def _traverse(items: list[dict[str, Any]] | Any) -> None:
        if not isinstance(items, list):
            return
        for item in items:
            if not isinstance(item, dict):
                continue
            item_id = item.get("id", "")
            descricao = item.get("descricao", "")
            if item_id and descricao:
                normalized = _normalize_item_id(item_id)
                gabarito[normalized] = descricao
            # Recurse into subitems
            subitems = item.get("subitens") or item.get("itens") or item.get("items")
            if subitems:
                _traverse(subitems)

    # Try different structures
    itens = espelho.get("itens") or espelho.get("items") or []
    _traverse(itens)

    # Also try groups
    groups = espelho.get("grupos") or espelho.get("groups") or []
    for group in (groups if isinstance(groups, list) else []):
        if isinstance(group, dict):
            group_items = group.get("itens") or group.get("items") or []
            _traverse(group_items)

    return gabarito


def _inject_gabarito_banca(
    pontos: list[dict[str, Any]],
    gabarito_map: dict[str, str],
) -> list[dict[str, Any]]:
    """DETERMINISTIC post-processing: inject gabarito_banca from espelho.

    CRITICAL: This is NOT from the LLM. It's deterministic matching
    of each analysis point to the official correction rubric.
    """
    for ponto in pontos:
        titulo = ponto.get("titulo", "")
        normalized = _normalize_item_id(titulo)

        # Try exact match
        if normalized in gabarito_map:
            ponto["gabarito_banca"] = gabarito_map[normalized]
            continue

        # Try partial match (contains)
        for gab_id, gab_desc in gabarito_map.items():
            if gab_id in normalized or normalized in gab_id:
                ponto["gabarito_banca"] = gab_desc
                break

    return pontos


# ── Output normalization ─────────────────────────────────────────────────


def _normalize_analysis_output(parsed: dict[str, Any]) -> dict[str, Any]:
    """Safety net: ensure all expected fields exist with defaults."""
    return {
        "exameDescricao": parsed.get("exameDescricao", ""),
        "inscricao": parsed.get("inscricao", ""),
        "nomeExaminando": parsed.get("nomeExaminando", ""),
        "seccional": parsed.get("seccional", ""),
        "areaJuridica": parsed.get("areaJuridica", ""),
        "notaFinal": parsed.get("notaFinal", ""),
        "situacao": parsed.get("situacao", ""),
        "pontosPeca": parsed.get("pontosPeca", []) if isinstance(parsed.get("pontosPeca"), list) else [],
        "subtotalPeca": parsed.get("subtotalPeca", "0"),
        "pontosQuestoes": parsed.get("pontosQuestoes", []) if isinstance(parsed.get("pontosQuestoes"), list) else [],
        "subtotalQuestoes": parsed.get("subtotalQuestoes", "0"),
        "conclusao": parsed.get("conclusao", ""),
        "argumentacao": parsed.get("argumentacao", []) if isinstance(parsed.get("argumentacao"), list) else [],
        "erro": parsed.get("erro"),
    }


# ── Main entry point ─────────────────────────────────────────────────────

# Reinforcement layer (ABSOLUTE RULES)
_REINFORCEMENT = (
    "REGRAS ABSOLUTAS:\n"
    "1. Analise SOMENTE pontos corretos não-puntuados (que o aluno acertou mas NÃO recebeu nota).\n"
    "2. NÃO sugira melhorias, correções ou reformulações.\n"
    "3. NUNCA exceda o teto da rubrica para nenhum item.\n"
    "4. Verifique se não há dupla contagem de pontos.\n"
    "5. Analise AMBOS: Peça E todas as Questões.\n"
    "6. Limite máximo: peça 5.00 + questões 5.00 = 10.00 total."
)


async def run_analysis(
    session: AsyncSession,
    *,
    lead_id: str,
    texto_prova: str,
    texto_espelho: str,
    selected_provider: str | None = None,
    on_progress: Callable[[str, Any], Awaitable[None]] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """Run comparative analysis between transcript and mirror.

    Returns dict with: success, analysis, model, provider, processingTimeMs.
    """
    start_time = time.monotonic()

    base_instructions = (
        "Você é um assistente jurídico especialista em análise de provas da OAB. "
        "Sua tarefa é comparar o texto da prova manuscrita do aluno com o espelho de correção oficial "
        "e identificar SOMENTE os pontos corretos que NÃO foram pontuados pela banca examinadora. "
        f"\n\n{_REINFORCEMENT}\n\n"
        "Retorne um JSON estruturado com os campos: exameDescricao, inscricao, nomeExaminando, "
        "seccional, areaJuridica, notaFinal, situacao, pontosPeca (array de {titulo, descricao, valor}), "
        "subtotalPeca, pontosQuestoes (array de {titulo, descricao, valor}), subtotalQuestoes, "
        "conclusao, argumentacao (array de strings com referências a linhas)."
    )

    config = await get_agent_config(
        session,
        linked_column="ANALISE_CELL",
        env_blueprint_id_var="OAB_ANALYZER_BLUEPRINT_ID",
        env_assistant_id_var="OAB_ANALYZER_ASSISTANT_ID",
        search_terms=["Análise", "Analise", "Analysis"],
        base_instructions=base_instructions,
        selected_provider=selected_provider,
    )

    policy = resolve_runtime_policy(
        stage="analysis",
        provider=config.provider,
        metadata=config.metadata,
        explicit_max_output_tokens=config.max_output_tokens or None,
    )

    if cancel_check:
        cancel_check()

    if on_progress:
        await on_progress("analyzing", {"provider": config.provider, "model": config.model})

    # Build user prompt
    user_prompt = (
        f"TEXTO DA PROVA MANUSCRITA:\n{texto_prova}\n\n"
        f"ESPELHO DE CORREÇÃO (JSON):\n{texto_espelho}\n\n"
        "Analise e retorne o JSON com os pontos corretos não-puntuados."
    )

    effective_max_tokens = policy.max_output_tokens if policy.max_output_tokens > 0 else 16_000

    # Call LLM with structured output
    try:
        result = await with_retry(
            lambda: call_structured(
                config.litellm_model,
                config.system_instructions,
                user_prompt,
                json_schema={"type": "object"},
                max_tokens=effective_max_tokens,
                temperature=0.0,
                timeout=policy.timeout_s,
            ),
            context=f"Analysis:{config.provider}/{config.model}",
            retries=policy.retry_attempts,
            base_delay_ms=policy.retry_base_delay_ms,
            max_delay_ms=policy.retry_max_delay_ms,
        )
    except Exception as primary_err:
        if config.provider != "OPENAI":
            logger.warning("analysis_primary_failed", error=str(primary_err)[:300])
            fallback = resolve_litellm_model("OPENAI", OPENAI_FALLBACK_MODEL)
            cleaned = clean_prompt_for_openai(config.system_instructions)
            result = await call_structured(
                fallback, cleaned, user_prompt,
                json_schema={"type": "object"},
                max_tokens=effective_max_tokens, temperature=0.0, timeout=policy.timeout_s,
            )
        else:
            elapsed = int((time.monotonic() - start_time) * 1000)
            return {
                "leadId": lead_id,
                "success": False,
                "error": str(primary_err),
                "model": config.model,
                "provider": config.provider,
                "processingTimeMs": elapsed,
            }

    # Parse response
    raw_text = result.content.strip()
    json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
    json_str = json_match.group(1) if json_match else raw_text

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        logger.error("analysis_json_parse_failed", raw=raw_text[:500])
        elapsed = int((time.monotonic() - start_time) * 1000)
        return {
            "leadId": lead_id,
            "success": False,
            "error": "Falha ao parsear resposta do LLM como JSON",
            "model": config.model,
            "provider": config.provider,
            "processingTimeMs": elapsed,
        }

    # Normalize output
    analysis = _normalize_analysis_output(parsed)

    # DETERMINISTIC gabarito injection
    gabarito_map = _build_gabarito_map(texto_espelho)
    if gabarito_map:
        analysis["pontosPeca"] = _inject_gabarito_banca(analysis["pontosPeca"], gabarito_map)
        analysis["pontosQuestoes"] = _inject_gabarito_banca(analysis["pontosQuestoes"], gabarito_map)

    elapsed = int((time.monotonic() - start_time) * 1000)

    logger.info(
        "analysis_complete",
        lead_id=lead_id,
        provider=result.provider,
        model=result.model,
        tokens_in=result.input_tokens,
        tokens_out=result.output_tokens,
        duration_ms=elapsed,
        pontos_peca=len(analysis["pontosPeca"]),
        pontos_questoes=len(analysis["pontosQuestoes"]),
    )

    return {
        "leadId": lead_id,
        "success": True,
        "analysis": analysis,
        "model": result.model,
        "provider": result.provider,
        "processingTimeMs": elapsed,
        "tokenUsage": {
            "input": result.input_tokens,
            "output": result.output_tokens,
            "total": result.input_tokens + result.output_tokens,
        },
    }
