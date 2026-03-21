"""Rate limiting middleware using Redis for distributed counters."""

from hmac import compare_digest
import time

import redis.asyncio as redis
import structlog
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from platform_core.config import settings

logger = structlog.get_logger(__name__)


class RateLimitMiddleware:
    """
    Pure ASGI rate limiting middleware using Redis for distributed counters.

    Implements sliding window rate limiting with different limits per endpoint type:
    - General endpoints: 100 req/min
    - AI endpoints: 10 req/min

    Returns 429 Too Many Requests with Retry-After header when limit exceeded.
    """

    AI_ENDPOINTS = {
        "/api/v1/ai",
        "/api/v1/briefing",
        "/api/v1/translate",
        "/api/v1/leads/qualify",
        "/api/v1/clients/analyze",
    }

    EXCLUDED_PATHS = {
        "/health",
        "/health/live",
        "/health/ready",
        "/metrics",
        "/docs",
        "/redoc",
        "/openapi.json",
    }

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.redis: redis.Redis | None = None
        self._connected = False

    async def _connect_redis(self) -> None:
        """Connect to Redis if not already connected."""
        if self._connected and self.redis:
            return
        try:
            self.redis = redis.from_url(
                str(settings.redis_url),
                encoding="utf-8",
                decode_responses=True,
            )
            await self.redis.ping()
            self._connected = True
            logger.info("rate_limit_redis_connected")
        except Exception as e:
            logger.error("rate_limit_redis_connection_failed", error=str(e))
            self.redis = None
            self._connected = False

    def _get_rate_limit(self, path: str) -> int:
        for ai_path in self.AI_ENDPOINTS:
            if path.startswith(ai_path):
                return settings.rate_limit_ai_per_minute
        return settings.rate_limit_per_minute

    def _is_internal_pje_request(self, request: Request) -> bool:
        """Allow trusted scraper sync calls to bypass generic HTTP rate limiting.

        These endpoints are already protected by a shared internal API key and are
        called in bursts while persisting comarca sync progress.
        """
        if not settings.pje_internal_api_key:
            return False

        if not request.url.path.startswith(f"{settings.api_v1_prefix}/pje/"):
            return False

        internal_key = request.headers.get("x-internal-api-key")
        return bool(internal_key) and compare_digest(
            internal_key,
            settings.pje_internal_api_key,
        )

    def _get_client_identifier(self, request: Request) -> str:
        if hasattr(request.state, "user_id"):
            return f"user:{request.state.user_id}"
        if hasattr(request.state, "tenant_id"):
            return f"tenant:{request.state.tenant_id}"
        if request.client:
            return f"ip:{request.client.host}"
        return "unknown"

    def _make_redis_key(self, client_id: str, window: int) -> str:
        return f"jusmonitoria:ratelimit:{client_id}:{window}"

    async def _check_rate_limit(
        self, client_id: str, limit: int
    ) -> tuple[bool, int, int]:
        if not self._connected or not self.redis:
            logger.warning("rate_limit_redis_unavailable", client_id=client_id)
            return True, 0, 0

        try:
            current_time = int(time.time())
            current_window = current_time // 60
            key = self._make_redis_key(client_id, current_window)

            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, 120)

            if count > limit:
                retry_after = 60 - (current_time % 60)
                logger.warning(
                    "rate_limit_exceeded",
                    client_id=client_id,
                    count=count,
                    limit=limit,
                    retry_after=retry_after,
                )
                return False, count, retry_after

            return True, count, 0

        except Exception as e:
            logger.error("rate_limit_check_error", error=str(e), client_id=client_id)
            return True, 0, 0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Skip rate limiting if disabled
        if not settings.rate_limit_enabled:
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        # Skip excluded paths
        if request.url.path in self.EXCLUDED_PATHS:
            await self.app(scope, receive, send)
            return

        # Internal PJe sync uses its own shared-secret auth and may persist many
        # combos in a short burst during comarca collection.
        if self._is_internal_pje_request(request):
            await self.app(scope, receive, send)
            return

        await self._connect_redis()

        limit = self._get_rate_limit(request.url.path)
        client_id = self._get_client_identifier(request)
        allowed, current_count, retry_after = await self._check_rate_limit(
            client_id, limit
        )

        if not allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "limit": limit,
                    "current": current_count,
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + retry_after),
                },
            )
            await response(scope, receive, send)
            return

        # Wrap send to add rate limit headers
        async def send_with_rate_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-ratelimit-limit", str(limit).encode()))
                headers.append(
                    (b"x-ratelimit-remaining", str(max(0, limit - current_count)).encode())
                )
                headers.append(
                    (
                        b"x-ratelimit-reset",
                        str((int(time.time()) // 60 + 1) * 60).encode(),
                    )
                )
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_rate_headers)
