"""Mirror generator agent — extract correction scores from exam mirror images.

Port of: lib/oab-eval/mirror-generator-agent.ts

Pipeline:
1. Load rubric from database (by ID or specialty)
2. Extract scores via Vision AI from mirror image(s)
3. Reconcile extracted totals vs. computed sums (tolerance 0.05)
4. Rebalance item scores to match extracted section total
5. Return structured JSON + markdown representations
"""

from __future__ import annotations

import json
import math
import re
import time
from typing import Any, Callable, Awaitable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.ai.litellm_config import (
    call_vision,
    call_vision_multi,
    clean_prompt_for_openai,
    is_gemini_model,
    resolve_litellm_model,
    with_retry,
)
from platform_core.logging.config import get_logger
from domains.socialwise.db.models.espelho_padrao import EspelhoPadrao
from domains.socialwise.services.oab_eval.blueprint_config import (
    OPENAI_FALLBACK_MODEL,
    OPENAI_LAST_RESORT_MODEL,
    get_agent_config,
)
from domains.socialwise.services.oab_eval.rubric_scoring import (
    build_score_map,
    sanitize_raw_score,
    verify_rubric_totals,
)
from domains.socialwise.services.oab_eval.runtime_policy import resolve_runtime_policy

logger = get_logger(__name__)

SCORE_TOLERANCE = 0.05


# ── Rubric loading ───────────────────────────────────────────────────────


async def _load_rubric(
    session: AsyncSession,
    especialidade: str,
    espelho_padrao_id: str | None = None,
) -> dict[str, Any] | None:
    """Load rubric from EspelhoPadrao (by ID or specialty name)."""
    if espelho_padrao_id:
        stmt = select(EspelhoPadrao).where(EspelhoPadrao.id == espelho_padrao_id)
        result = await session.execute(stmt)
        ep = result.scalar_one_or_none()
        if ep and ep.espelho_correcao:
            try:
                return json.loads(ep.espelho_correcao)
            except (json.JSONDecodeError, TypeError):
                logger.warning("rubric_parse_failed", id=espelho_padrao_id)

    # Fallback: search by specialty
    stmt = (
        select(EspelhoPadrao)
        .where(EspelhoPadrao.especialidade.ilike(f"%{especialidade}%"))
        .limit(1)
    )
    result = await session.execute(stmt)
    ep = result.scalar_one_or_none()
    if ep and ep.espelho_correcao:
        try:
            return json.loads(ep.espelho_correcao)
        except (json.JSONDecodeError, TypeError):
            pass
    return None


# ── Score reconciliation ─────────────────────────────────────────────────


def _select_consistent_total(extracted: float | None, computed: float, scope: str) -> float:
    """Reconcile extracted vs. computed total."""
    if extracted is None or not math.isfinite(extracted):
        return computed
    diff = abs(extracted - computed)
    if diff <= SCORE_TOLERANCE:
        return computed
    # Prefer computed if large disagreement
    if diff > 1.0:
        logger.warning(
            "score_disagreement",
            scope=scope,
            extracted=extracted,
            computed=computed,
            diff=round(diff, 2),
        )
        return computed
    return extracted


def _rebalance_overrides(
    items: list[dict[str, Any]],
    score_map: dict[str, float],
    extracted_total: float | None,
) -> dict[str, float]:
    """Adjust item scores so their sum matches the extracted total.

    Reduces highest scores first to prevent exceeding extracted total.
    """
    if extracted_total is None or not math.isfinite(extracted_total):
        return score_map

    current_sum = sum(score_map.get(item["id"], 0) for item in items)
    diff = current_sum - extracted_total

    if abs(diff) < SCORE_TOLERANCE:
        return score_map

    if diff <= 0:
        return score_map

    # Need to reduce. Sort by score DESC, reduce from top.
    adjusted = dict(score_map)
    sorted_ids = sorted(
        [item["id"] for item in items if item["id"] in adjusted],
        key=lambda x: adjusted.get(x, 0),
        reverse=True,
    )

    remaining = diff
    for item_id in sorted_ids:
        if remaining <= 0:
            break
        current = adjusted[item_id]
        reduction = min(current, remaining)
        adjusted[item_id] = round(current - reduction, 2)
        remaining = round(remaining - reduction, 2)

    return adjusted


# ── Response flattening ──────────────────────────────────────────────────


def _flatten_extracted_response(parsed: dict[str, Any]) -> dict[str, Any]:
    """Convert nested LLM response to flat key-value structure."""
    flat: dict[str, Any] = {}

    # Top-level candidate data
    candidato = parsed.get("dados_do_candidato", {})
    if isinstance(candidato, dict):
        for k, v in candidato.items():
            flat[k] = v

    # Totals
    totais = parsed.get("totais", {})
    if isinstance(totais, dict):
        for k, v in totais.items():
            flat[k] = v

    # Per-item scores
    notas = parsed.get("notas_dos_itens", {})
    if isinstance(notas, dict):
        for k, v in notas.items():
            flat[k] = v

    # Per-question totals
    qtotais = parsed.get("totais_por_questao", {})
    if isinstance(qtotais, dict):
        for k, v in qtotais.items():
            flat[k] = v

    # Also preserve any root-level keys
    for k, v in parsed.items():
        if k not in ("dados_do_candidato", "totais", "notas_dos_itens", "totais_por_questao"):
            flat[k] = v

    return flat


def _normalize_item_id(raw: str) -> str:
    """Normalize item ID: 'Quesito PECA-07' → 'peca-07'."""
    cleaned = re.sub(r"^(Quesito|Item|Questão|Peca)\s*", "", raw, flags=re.IGNORECASE)
    return cleaned.strip().lower().replace(" ", "-")


# ── Main entry point ─────────────────────────────────────────────────────


async def generate_mirror(
    session: AsyncSession,
    *,
    lead_id: str,
    especialidade: str,
    espelho_padrao_id: str | None = None,
    images: list[str] | list[dict[str, Any]],
    selected_provider: str | None = None,
    on_progress: Callable[[str, Any], Awaitable[None]] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """Extract mirror data from correction sheet images.

    Returns dict with: extractedData, structuredMirror, markdownMirror, jsonMirror.
    """
    start_time = time.monotonic()

    base_instructions = (
        "Você é um assistente jurídico especializado em extrair dados de espelhos de correção "
        "de provas da OAB. Analise a imagem e extraia TODOS os dados visíveis: "
        "nome do examinando, inscrição, nota final, situação, pontuação total da peça, "
        "pontuação total das questões, e cada nota individual por item/quesito. "
        "Retorne um JSON estruturado."
    )

    config = await get_agent_config(
        session,
        linked_column="ESPELHO_CELL",
        env_blueprint_id_var="OAB_MIRROR_EXTRACTOR_BLUEPRINT_ID",
        env_assistant_id_var="OAB_MIRROR_EXTRACTOR_ASSISTANT_ID",
        search_terms=["Espelho", "Mirror", "Correção"],
        base_instructions=base_instructions,
        selected_provider=selected_provider,
    )

    policy = resolve_runtime_policy(
        stage="mirror",
        provider=config.provider,
        metadata=config.metadata,
        explicit_max_output_tokens=config.max_output_tokens or None,
    )

    # Load rubric
    rubric = await _load_rubric(session, especialidade, espelho_padrao_id)

    if cancel_check:
        cancel_check()

    # Prepare images
    from domains.socialwise.services.oab_eval.transcription_agent import (
        ImageDescriptor,
        _fetch_image_as_base64,
    )
    import asyncio

    descriptors = [
        ImageDescriptor(
            id=f"mirror-{i}" if isinstance(img, str) else img.get("id", f"mirror-{i}"),
            url=img if isinstance(img, str) else img.get("url", ""),
            page=i + 1,
        )
        for i, img in enumerate(images)
    ]
    prepared = await asyncio.gather(*[_fetch_image_as_base64(d) for d in descriptors])
    valid_images = [p for p in prepared if not p.missing and p.base64]

    if not valid_images:
        raise RuntimeError("Nenhuma imagem válida para extração do espelho")

    if on_progress:
        await on_progress("extracting", {"imageCount": len(valid_images)})

    # Build vision call
    user_prompt = (
        "Extraia TODOS os dados visíveis desta folha de correção do exame OAB. "
        "Retorne um JSON com: dados_do_candidato (nome, inscricao, nota_final, situacao), "
        "totais (pontuacao_total_peca, pontuacao_total_questoes), "
        "notas_dos_itens (nota_obtida_<id>, fonte_nota_<id> para cada item), "
        "totais_por_questao."
    )

    effective_max_tokens = policy.max_output_tokens if policy.max_output_tokens > 0 else 12_000
    litellm_model = config.litellm_model

    # Call vision (single or multi-image)
    try:
        if len(valid_images) == 1:
            result = await with_retry(
                lambda: call_vision(
                    litellm_model,
                    config.system_instructions,
                    user_prompt,
                    valid_images[0].base64,
                    valid_images[0].mime_type,
                    max_tokens=effective_max_tokens,
                    temperature=0.0,
                    timeout=policy.timeout_s,
                ),
                context=f"Mirror:{config.provider}/{config.model}",
                retries=policy.retry_attempts,
                base_delay_ms=policy.retry_base_delay_ms,
                max_delay_ms=policy.retry_max_delay_ms,
            )
        else:
            img_list = [{"base64": img.base64, "mime_type": img.mime_type} for img in valid_images]
            result = await with_retry(
                lambda: call_vision_multi(
                    litellm_model,
                    config.system_instructions,
                    user_prompt,
                    img_list,
                    max_tokens=effective_max_tokens,
                    temperature=0.0,
                    timeout=policy.timeout_s,
                ),
                context=f"Mirror:{config.provider}/{config.model}",
                retries=policy.retry_attempts,
                base_delay_ms=policy.retry_base_delay_ms,
                max_delay_ms=policy.retry_max_delay_ms,
            )
    except Exception as primary_err:
        # Fallback to OpenAI
        if config.provider != "OPENAI":
            logger.warning("mirror_primary_failed", provider=config.provider, error=str(primary_err)[:300])
            fallback_model = resolve_litellm_model("OPENAI", OPENAI_FALLBACK_MODEL)
            cleaned = clean_prompt_for_openai(config.system_instructions)
            if len(valid_images) == 1:
                result = await call_vision(
                    fallback_model, cleaned, user_prompt,
                    valid_images[0].base64, valid_images[0].mime_type,
                    max_tokens=effective_max_tokens, temperature=0.0, timeout=policy.timeout_s,
                )
            else:
                img_list = [{"base64": img.base64, "mime_type": img.mime_type} for img in valid_images]
                result = await call_vision_multi(
                    fallback_model, cleaned, user_prompt,
                    img_list,
                    max_tokens=effective_max_tokens, temperature=0.0, timeout=policy.timeout_s,
                )
        else:
            raise

    # Parse LLM response as JSON
    raw_text = result.content.strip()
    # Try to extract JSON from markdown code blocks
    json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
    json_str = json_match.group(1) if json_match else raw_text

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        logger.error("mirror_json_parse_failed", raw=raw_text[:500])
        parsed = {}

    # Flatten response
    extracted_data = _flatten_extracted_response(parsed)

    # Rubric scoring (if rubric available)
    structured_mirror: dict[str, Any] = {}
    if rubric:
        score_map = build_score_map(rubric, extracted_data)

        # Get extracted totals
        extracted_peca = sanitize_raw_score(extracted_data.get("pontuacao_total_peca"))
        extracted_questoes = sanitize_raw_score(extracted_data.get("pontuacao_total_questoes"))

        # Separate items by scope
        peca_items = [i for i in rubric.get("itens", []) if i.get("escopo") != "Questão"]
        questao_items = [i for i in rubric.get("itens", []) if i.get("escopo") == "Questão"]

        # Rebalance
        score_map = _rebalance_overrides(peca_items, score_map, extracted_peca)
        score_map = _rebalance_overrides(questao_items, score_map, extracted_questoes)

        verification = verify_rubric_totals(rubric, score_map)
        structured_mirror = {
            "scoreMap": {k: v for k, v in score_map.items()},
            "verification": verification,
        }

    # Build markdown representation
    markdown_lines = ["# Espelho de Correção\n"]
    for key in ("nome_do_examinando", "inscricao", "nota_final", "situacao"):
        if key in extracted_data:
            label = key.replace("_", " ").title()
            markdown_lines.append(f"**{label}:** {extracted_data[key]}")
    markdown_lines.append("")

    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    logger.info(
        "mirror_complete",
        lead_id=lead_id,
        provider=result.provider,
        model=result.model,
        tokens_in=result.input_tokens,
        tokens_out=result.output_tokens,
        duration_ms=elapsed_ms,
    )

    return {
        "extractedData": extracted_data,
        "structuredMirror": structured_mirror,
        "markdownMirror": "\n".join(markdown_lines),
        "jsonMirror": parsed,
        "tokenUsage": {
            "input": result.input_tokens,
            "output": result.output_tokens,
            "total": result.input_tokens + result.output_tokens,
        },
        "provider": result.provider,
        "model": result.model,
        "durationMs": elapsed_ms,
    }
