import pytest

from domains.socialwise.services.intent.processor import process_socialwise_intent
from domains.socialwise.services.intent.provider_processor import route_intent_or_chat
from domains.socialwise.services.intent.types import AssistantConfig, ProcessorContext


@pytest.mark.asyncio
async def test_process_socialwise_intent_shortcuts_flow_button():
    result = await process_socialwise_intent(
        ProcessorContext(
            user_text="Abrir",
            channel_type="Channel::WhatsApp",
            inbox_id="inbox_1",
            original_payload={
                "context": {
                    "interaction_type": "button_reply",
                    "message": {
                        "content_attributes": {
                            "interaction_type": "button_reply",
                            "button_reply": {"id": "flow_abc", "title": "Abrir fluxo"},
                        }
                    },
                }
            },
        )
    )

    assert result.action == "resume_flow"
    assert result.flow_button_id == "flow_abc"


@pytest.mark.asyncio
async def test_process_socialwise_intent_shortcuts_direct_intent_button():
    result = await process_socialwise_intent(
        ProcessorContext(
            user_text="",
            channel_type="Channel::WhatsApp",
            inbox_id="inbox_1",
            original_payload={
                "context": {
                    "interaction_type": "button_reply",
                    "message": {
                        "content_attributes": {
                            "interaction_type": "button_reply",
                            "button_reply": {"id": "@mandado_de_seguranca", "title": "Mandado"},
                        }
                    },
                }
            },
        )
    )

    assert result.selected_intent is not None
    assert result.selected_intent.slug == "mandado_de_seguranca"
    assert result.selected_intent.source == "router_button"


@pytest.mark.asyncio
async def test_route_intent_or_chat_fallback_has_at_least_two_buttons(monkeypatch):
    async def fail_call(*_args, **_kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(
        "domains.socialwise.services.intent.provider_processor.call_structured",
        fail_call,
    )

    decision = await route_intent_or_chat(
        "Preciso de ajuda",
        AssistantConfig(assistant_id="assistant_1", model="gpt-5-mini", provider="OPENAI"),
        channel_type="Channel::WhatsApp",
        intent_hints=[],
    )

    assert decision.mode == "chat"
    assert len(decision.buttons) >= 2
