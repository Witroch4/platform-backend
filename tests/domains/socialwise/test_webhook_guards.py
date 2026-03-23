from fastapi import Request

from domains.socialwise.services.webhook_guards import SocialwiseWebhookGuards


def make_request(path: str = "/api/integrations/webhooks/socialwiseflow", headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def test_validate_nonce_rejects_short_values() -> None:
    assert SocialwiseWebhookGuards.validate_nonce("short") == "Nonce must be at least 16 characters"


def test_validate_nonce_rejects_invalid_characters() -> None:
    assert SocialwiseWebhookGuards.validate_nonce("nonce_invalido_123!") == "Nonce contains invalid characters"


def test_extract_idempotency_key_prefers_wamid() -> None:
    guards = SocialwiseWebhookGuards()
    payload = {
        "session_id": "5511999999999",
        "context": {
            "message": {
                "id": 987,
                "source_id": "wamid.abc123",
            },
            "inbox": {
                "id": 77,
                "account_id": 10,
            },
        },
    }

    key = guards.extract_idempotency_key(payload)

    assert key.account_id == "10"
    assert key.inbox_id == "77"
    assert key.wamid == "wamid.abc123"
    assert key.message_id == "987"
    assert key.redis_key == "sw:idem:10:77:wamid.abc123"


def test_extract_rate_limit_context_uses_forwarded_ip() -> None:
    guards = SocialwiseWebhookGuards()
    request = make_request(headers={"x-forwarded-for": "203.0.113.10, 10.0.0.1"})
    payload = {
        "session_id": "sess-1",
        "context": {
            "inbox": {
                "id": 20,
                "account_id": 30,
            },
        },
    }

    context = guards.extract_rate_limit_context(payload, request)

    assert context.account_id == "30"
    assert context.inbox_id == "20"
    assert context.session_id == "sess-1"
    assert context.client_ip == "203.0.113.10"


def test_extract_nonce_from_header() -> None:
    request = make_request(headers={"x-nonce": "nonce_value_123456"})
    assert SocialwiseWebhookGuards.extract_nonce_from_request(request) == "nonce_value_123456"
