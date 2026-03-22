"""LiteLLM-backed warmup and router generation for SocialWise intents."""

from __future__ import annotations

import json
import re
import textwrap
from typing import Any

from domains.socialwise.services.intent.cache import SocialwiseIntentCache
from domains.socialwise.services.intent.payload_builder import CHANNEL_LIMITS, normalize_channel_type
from domains.socialwise.services.intent.types import (
    AssistantConfig,
    CacheKeyConfig,
    IntentCandidate,
    RouterButton,
    RouterDecision,
    WarmupButtonsResult,
)
from platform_core.ai.litellm_config import call_structured, resolve_litellm_model
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


def _clean_title(value: str, max_chars: int = 20) -> str:
    raw = " ".join((value or "").replace("_", " ").replace("-", " ").split())
    if not raw:
        return "Ajuda"
    shortened = textwrap.shorten(raw, width=max_chars, placeholder="").strip()
    return shortened[:max_chars].strip() or raw[:max_chars].strip()


def _heuristic_title(candidate: IntentCandidate) -> str:
    base = candidate.name or candidate.slug
    base = re.sub(r"[_-]+", " ", base).strip()
    titled = " ".join(word.capitalize() for word in base.split()[:4])
    return _clean_title(titled or candidate.slug)


def _coerce_buttons(
    raw_buttons: list[dict[str, Any]] | None,
    *,
    channel_type: str,
    fallback_candidates: list[IntentCandidate] | None = None,
    propose_handoff: bool = True,
) -> list[RouterButton]:
    channel = normalize_channel_type(channel_type)
    limits = CHANNEL_LIMITS[channel]
    buttons: list[RouterButton] = []
    allowed_payloads = {f"@{candidate.slug}" for candidate in (fallback_candidates or [])}
    if propose_handoff:
        allowed_payloads.add("@falar_atendente")

    for item in raw_buttons or []:
        title = _clean_title(str(item.get("title") or ""), limits["button_title"])
        payload = str(item.get("payload") or "").strip()[: limits["payload"]]
        if not title or not payload:
            continue
        if allowed_payloads and payload.startswith("@") and payload not in allowed_payloads:
            continue
        buttons.append(RouterButton(title=title, payload=payload))
        if len(buttons) >= limits["max_buttons"]:
            break

    if len(buttons) >= 2:
        return buttons

    fallback_buttons: list[RouterButton] = []
    for candidate in (fallback_candidates or [])[: limits["max_buttons"]]:
        fallback_buttons.append(RouterButton(title=_heuristic_title(candidate), payload=f"@{candidate.slug}"))
    if propose_handoff and len(fallback_buttons) < limits["max_buttons"]:
        fallback_buttons.append(RouterButton(title="Falar com atendente", payload="@falar_atendente"))
    generic_fallbacks = [
        RouterButton(title="Recomeçar", payload="@recomecar"),
        RouterButton(title="Outros assuntos", payload="@outros_assuntos"),
    ]
    for button in generic_fallbacks:
        if len(fallback_buttons) >= max(2, min(3, limits["max_buttons"])):
            break
        if all(existing.payload != button.payload for existing in fallback_buttons):
            fallback_buttons.append(button)
    return fallback_buttons[: max(2, min(len(fallback_buttons), limits["max_buttons"]))]


async def generate_short_titles(
    candidates: list[IntentCandidate],
    agent: AssistantConfig,
    *,
    cache_config: CacheKeyConfig | None = None,
    cache: SocialwiseIntentCache | None = None,
) -> list[str]:
    if not candidates:
        return []

    cache_client = cache or SocialwiseIntentCache()
    titles: list[str | None] = [None] * len(candidates)
    unresolved: list[tuple[int, IntentCandidate]] = []

    if cache_config:
        for index, candidate in enumerate(candidates):
            cached = await cache_client.get_short_title(cache_config, candidate.slug)
            if cached:
                titles[index] = _clean_title(cached)
            else:
                unresolved.append((index, candidate))
    else:
        unresolved = list(enumerate(candidates))

    if unresolved and agent.short_title_llm:
        try:
            model = resolve_litellm_model(agent.provider, agent.model)
            prompt = "\n".join(
                f"{idx + 1}. slug=@{candidate.slug} | nome={candidate.name} | desc={(candidate.desc or '').strip()[:140]}"
                for idx, (_, candidate) in enumerate(unresolved)
            )
            response = await call_structured(
                model,
                "Gere SOMENTE JSON válido no formato {\"titles\": [\"...\"]}. Cada título deve ter no máximo 20 caracteres.",
                (
                    "Crie títulos curtos, claros e em PT-BR para os intents abaixo.\n"
                    "Use linguagem humana, não técnica. Preserve o assunto.\n"
                    f"Intents:\n{prompt}"
                ),
                {"type": "object"},
                temperature=agent.temp_schema,
                max_tokens=min(agent.max_output_tokens, 300),
                timeout=max(5, int(agent.warmup_deadline_ms / 1000)),
                retries=1,
                base_delay_ms=300,
                max_delay_ms=800,
            )
            parsed = json.loads(response.content)
            llm_titles = parsed.get("titles") if isinstance(parsed, dict) else None
            if isinstance(llm_titles, list) and len(llm_titles) == len(unresolved):
                for (index, candidate), title in zip(unresolved, llm_titles, strict=False):
                    clean = _clean_title(str(title or ""), 20) or _heuristic_title(candidate)
                    titles[index] = clean
                    if cache_config:
                        await cache_client.set_short_title(cache_config, candidate.slug, clean)
        except Exception as exc:
            logger.warning("intent_short_titles_llm_error", error=str(exc))

    final_titles: list[str] = []
    for index, candidate in enumerate(candidates):
        final_titles.append(titles[index] or _heuristic_title(candidate))
    return final_titles


async def generate_warmup_buttons(
    user_text: str,
    candidates: list[IntentCandidate],
    agent: AssistantConfig,
    *,
    channel_type: str,
    cache_config: CacheKeyConfig | None = None,
    cache: SocialwiseIntentCache | None = None,
) -> WarmupButtonsResult:
    cache_client = cache or SocialwiseIntentCache()
    if cache_config:
        cached = await cache_client.get_warmup_result(cache_config, user_text, candidates)
        if cached:
            return cached

    channel = normalize_channel_type(channel_type)
    limits = CHANNEL_LIMITS[channel]
    titles = await generate_short_titles(candidates, agent, cache_config=cache_config, cache=cache_client)
    fallback = WarmupButtonsResult(
        response_text="Posso te ajudar melhor por um destes temas:",
        buttons=[
            RouterButton(title=_clean_title(title, limits["button_title"]), payload=f"@{candidate.slug}")
            for candidate, title in zip(candidates[: limits["max_buttons"]], titles[: limits["max_buttons"]], strict=False)
        ],
    )

    try:
        model = resolve_litellm_model(agent.provider, agent.model)
        candidate_block = "\n".join(
            f"- payload=@{candidate.slug} | titulo={title} | descricao={(candidate.desc or '').strip()[:140]}"
            for candidate, title in zip(candidates, titles, strict=False)
        )
        response = await call_structured(
            model,
            (
                "Gere SOMENTE JSON válido com formato "
                "{\"response_text\":\"...\",\"buttons\":[{\"title\":\"...\",\"payload\":\"@slug\"}]}. "
                "Todos os textos devem estar em PT-BR."
            ),
            (
                "O usuário escreveu: "
                f"\"{user_text.strip()}\".\n"
                "Crie uma introdução curta e 2 a 3 botões para desambiguar a intenção.\n"
                f"Limites do canal: body <= {limits['body']}, título <= {limits['button_title']}.\n"
                "Use apenas os payloads fornecidos abaixo.\n"
                f"{candidate_block}"
            ),
            {"type": "object"},
            temperature=agent.temp_copy,
            max_tokens=min(agent.max_output_tokens, 400),
            timeout=max(5, int(agent.warmup_deadline_ms / 1000)),
            retries=1,
            base_delay_ms=300,
            max_delay_ms=800,
        )
        parsed = json.loads(response.content)
        result = WarmupButtonsResult(
            response_text=str(parsed.get("response_text") or fallback.response_text)[: limits["body"]],
            buttons=_coerce_buttons(
                parsed.get("buttons") if isinstance(parsed, dict) else None,
                channel_type=channel_type,
                fallback_candidates=candidates,
                propose_handoff=False,
            ),
        )
        if len(result.buttons) < 2:
            result = fallback
    except Exception as exc:
        logger.warning("intent_warmup_llm_error", error=str(exc))
        result = fallback

    if cache_config:
        await cache_client.set_warmup_result(cache_config, user_text, candidates, result)
    return result


async def route_intent_or_chat(
    user_text: str,
    agent: AssistantConfig,
    *,
    channel_type: str,
    intent_hints: list[IntentCandidate] | None = None,
    supplemental_context: str | None = None,
) -> RouterDecision:
    hints = intent_hints or []
    channel = normalize_channel_type(channel_type)
    limits = CHANNEL_LIMITS[channel]
    fallback_buttons = _coerce_buttons(
        [],
        channel_type=channel_type,
        fallback_candidates=hints,
        propose_handoff=agent.propose_human_handoff,
    )
    fallback = RouterDecision(
        mode="chat",
        intent_payload="",
        response_text="Vou te orientar por aqui. Escolha a opção mais próxima do que você precisa:",
        buttons=fallback_buttons,
    )

    if agent.disable_intent_suggestion and not hints:
        return fallback

    try:
        model = resolve_litellm_model(agent.provider, agent.model)
        hints_block = "\n".join(
            f"- @{candidate.slug} nome={candidate.name} desc={(candidate.desc or '').strip()[:140]} score={candidate.score or 0:.3f}"
            for candidate in hints[:5]
        ) or "- sem hints"
        context_block = f"\nContexto adicional:\n{supplemental_context.strip()}\n" if supplemental_context else ""
        response = await call_structured(
            model,
            (
                "Você é um roteador de intenções. Responda SOMENTE JSON válido com o formato "
                "{\"mode\":\"intent|chat\",\"intent_payload\":\"@slug|\",\"response_text\":\"...\","
                "\"buttons\":[{\"title\":\"...\",\"payload\":\"@slug\"}]}. "
                "Use PT-BR e não invente payloads fora dos hints."
            ),
            (
                f"Texto do usuário: \"{user_text.strip()}\".\n"
                "Escolha mode='intent' apenas se houver 1 hint claramente alinhado.\n"
                "Se houver ambiguidade, follow-up, ou precisar explicar melhor, use mode='chat'.\n"
                f"Limites do canal: body <= {limits['body']}, título <= {limits['button_title']}.\n"
                f"INTENT_HINTS:\n{hints_block}\n"
                f"{context_block}"
                "Se usar mode='intent', o intent_payload deve ser exatamente um dos hints fornecidos.\n"
                "Se usar mode='chat', ofereça 2 a 3 botões úteis."
            ),
            {"type": "object"},
            temperature=agent.temp_schema,
            max_tokens=min(agent.max_output_tokens, 500),
            timeout=max(5, int(agent.hard_deadline_ms / 1000)),
            retries=1,
            base_delay_ms=300,
            max_delay_ms=800,
        )
        parsed = json.loads(response.content)
        payload = str(parsed.get("intent_payload") or "").strip()
        allowed_payloads = {f"@{candidate.slug}" for candidate in hints[:5]}
        mode = str(parsed.get("mode") or "chat")
        if mode == "intent" and payload and (payload in allowed_payloads or payload == "@falar_atendente"):
            return RouterDecision(
                mode="intent",
                intent_payload=payload,
                response_text=str(parsed.get("response_text") or "")[: limits["body"]],
                buttons=_coerce_buttons(
                    parsed.get("buttons") if isinstance(parsed, dict) else None,
                    channel_type=channel_type,
                    fallback_candidates=hints,
                    propose_handoff=agent.propose_human_handoff,
                ),
            )

        return RouterDecision(
            mode="chat",
            intent_payload="",
            response_text=str(parsed.get("response_text") or fallback.response_text)[: limits["body"]],
            buttons=_coerce_buttons(
                parsed.get("buttons") if isinstance(parsed, dict) else None,
                channel_type=channel_type,
                fallback_candidates=hints,
                propose_handoff=agent.propose_human_handoff,
            ),
        )
    except Exception as exc:
        logger.warning("intent_router_llm_error", error=str(exc))
        return fallback
