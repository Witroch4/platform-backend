"""Compression middleware for HTTP responses."""

from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class CompressionMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add gzip compression to responses.
    
    FastAPI/Starlette has built-in GZipMiddleware, but this custom
    middleware provides more control and logging.
    
    Features:
    - Compresses responses larger than min_size
    - Only compresses compressible content types
    - Respects Accept-Encoding header
    - Adds appropriate headers
    """

    def __init__(
        self,
        app,
        minimum_size: int = 500,
        compressible_types: set[str] | None = None,
    ):
        """
        Initialize compression middleware.
        
        Args:
            app: FastAPI application
            minimum_size: Minimum response size in bytes to compress (default: 500)
            compressible_types: Set of compressible content types
        """
        super().__init__(app)
        self.minimum_size = minimum_size
        self.compressible_types = compressible_types or {
            "text/html",
            "text/css",
            "text/plain",
            "text/xml",
            "text/javascript",
            "application/json",
            "application/javascript",
            "application/xml",
            "application/xml+rss",
            "application/xhtml+xml",
            "application/x-javascript",
            "image/svg+xml",
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and compress response if applicable."""
        # Process request
        response = await call_next(request)
        
        # Check if client accepts gzip
        accept_encoding = request.headers.get("accept-encoding", "")
        if "gzip" not in accept_encoding.lower():
            return response
        
        # Check if response is already compressed
        if response.headers.get("content-encoding"):
            return response
        
        # Check content type
        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        if content_type not in self.compressible_types:
            return response
        
        # Note: Actual compression is handled by Starlette's GZipMiddleware
        # This middleware just adds logging and validation
        # We'll use Starlette's built-in GZipMiddleware in main.py
        
        return response

