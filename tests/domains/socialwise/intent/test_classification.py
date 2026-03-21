from types import SimpleNamespace

import pytest

from domains.socialwise.services.intent import classification as classification_module
from domains.socialwise.services.intent.types import AssistantConfig


class _DummyRedisFactory:
    @staticmethod
    def from_url(*_args, **_kwargs):
        return object()


@pytest.mark.asyncio
async def test_classify_intent_alias_direct_hit_uses_real_slug(monkeypatch):
    async def fake_load_active_intents(_user_id: str):
        return [
            classification_module.IntentRow(
                id="intent_1",
                name="Mandado de Segurança",
                slug="mandado_de_seguranca",
                description="Ação constitucional",
                similarity_threshold=0.8,
                embedding=[1.0, 0.0],
            )
        ]

    async def fake_load_vector_pack(_redis_client, _intent):
        return classification_module.IntentVectorPack(
            centroid=[1.0, 0.0],
            aliases=[],
            alias_texts=["mandado de segurança"],
            source="redis",
        )

    monkeypatch.setattr(classification_module, "_load_active_intents", fake_load_active_intents)
    monkeypatch.setattr(classification_module, "_load_vector_pack", fake_load_vector_pack)
    monkeypatch.setattr(classification_module, "Redis", _DummyRedisFactory)

    result = await classification_module.classify_intent(
        "Preciso de um mandado de segurança urgente",
        "user_1",
        AssistantConfig(assistant_id="assistant_1", model="gpt-5-nano", provider="OPENAI"),
    )

    assert result.band == "HARD"
    assert result.candidates[0].slug == "mandado_de_seguranca"
    assert result.candidates[0].name == "Mandado de Segurança"
    assert result.candidates[0].alias_matched == "mandado de segurança"
