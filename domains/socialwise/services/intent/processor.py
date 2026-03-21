"""High-level processor for the SocialWise intent classification pipeline."""

from __future__ import annotations

from time import perf_counter

from domains.socialwise.services.intent.assistant_config import (
    load_assistant_configuration,
    resolve_user_id_for_inbox,
)
from domains.socialwise.services.intent.bands import (
    process_hard_band,
    process_router_band,
    process_soft_band,
)
from domains.socialwise.services.intent.button_processor import (
    button_to_user_text,
    detect_button_click,
    is_flow_button,
    is_handoff_button,
)
from domains.socialwise.services.intent.cache import SocialwiseIntentCache
from domains.socialwise.services.intent.classification import classify_intent
from domains.socialwise.services.intent.payload_builder import (
    build_fallback_response,
    normalize_channel_type,
)
from domains.socialwise.services.intent.types import (
    CacheKeyConfig,
    ClassificationMetrics,
    ClassificationResult,
    ProcessorContext,
    ProcessorResult,
    SelectedIntent,
)


def _synthetic_classification(
    *,
    band: str,
    strategy: str,
    score: float = 0.0,
    route_total_ms: int = 0,
) -> ClassificationResult:
    return ClassificationResult(
        band=band,  # type: ignore[arg-type]
        score=score,
        candidates=[],
        strategy=strategy,  # type: ignore[arg-type]
        metrics=ClassificationMetrics(route_total_ms=route_total_ms),
    )


async def process_socialwise_intent(
    context: ProcessorContext,
    *,
    embedipreview: bool | None = None,
) -> ProcessorResult:
    started = perf_counter()
    cache = SocialwiseIntentCache()
    button = detect_button_click(context.original_payload, context.channel_type)

    if button.is_button_click and is_flow_button(button.button_id):
        classification = _synthetic_classification(
            band="ROUTER",
            strategy="button_flow",
            score=1.0,
            route_total_ms=int((perf_counter() - started) * 1000),
        )
        return ProcessorResult(
            classification=classification,
            action="resume_flow",
            flow_button_id=button.button_id,
        )

    if button.is_button_click and is_handoff_button(button.button_id):
        classification = _synthetic_classification(
            band="ROUTER",
            strategy="button_handoff",
            score=1.0,
            route_total_ms=int((perf_counter() - started) * 1000),
        )
        return ProcessorResult(classification=classification, action="handoff")

    if button.is_button_click and button.button_id and (
        button.button_id.startswith("@") or button.button_id.lower().startswith("intent:")
    ):
        payload = button.button_id if button.button_id.startswith("@") else f"@{button.button_id.split(':', 1)[1].strip()}"
        classification = _synthetic_classification(
            band="HARD",
            strategy="button_intent",
            score=1.0,
            route_total_ms=int((perf_counter() - started) * 1000),
        )
        return ProcessorResult(
            classification=classification,
            selected_intent=SelectedIntent(
                slug=payload[1:],
                name=payload[1:],
                payload=payload,
                score=1.0,
                source="router_button",
            ),
        )

    if button.is_button_click:
        normalized_text = button_to_user_text(button.button_id, context.user_text)
        if normalized_text:
            context.user_text = normalized_text

    user_id = context.user_id or await resolve_user_id_for_inbox(context.inbox_id, context.chatwit_account_id)
    if not user_id:
        classification = _synthetic_classification(
            band="ROUTER",
            strategy="fallback_no_user",
            route_total_ms=int((perf_counter() - started) * 1000),
        )
        return ProcessorResult(
            classification=classification,
            response=build_fallback_response(context.channel_type),
        )

    assistant = await load_assistant_configuration(
        context.inbox_id,
        context.chatwit_account_id,
        context.assistant_id,
    )
    if not assistant:
        classification = _synthetic_classification(
            band="ROUTER",
            strategy="fallback_no_config",
            route_total_ms=int((perf_counter() - started) * 1000),
        )
        return ProcessorResult(
            classification=classification,
            response=build_fallback_response(context.channel_type),
        )

    effective_embed_preview = assistant.embedipreview if embedipreview is None else embedipreview
    context.session_ttl_seconds = assistant.session_ttl_seconds
    context.session_ttl_dev_seconds = assistant.session_ttl_dev_seconds

    cache_config = CacheKeyConfig(
        account_id=context.chatwit_account_id or "default",
        inbox_id=context.inbox_id,
        agent_id=assistant.assistant_id,
        model=assistant.model,
        prompt_version="v1",
        channel_type=normalize_channel_type(context.channel_type),
        embedipreview=effective_embed_preview,
    )

    classification = await classify_intent(
        context.user_text,
        user_id,
        assistant,
        embedipreview=effective_embed_preview,
        channel_type=context.channel_type,
        inbox_id=context.inbox_id,
        trace_id=context.trace_id,
        cache_config=cache_config,
        cache=cache,
    )

    if classification.band == "HARD":
        selected = process_hard_band(classification)
        return ProcessorResult(classification=classification, selected_intent=selected)

    if classification.band == "SOFT":
        response = await process_soft_band(
            context.user_text,
            classification,
            assistant,
            channel_type=context.channel_type,
            cache_config=cache_config,
            cache=cache,
        )
        return ProcessorResult(classification=classification, response=response)

    router_hints = classification.candidates
    if context.blocked_intent_slug:
        router_hints = [
            candidate
            for candidate in classification.candidates
            if candidate.slug != context.blocked_intent_slug
        ]

    selected_intent, response, action = await process_router_band(
        context.user_text,
        assistant,
        channel_type=context.channel_type,
        intent_hints=router_hints,
        supplemental_context=context.agent_supplement,
    )
    return ProcessorResult(
        classification=classification,
        selected_intent=selected_intent,
        response=response,
        action=action,
    )
