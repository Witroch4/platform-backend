from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from domains.socialwise.db.models.flow_session import FlowSessionStatus
from domains.socialwise.services.flow import chatwit_config
from domains.socialwise.services.flow.chatwit_config import save_chatwit_system_config
from domains.socialwise.services.flow.delivery_service import DeliveryContext
from domains.socialwise.services.flow.executor import FlowExecutor
from domains.socialwise.services.flow.orchestrator import FlowOrchestrator
from domains.socialwise.services.flow.variable_resolver import VariableResolver


def test_variable_resolver_supports_delivery_context_objects():
    ctx = DeliveryContext(
        account_id=42,
        conversation_id=99,
        inbox_id=7,
        contact_id=123,
        contact_name="Maria",
        contact_phone="5584999999999",
        channel_type="whatsapp",
    )
    resolver = VariableResolver(
        ctx,
        {
            "payment_url": "https://pay.example/123",
            "lead": {"documento": "123.456.789-00"},
        },
    )

    resolved = resolver.resolve(
        "Oi {{contact.name}} | {{conversation.id}} | {{conversation.channel}} | {{lead.documento}} | {{payment_url}}"
    )

    assert resolved == "Oi Maria | 99 | whatsapp | 123.456.789-00 | https://pay.example/123"
    assert resolver.get_available_variables()


def test_flow_orchestrator_flow_session_to_data_coerces_enum_status():
    now = datetime.now(timezone.utc)
    row = SimpleNamespace(
        id="sess_1",
        flow_id="flow_1",
        conversation_id="10",
        contact_id="20",
        inbox_id="30",
        status=FlowSessionStatus.WAITING_INPUT,
        current_node_id="node_1",
        variables={"foo": "bar"},
        execution_log=[],
        created_at=now,
        updated_at=now,
        completed_at=None,
    )

    data = FlowOrchestrator().flow_session_to_data(row)

    assert data is not None
    assert data.status == "WAITING_INPUT"


def test_flow_executor_uses_database_interactive_template_shape():
    executor = FlowExecutor(
        DeliveryContext(
            account_id=1,
            conversation_id=10,
            inbox_id=5,
            contact_id=7,
            contact_name="Joao",
            contact_phone="5584988887777",
            channel_type="whatsapp",
        )
    )
    content = SimpleNamespace(
        body=SimpleNamespace(text="Ola {{contact.name}}"),
        header=SimpleNamespace(type="text", content="Cabecalho {{contact.phone}}"),
        footer=SimpleNamespace(text="Rodape"),
        action_reply_button=SimpleNamespace(
            buttons=[
                {"title": "Primeira opcao", "payload": "flow_first"},
                {"title": "Segunda opcao", "payload": "flow_second"},
            ]
        ),
        action_cta_url=None,
    )

    payload = executor.build_interactive_from_template(content)

    assert payload["type"] == "button"
    assert payload["body"]["text"] == "Ola Joao"
    assert payload["header"]["text"] == "Cabecalho 5584988887777"
    assert payload["footer"]["text"] == "Rodape"
    assert payload["action"]["buttons"][0]["reply"]["id"] == "flow_first"
    assert payload["action"]["buttons"][1]["reply"]["title"] == "Segunda opcao"


def test_parse_currency_to_cents_handles_cent_and_decimal_inputs():
    executor = FlowExecutor(
        DeliveryContext(
            account_id=1,
            conversation_id=10,
            inbox_id=5,
            contact_id=7,
            contact_name="Joao",
            contact_phone="5584988887777",
            channel_type="whatsapp",
        )
    )

    assert executor.parse_currency_to_cents("2790") == 2790
    assert executor.parse_currency_to_cents("27.90") == 2790
    assert executor.parse_currency_to_cents("R$ 27,90") == 2790


@pytest.mark.asyncio
async def test_save_chatwit_system_config_commits_and_adds_missing_rows(monkeypatch):
    class FakeScalarResult:
        def scalars(self) -> "FakeScalarResult":
            return self

        def all(self) -> list[object]:
            return []

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[object] = []
            self.committed = False

        async def execute(self, _stmt):
            return FakeScalarResult()

        def add(self, obj: object) -> None:
            self.added.append(obj)

        async def commit(self) -> None:
            self.committed = True

    fake_session = FakeSession()

    @asynccontextmanager
    async def fake_session_ctx():
        yield fake_session

    monkeypatch.setattr(chatwit_config, "session_ctx", fake_session_ctx)

    await save_chatwit_system_config(
        bot_token="bot-token-1",
        base_url="https://chatwit.example.com",
    )

    assert fake_session.committed is True
    assert len(fake_session.added) == 2
    assert {row.key for row in fake_session.added} == {"chatwit.agentBotToken", "chatwit.baseUrl"}
