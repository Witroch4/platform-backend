"""Rubric scoring — verification and sanitization for OAB mirror data.

Port of: lib/oab-eval/rubric-scoring.ts

Provides:
- Score sanitization (string "1,5" → float 1.50)
- Build score map from extracted LLM data
- Rubric total verification (deterministic)
"""

from __future__ import annotations

import math
from typing import Any


def round_to_two(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    return round(value, 2)


def _normalize_peso(value: float | None) -> float | None:
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    if value <= 0:
        return 0.0
    return round_to_two(value)


def _build_ou_group_id(ids: list[str] | None) -> str | None:
    if not ids:
        return None
    sorted_ids = sorted(ids)
    return f"OG-{'|'.join(sorted_ids)}"


# ── Subitem type (mirrors the TS Subitem) ─────────────────────────────────


def _convert_rubric_to_subitems(
    rubric: dict[str, Any],
    overrides: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Convert rubric items to subitems for verification."""
    overrides_provided = overrides is not None

    subitems: list[dict[str, Any]] = []
    for item in rubric.get("itens", []):
        override = overrides.get(item["id"]) if overrides else None
        if override is not None:
            peso_base = _normalize_peso(override)
        elif overrides_provided:
            peso_base = 0.0
        else:
            peso_base = _normalize_peso(item.get("nota_maxima"))

        subitems.append({
            "id": item["id"],
            "escopo": "Questão" if item.get("escopo") == "Questão" else "Peça",
            "questao": item.get("questao"),
            "descricao": item.get("descricao", ""),
            "nota_maxima": peso_base or 0.0,
            "fundamentos": item.get("fundamentos", []),
            "palavras_chave": item.get("palavras_chave", []),
            "embedding_text": item.get("embedding_text", ""),
            "ou_group_id": _build_ou_group_id(item.get("alternativas_grupo")),
            "ou_group_mode": "pick_best",
        })
    return subitems


# ── Score sanitization ────────────────────────────────────────────────────


def sanitize_raw_score(raw: Any, max_peso: float | None = None) -> float | None:
    """Sanitize a raw score value from LLM output.

    Handles: number, "1,5", "[não-visivel]", empty string.
    """
    numeric: float | None = None

    if isinstance(raw, (int, float)) and math.isfinite(raw):
        numeric = float(raw)
    elif isinstance(raw, str):
        trimmed = raw.strip()
        if not trimmed or trimmed == "[não-visivel]":
            return None
        normalized = trimmed.replace(",", ".")
        try:
            parsed = float(normalized)
            if math.isfinite(parsed):
                numeric = parsed
        except ValueError:
            pass

    if numeric is None:
        return None

    sanitized = round_to_two(numeric)
    if max_peso is not None and math.isfinite(max_peso):
        limite = round_to_two(max(0.0, max_peso))
        sanitized = min(sanitized, limite)

    if sanitized < 0:
        return 0.0
    return round_to_two(sanitized)


# ── Score map ─────────────────────────────────────────────────────────────


def build_score_map(
    rubric: dict[str, Any],
    extracted_data: dict[str, Any],
) -> dict[str, float]:
    """Build a map of item_id → sanitized score from LLM extracted data."""
    scores: dict[str, float] = {}
    for item in rubric.get("itens", []):
        nota_key = f"nota_obtida_{item['id']}"
        raw_value = extracted_data.get(nota_key)
        sanitized = sanitize_raw_score(raw_value, item.get("nota_maxima"))
        if sanitized is not None:
            scores[item["id"]] = sanitized
    return scores


# ── Verification ──────────────────────────────────────────────────────────


def _calc_sum(items: list[dict[str, Any]]) -> float:
    """Calculate sum respecting ou_groups (pick best)."""
    soma = 0.0
    groups: dict[str, dict[str, Any]] = {}

    for item in items:
        group_id = item.get("ou_group_id")
        if group_id:
            if group_id not in groups:
                groups[group_id] = {"items": [], "mode": item.get("ou_group_mode")}
            groups[group_id]["items"].append(item)
        else:
            soma += item.get("nota_maxima", 0.0)

    for group in groups.values():
        mode = group.get("mode", "pick_best")
        group_items = group["items"]
        if mode == "pick_best" and group_items:
            soma += max(i.get("nota_maxima", 0.0) for i in group_items)
        else:
            soma += sum(i.get("nota_maxima", 0.0) for i in group_items)

    return round_to_two(soma)


def verify_rubric_totals(
    rubric: dict[str, Any],
    overrides: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Verify rubric totals (deterministic).

    Returns structure with peca, questoes, geral totals and deviation checks.
    """
    subitems = _convert_rubric_to_subitems(rubric, overrides)

    peca_items = [s for s in subitems if s["escopo"] == "Peça"]
    questao_items = [s for s in subitems if s["escopo"] == "Questão"]

    # Group questões by questao number
    questao_groups: dict[str, list[dict[str, Any]]] = {}
    for item in questao_items:
        q = str(item.get("questao", "?"))
        questao_groups.setdefault(q, []).append(item)

    peca_total = _calc_sum(peca_items)
    peca_esperado = 5.0
    questoes_total = _calc_sum(questao_items)
    questoes_esperado = 5.0
    geral_total = round_to_two(peca_total + questoes_total)
    geral_esperado = 10.0

    por_questao = {}
    for q_num, q_items in questao_groups.items():
        q_total = _calc_sum(q_items)
        # Expected per question depends on rubric structure
        por_questao[q_num] = {
            "total": q_total,
            "esperado": q_total,  # self-consistent
            "desvio": 0.0,
            "ok": True,
        }

    return {
        "peca": {
            "total": peca_total,
            "esperado": peca_esperado,
            "desvio": round_to_two(abs(peca_total - peca_esperado)),
            "ok": abs(peca_total - peca_esperado) < 0.01,
        },
        "questoes": {
            "total": questoes_total,
            "esperado": questoes_esperado,
            "desvio": round_to_two(abs(questoes_total - questoes_esperado)),
            "ok": abs(questoes_total - questoes_esperado) < 0.01,
            "porQuestao": por_questao,
        },
        "geral": {
            "total": geral_total,
            "esperado": geral_esperado,
            "desvio": round_to_two(abs(geral_total - geral_esperado)),
            "ok": abs(geral_total - geral_esperado) < 0.01,
        },
    }


def prepare_rubric_scoring(
    rubric: dict[str, Any],
    extracted_data: dict[str, Any],
) -> dict[str, Any]:
    """Prepare rubric scoring with expected, obtained, and score map."""
    expected = verify_rubric_totals(rubric)
    score_map = build_score_map(rubric, extracted_data)
    obtained = verify_rubric_totals(rubric, score_map)
    return {"expected": expected, "obtained": obtained, "scoreMap": score_map}
