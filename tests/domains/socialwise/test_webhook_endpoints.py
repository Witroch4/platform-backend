from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.socialwise.api.v1.endpoints import webhook, webhook_init
from domains.socialwise.services.flow.chatwit_config import ChatwitSystemConfigResult


def make_client() -> TestClient:
    app = FastAPI()
    app.include_router(webhook.router)
    app.include_router(webhook_init.router)
    return TestClient(app)


class AllowedGuards:
    @staticmethod
    def extract_nonce_from_request(_request) -> None:
        return None

    async def is_payload_duplicate(self, _payload: dict) -> bool:
        return False

    async def check_payload_rate_limit(self, _payload: dict, _request) -> SimpleNamespace:
        return SimpleNamespace(allowed=True)

    async def close(self) -> None:
        return None


def test_webhook_health_endpoint_contract() -> None:
    with make_client() as client:
        response = client.get("/api/integrations/webhooks/socialwiseflow")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "route": "socialwiseflow"}


def test_webhook_rejects_missing_bearer_when_token_is_configured(monkeypatch) -> None:
    monkeypatch.setattr(webhook.settings, "socialwiseflow_access_token", "cutover-token")

    with make_client() as client:
        response = client.post("/api/integrations/webhooks/socialwiseflow", content="{}")

    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_webhook_short_circuits_duplicate_payload(monkeypatch) -> None:
    class DuplicateGuards(AllowedGuards):
        async def is_payload_duplicate(self, _payload: dict) -> bool:
            return True

    monkeypatch.setattr(webhook.settings, "socialwiseflow_access_token", "")
    monkeypatch.setattr(webhook, "SocialwiseWebhookGuards", DuplicateGuards)

    payload = {
        "session_id": "5511999999999",
        "context": {
            "message": {
                "id": "message-1",
                "content": "Oi",
            },
            "inbox": {
                "id": 77,
                "account_id": 10,
            },
        },
    }

    with make_client() as client:
        response = client.post("/api/integrations/webhooks/socialwiseflow", json=payload)

    assert response.status_code == 200
    assert response.json() == {"ok": True, "dedup": True}


def test_webhook_handles_payment_confirmed_without_touching_nextjs(monkeypatch) -> None:
    async def fake_handle_payment_confirmed(payload: dict, trace_id: str) -> dict[str, object]:
        assert payload["event_type"] == "payment.confirmed"
        assert trace_id.startswith("sw-")
        return {"ok": True, "resume_triggered": True}

    monkeypatch.setattr(webhook.settings, "socialwiseflow_access_token", "")
    monkeypatch.setattr(webhook, "SocialwiseWebhookGuards", AllowedGuards)
    monkeypatch.setattr(webhook, "handle_payment_confirmed", fake_handle_payment_confirmed)

    payload = {
        "event_type": "payment.confirmed",
        "data": {
            "id": "pay_123",
        },
    }

    with make_client() as client:
        response = client.post("/api/integrations/webhooks/socialwiseflow", json=payload)

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "resume_triggered": True,
        "event": "payment.confirmed",
    }


def test_webhook_returns_sync_flow_response_for_flow_button(monkeypatch) -> None:
    class FakeOrchestrator:
        async def handle(self, flow_payload: dict, delivery_context) -> SimpleNamespace:
            assert flow_payload["session_id"] == "5511888777666"
            assert delivery_context.channel_type == "whatsapp"
            return SimpleNamespace(
                sync_response={"text": "Fluxo executado no FastAPI"},
                waiting_input=False,
                handled=True,
            )

    async def fake_mark_message_if_new(_key: str, _value: str, _ttl_seconds: int) -> bool:
        return True

    async def fake_get_chatwit_system_config() -> ChatwitSystemConfigResult:
        return ChatwitSystemConfigResult(bot_token="", base_url="")

    async def fake_record_history(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(webhook.settings, "socialwiseflow_access_token", "")
    monkeypatch.setattr(webhook, "SocialwiseWebhookGuards", AllowedGuards)
    monkeypatch.setattr(
        webhook,
        "detect_button_click",
        lambda _payload, _channel_type: SimpleNamespace(
            is_button_click=True,
            button_id="flow_demo",
        ),
    )
    monkeypatch.setattr(webhook, "is_flow_button", lambda button_id: button_id == "flow_demo")
    monkeypatch.setattr(webhook, "_mark_message_if_new", fake_mark_message_if_new)
    monkeypatch.setattr(webhook, "FlowOrchestrator", FakeOrchestrator)
    monkeypatch.setattr(webhook, "get_chatwit_system_config", fake_get_chatwit_system_config)
    monkeypatch.setattr(webhook, "record_history", fake_record_history)

    payload = {
        "session_id": "5511888777666",
        "channel_type": "Channel::WhatsApp",
        "context": {
            "message": {
                "content": "",
            },
        },
    }

    with make_client() as client:
        response = client.post("/api/integrations/webhooks/socialwiseflow", json=payload)

    assert response.status_code == 200
    assert response.json() == {"text": "Fluxo executado no FastAPI"}


def test_webhook_init_persists_chatwit_system_config(monkeypatch) -> None:
    captured: dict[str, str] = {}

    async def fake_save_chatwit_system_config(*, bot_token: str, base_url: str) -> None:
        captured["bot_token"] = bot_token
        captured["base_url"] = base_url

    monkeypatch.setattr(webhook_init.settings, "chatwit_webhook_secret", "init-secret")
    monkeypatch.setattr(webhook_init, "save_chatwit_system_config", fake_save_chatwit_system_config)

    with make_client() as client:
        response = client.post(
            "/api/integrations/webhooks/socialwiseflow/init",
            json={
                "agent_bot_token": "bot-token-123",
                "base_url": "https://chatwit.example.com",
                "secret": "init-secret",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert captured == {
        "bot_token": "bot-token-123",
        "base_url": "https://chatwit.example.com",
    }
