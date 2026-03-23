"""Redis-backed guards for Socialwise webhook idempotency, replay, and rate limiting."""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from random import random
from typing import Literal

from fastapi import Request
from redis.asyncio import Redis

from platform_core.config import settings

NONCE_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")
RATE_LIMIT_PATTERN = re.compile(r"^(\d+)\/(\d+)s?$")


@dataclass(slots=True)
class SocialwiseIdempotencyKey:
    session_id: str
    account_id: str
    inbox_id: str
    wamid: str | None = None
    message_id: str | None = None

    @property
    def redis_key(self) -> str:
        identifier = self.wamid or self.message_id or self.session_id
        return f"sw:idem:{self.account_id}:{self.inbox_id}:{identifier}"


@dataclass(slots=True)
class SocialwiseRateLimitContext:
    account_id: str
    inbox_id: str
    session_id: str
    client_ip: str | None = None

    @property
    def contact_id(self) -> str:
        return f"{self.inbox_id}:{self.session_id}"


@dataclass(slots=True)
class RateLimitWindow:
    limit: int
    window: int


@dataclass(slots=True)
class RateLimitResult:
    allowed: bool
    scope: Literal["conversation", "account", "contact", "ip"]
    limit: int
    remaining: int
    reset_time: int


class SocialwiseWebhookGuards:
    def __init__(self) -> None:
        self.redis = Redis.from_url(str(settings.redis_url), decode_responses=True)

    async def close(self) -> None:
        await self.redis.aclose()

    def extract_idempotency_key(self, payload: dict) -> SocialwiseIdempotencyKey:
        root_context = payload.get("context") or {}
        context = root_context.get("socialwise-chatwit") or {}
        message = root_context.get("message") or {}
        return SocialwiseIdempotencyKey(
            session_id=str(
                payload.get("session_id")
                or (root_context.get("contact") or {}).get("phone_number")
                or "unknown-session"
            ),
            account_id=str(
                self._nested_get(context, "account_data", "id")
                or (root_context.get("inbox") or {}).get("account_id")
                or 0
            ),
            inbox_id=str(
                self._nested_get(context, "inbox_data", "id")
                or (root_context.get("inbox") or {}).get("id")
                or 0
            ),
            wamid=str(message.get("source_id") or self._nested_get(context, "wamid")) if (message.get("source_id") or self._nested_get(context, "wamid")) else None,
            message_id=str(message.get("id") or self._nested_get(context, "message_data", "id")) if (message.get("id") or self._nested_get(context, "message_data", "id")) else None,
        )

    async def is_payload_duplicate(self, payload: dict, ttl_seconds: int = 24 * 60 * 60) -> bool:
        key = self.extract_idempotency_key(payload).redis_key
        try:
            result = await self.redis.set(key, "1", ex=ttl_seconds, nx=True)
            return result is None
        except Exception:
            return False

    def extract_rate_limit_context(self, payload: dict, request: Request) -> SocialwiseRateLimitContext:
        root_context = payload.get("context") or {}
        context = root_context.get("socialwise-chatwit") or {}
        inbox = root_context.get("inbox") or {}
        forwarded_for = request.headers.get("x-forwarded-for")
        client_ip = (
            (forwarded_for.split(",")[0].strip() if forwarded_for else None)
            or request.headers.get("x-real-ip")
            or request.headers.get("cf-connecting-ip")
            or (request.client.host if request.client else None)
        )
        return SocialwiseRateLimitContext(
            account_id=str(self._nested_get(context, "account_data", "id") or inbox.get("account_id") or 0),
            inbox_id=str(self._nested_get(context, "inbox_data", "id") or inbox.get("id") or 0),
            session_id=str(payload.get("session_id") or (root_context.get("contact") or {}).get("phone_number") or "unknown-session"),
            client_ip=client_ip,
        )

    async def check_payload_rate_limit(self, payload: dict, request: Request) -> RateLimitResult:
        context = self.extract_rate_limit_context(payload, request)
        windows = self._load_rate_limit_windows()

        conversation_result = await self._check_scope_limit("conversation", context.session_id, windows["conversation"])
        if not conversation_result.allowed:
            return conversation_result

        contact_result = await self._check_scope_limit("contact", context.contact_id, windows["contact"])
        if not contact_result.allowed:
            return contact_result

        account_result = await self._check_scope_limit("account", context.account_id, windows["account"])
        if not account_result.allowed:
            return account_result

        if context.client_ip:
            ip_result = await self._check_scope_limit("ip", context.client_ip, RateLimitWindow(limit=60, window=10))
            if not ip_result.allowed:
                return ip_result

        return conversation_result

    async def check_and_mark_nonce(self, nonce: str, ttl_seconds: int = 300) -> tuple[bool, str | None]:
        error = self.validate_nonce(nonce)
        if error:
            return False, error

        try:
            result = await self.redis.set(f"sw:nonce:{nonce}", "1", ex=ttl_seconds, nx=True)
            if result is None:
                return False, "Replay detected: nonce already used"
            return True, None
        except Exception:
            return True, None

    @staticmethod
    def extract_nonce_from_request(request: Request) -> str | None:
        header_nonce = request.headers.get("x-nonce")
        if header_nonce:
            return header_nonce.strip()
        query_nonce = request.query_params.get("nonce")
        return query_nonce.strip() if query_nonce else None

    @staticmethod
    def validate_nonce(nonce: str) -> str | None:
        if len(nonce) < 16:
            return "Nonce must be at least 16 characters"
        if len(nonce) > 128:
            return "Nonce too long"
        if not NONCE_PATTERN.match(nonce):
            return "Nonce contains invalid characters"
        return None

    @staticmethod
    def _load_rate_limit_windows() -> dict[str, RateLimitWindow]:
        return {
            "conversation": SocialwiseWebhookGuards._parse_window(os.getenv("RL_CONV"), "8/10"),
            "account": SocialwiseWebhookGuards._parse_window(os.getenv("RL_ACC"), "80/10"),
            "contact": SocialwiseWebhookGuards._parse_window(os.getenv("RL_CONTACT"), "15/10"),
        }

    @staticmethod
    def _parse_window(raw_value: str | None, default_value: str) -> RateLimitWindow:
        value = raw_value or default_value
        match = RATE_LIMIT_PATTERN.match(value)
        if not match:
            raise ValueError(f"Invalid rate limit format: {value}")
        return RateLimitWindow(limit=int(match.group(1)), window=int(match.group(2)))

    async def _check_scope_limit(
        self,
        scope: Literal["conversation", "account", "contact", "ip"],
        identifier: str,
        window: RateLimitWindow,
    ) -> RateLimitResult:
        key = f"rl:{scope}:{identifier}"
        now = int(time.time() * 1000)
        window_start = now - window.window * 1000

        try:
            pipeline = self.redis.pipeline()
            pipeline.zremrangebyscore(key, "-inf", window_start)
            pipeline.zcard(key)
            pipeline.zadd(key, {f"{now}-{random()}": now})
            pipeline.expire(key, window.window)
            results = await pipeline.execute()

            current_count = int(results[1] or 0)
            allowed = current_count < window.limit
            remaining = max(0, window.limit - current_count - 1)

            return RateLimitResult(
                allowed=allowed,
                scope=scope,
                limit=window.limit,
                remaining=remaining,
                reset_time=now + window.window * 1000,
            )
        except Exception:
            return RateLimitResult(
                allowed=True,
                scope=scope,
                limit=window.limit,
                remaining=max(0, window.limit - 1),
                reset_time=now + window.window * 1000,
            )

    @staticmethod
    def _nested_get(payload: dict, *path: str) -> str | int | None:
        current = payload
        for part in path:
            if not isinstance(current, dict):
                return None
            current = current.get(part)
        return current
