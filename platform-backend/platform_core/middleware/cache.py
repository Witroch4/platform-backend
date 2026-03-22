"""Cache middleware for HTTP responses with Cache-Control and ETag support."""

import hashlib

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class CacheMiddleware:
    """
    Pure ASGI middleware to add Cache-Control headers and ETag support.
    """

    def __init__(
        self,
        app: ASGIApp,
        default_max_age: int = 0,
        static_max_age: int = 86400,
        api_max_age: int = 60,
    ) -> None:
        self.app = app
        self.default_max_age = default_max_age
        self.static_max_age = static_max_age
        self.api_max_age = api_max_age

    def _get_cache_control(self, path: str, method: str) -> str:
        if method != "GET":
            return "no-store, no-cache, must-revalidate"

        if any(path.startswith(p) for p in ("/docs", "/redoc", "/openapi.json")):
            return f"public, max-age={self.static_max_age}"

        if path in ("/health", "/health/live", "/health/ready", "/metrics"):
            return "public, max-age=10"

        if path.startswith("/api/"):
            if any(s in path for s in ("/dashboard", "/metrics", "/stats")):
                return f"private, max-age={self.api_max_age}, must-revalidate"
            return "private, max-age=0, must-revalidate"

        return "no-store, no-cache, must-revalidate"

    def _should_generate_etag(self, path: str, status_code: int) -> bool:
        if status_code != 200:
            return False
        if any(path.startswith(p) for p in ("/docs", "/redoc", "/openapi.json")):
            return True
        if any(s in path for s in ("/dashboard", "/metrics", "/stats")):
            return True
        return False

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        path = request.url.path
        method = scope.get("method", "GET")
        if_none_match = request.headers.get("if-none-match")
        cache_control = self._get_cache_control(path, method)

        # For responses that don't need ETag, just inject Cache-Control header
        if not self._should_generate_etag(path, 200):
            async def send_with_cache(message: Message) -> None:
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    headers.append((b"cache-control", cache_control.encode()))
                    headers.append((b"vary", b"Accept-Encoding"))
                    message = {**message, "headers": headers}
                await send(message)

            await self.app(scope, receive, send_with_cache)
            return

        # For ETag responses, we need to buffer the body
        response_started = False
        initial_message: Message | None = None
        body_chunks: list[bytes] = []

        async def buffering_send(message: Message) -> None:
            nonlocal response_started, initial_message
            if message["type"] == "http.response.start":
                initial_message = message
                response_started = True
            elif message["type"] == "http.response.body":
                body_chunks.append(message.get("body", b""))

        await self.app(scope, receive, buffering_send)

        if not initial_message:
            return

        status_code = initial_message.get("status", 200)
        body = b"".join(body_chunks)

        if self._should_generate_etag(path, status_code):
            etag = f'"{hashlib.md5(body).hexdigest()}"'

            if if_none_match and if_none_match == etag:
                logger.debug("etag_match", path=path, etag=etag)
                response = Response(
                    status_code=304,
                    headers={
                        "Cache-Control": cache_control,
                        "ETag": etag,
                        "Vary": "Accept-Encoding",
                    },
                )
                await response(scope, receive, send)
                return

            headers = list(initial_message.get("headers", []))
            headers.append((b"cache-control", cache_control.encode()))
            headers.append((b"vary", b"Accept-Encoding"))
            headers.append((b"etag", etag.encode()))
            initial_message = {**initial_message, "headers": headers}

        await send(initial_message)
        await send({"type": "http.response.body", "body": body})
