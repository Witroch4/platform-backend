"""Security middleware for headers and input validation."""

import json
import re

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# Maximum payload size in bytes (10MB default)
MAX_PAYLOAD_SIZE = 10 * 1024 * 1024

# XSS patterns to detect
XSS_PATTERNS = [
    re.compile(r"<script[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),  # Event handlers like onclick=
    re.compile(r"<iframe[^>]*>", re.IGNORECASE),
    re.compile(r"<object[^>]*>", re.IGNORECASE),
    re.compile(r"<embed[^>]*>", re.IGNORECASE),
]

# SQL injection patterns to detect
SQL_INJECTION_PATTERNS = [
    re.compile(r"(\bUNION\b.*\bSELECT\b)", re.IGNORECASE),
    re.compile(r"(\bSELECT\b.*\bFROM\b.*\bWHERE\b)", re.IGNORECASE),
    re.compile(r"(\bINSERT\b.*\bINTO\b.*\bVALUES\b)", re.IGNORECASE),
    re.compile(r"(\bUPDATE\b.*\bSET\b)", re.IGNORECASE),
    re.compile(r"(\bDELETE\b.*\bFROM\b)", re.IGNORECASE),
    re.compile(r"(\bDROP\b.*\bTABLE\b)", re.IGNORECASE),
    re.compile(r"(--|#|/\*|\*/)", re.IGNORECASE),  # SQL comments
    re.compile(r"(\bOR\b\s+['\"]?\d+['\"]?\s*=\s*['\"]?\d+['\"]?)", re.IGNORECASE),
    re.compile(r"(\bAND\b\s+['\"]?\d+['\"]?\s*=\s*['\"]?\d+['\"]?)", re.IGNORECASE),
]


def detect_xss(text: str) -> bool:
    """Detect potential XSS attacks in text."""
    if not isinstance(text, str):
        return False
    for pattern in XSS_PATTERNS:
        if pattern.search(text):
            return True
    return False


def detect_sql_injection(text: str) -> bool:
    """Detect potential SQL injection attacks in text."""
    if not isinstance(text, str):
        return False
    for pattern in SQL_INJECTION_PATTERNS:
        if pattern.search(text):
            return True
    return False


def sanitize_input(data: dict | list | str) -> dict | list | str:
    """
    Recursively check input data for XSS and SQL injection.

    Raises ValueError if malicious pattern detected.
    """
    if isinstance(data, dict):
        for key, value in data.items():
            # Skip checking password fields as they often contain special characters
            if key.lower() in ("password", "password_confirm", "new_password", "old_password"):
                logger.debug("Skipping security sanitization for password field", extra={"field": key})
                continue
            sanitize_input(value)
    elif isinstance(data, list):
        for item in data:
            sanitize_input(item)
    elif isinstance(data, str):
        if detect_xss(data):
            raise ValueError("Potential XSS attack detected in input")
        if detect_sql_injection(data):
            raise ValueError("Potential SQL injection detected in input")
    return data


def _build_security_headers() -> dict[str, str]:
    """Build security response headers."""
    headers: dict[str, str] = {}

    # Content Security Policy
    csp_directives = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
    if settings.is_development:
        csp_directives.append("connect-src 'self' ws://localhost:* http://localhost:*")
    headers["content-security-policy"] = "; ".join(csp_directives)

    if settings.is_production:
        headers["strict-transport-security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

    headers["x-content-type-options"] = "nosniff"
    headers["x-frame-options"] = "DENY"
    headers["x-xss-protection"] = "1; mode=block"
    headers["referrer-policy"] = "strict-origin-when-cross-origin"

    permissions_policy = [
        "geolocation=()",
        "microphone=()",
        "camera=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "gyroscope=()",
        "accelerometer=()",
    ]
    headers["permissions-policy"] = ", ".join(permissions_policy)

    return headers


# Pre-compute security headers once at import time
_SECURITY_HEADERS = _build_security_headers()


class SecurityHeadersMiddleware:
    """
    Pure ASGI middleware for security headers and input validation.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        method = scope.get("method", "GET")

        # Validate payload size
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > MAX_PAYLOAD_SIZE:
                    logger.warning(
                        "payload_too_large",
                        size=size,
                        max_size=MAX_PAYLOAD_SIZE,
                        path=request.url.path,
                        client_ip=request.client.host if request.client else None,
                    )
                    response = JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Payload too large. Maximum size is {MAX_PAYLOAD_SIZE} bytes"
                        },
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        # Skip input sanitization for trusted webhook endpoints (Chatwit, etc.)
        # These receive data from internal partner systems, not end users.
        # SQLAlchemy parameterized queries prevent SQL injection regardless.
        path = request.url.path
        _WEBHOOK_EXEMPT_PREFIXES = (
            "/api/v1/integrations/chatwit",
            "/api/v1/webhooks",
        )
        skip_sanitization = any(path.startswith(p) for p in _WEBHOOK_EXEMPT_PREFIXES)

        # Validate input for XSS and SQL injection (JSON payloads on write methods)
        if method in ("POST", "PUT", "PATCH") and not skip_sanitization:
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = await request.body()
                    if body:
                        try:
                            data = json.loads(body)
                            sanitize_input(data)
                        except json.JSONDecodeError:
                            pass
                        except ValueError as e:
                            logger.warning(
                                "malicious_input_detected",
                                error=str(e),
                                path=request.url.path,
                                method=method,
                                client_ip=request.client.host if request.client else None,
                            )
                            response = JSONResponse(
                                status_code=400,
                                content={"detail": str(e)},
                            )
                            await response(scope, receive, send)
                            return

                    # Replace receive so downstream can re-read the body
                    body_consumed = body

                    async def new_receive() -> Message:
                        return {"type": "http.request", "body": body_consumed}

                    receive = new_receive

                except Exception as e:
                    logger.error(
                        "security_validation_error",
                        error=str(e),
                        error_type=type(e).__name__,
                    )

        # Wrap send to inject security headers into response
        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                for key, value in _SECURITY_HEADERS.items():
                    headers.append((key.encode(), value.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
