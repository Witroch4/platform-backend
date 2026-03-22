from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from domains.socialwise.services.intent import assistant_config as assistant_config_module


@pytest.mark.asyncio
async def test_load_assistant_configuration_prefers_link_and_inbox_overrides(monkeypatch):
    linked_assistant = SimpleNamespace(
        id="assistant_linked",
        model="gpt-5-mini",
        provider="OPENAI",
        fallback_provider=None,
        fallback_model=None,
        instructions="Atenda em PT-BR",
        embedipreview=True,
        reasoning_effort="minimal",
        verbosity="low",
        temperature=0.7,
        top_p=0.8,
        temp_schema=0.1,
        temp_copy=0.4,
        max_output_tokens=648,
        warmup_deadline_ms=15000,
        hard_deadline_ms=15000,
        soft_deadline_ms=18000,
        short_title_llm=True,
        tool_choice="auto",
        propose_human_handoff=True,
        disable_intent_suggestion=False,
        session_ttl_seconds=86400,
        session_ttl_dev_seconds=300,
        is_active=True,
    )
    inbox = SimpleNamespace(
        socialwise_inherit_from_agent=False,
        socialwise_reasoning_effort="high",
        socialwise_verbosity="medium",
        socialwise_temperature=0.2,
        socialwise_temp_schema=0.05,
        socialwise_warmup_deadline_ms=9000,
        socialwise_hard_deadline_ms=12000,
        socialwise_soft_deadline_ms=14000,
        socialwise_short_title_llm=False,
        socialwise_tool_choice="none",
        ai_assistant_links=[
            SimpleNamespace(
                is_active=True,
                assistant=linked_assistant,
                created_at=None,
                id="link_1",
            )
        ],
        usuario_chatwit=SimpleNamespace(app_user_id="user_1"),
    )

    async def fake_load_inbox(_inbox_id: str, _chatwit_account_id: str | None):
        return inbox

    @asynccontextmanager
    async def fake_session_ctx():
        yield SimpleNamespace()

    monkeypatch.setattr(assistant_config_module, "_load_inbox", fake_load_inbox)
    monkeypatch.setattr(assistant_config_module, "session_ctx", fake_session_ctx)
    assistant_config_module._assistant_cache.clear()

    config = await assistant_config_module.load_assistant_configuration("inbox_1")

    assert config is not None
    assert config.assistant_id == "assistant_linked"
    assert config.temperature == 0.2
    assert config.reasoning_effort == "high"
    assert config.short_title_llm is False
    assert config.tool_choice == "none"
