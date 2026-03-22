"""Band handlers for the SocialWise intent processor."""

from __future__ import annotations

from domains.socialwise.services.intent.cache import SocialwiseIntentCache
from domains.socialwise.services.intent.payload_builder import build_channel_response
from domains.socialwise.services.intent.provider_processor import (
    generate_warmup_buttons,
    route_intent_or_chat,
)
from domains.socialwise.services.intent.types import (
    AssistantConfig,
    CacheKeyConfig,
    ClassificationResult,
    IntentCandidate,
    SelectedIntent,
)


def process_hard_band(classification: ClassificationResult) -> SelectedIntent:
    top_candidate = classification.candidates[0]
    return SelectedIntent(
        slug=top_candidate.slug,
        name=top_candidate.name,
        payload=f"@{top_candidate.slug}",
        score=top_candidate.score,
        source="classification",
    )


async def process_soft_band(
    user_text: str,
    classification: ClassificationResult,
    agent: AssistantConfig,
    *,
    channel_type: str,
    cache_config: CacheKeyConfig | None = None,
    cache: SocialwiseIntentCache | None = None,
) -> dict:
    warmup = await generate_warmup_buttons(
        user_text,
        classification.candidates,
        agent,
        channel_type=channel_type,
        cache_config=cache_config,
        cache=cache,
    )
    return build_channel_response(channel_type, warmup.response_text, warmup.buttons)


async def process_router_band(
    user_text: str,
    agent: AssistantConfig,
    *,
    channel_type: str,
    intent_hints: list[IntentCandidate] | None = None,
    supplemental_context: str | None = None,
) -> tuple[SelectedIntent | None, dict | None, str | None]:
    decision = await route_intent_or_chat(
        user_text,
        agent,
        channel_type=channel_type,
        intent_hints=intent_hints,
        supplemental_context=supplemental_context,
    )

    if decision.mode == "intent" and decision.intent_payload == "@falar_atendente":
        return None, None, "handoff"

    if decision.mode == "intent" and decision.intent_payload.startswith("@"):
        slug = decision.intent_payload[1:]
        hint = next((candidate for candidate in intent_hints or [] if candidate.slug == slug), None)
        return (
            SelectedIntent(
                slug=slug,
                name=hint.name if hint else slug,
                payload=decision.intent_payload,
                score=hint.score if hint else None,
                source="router_llm",
            ),
            None,
            None,
        )

    response = build_channel_response(channel_type, decision.response_text, decision.buttons)
    return None, response, None
