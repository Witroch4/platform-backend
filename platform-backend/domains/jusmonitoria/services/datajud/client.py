"""
DataJud API Client

Implements integration with DataJud API (CNJ) with:
- Certificate-based authentication
- Rate limiting (1 req/36s = 100 req/hour)
- Exponential backoff retry
- Timeout handling

Requirements: 2.4, 2.5, 11, 21
"""

import asyncio
import hashlib
import ssl
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from uuid import UUID

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from platform_core.config import settings


class DataJudRateLimitError(Exception):
    """Raised when rate limit is exceeded."""

    pass


class DataJudClient:
    """
    DataJud API Client with certificate authentication and rate limiting.

    Rate limit: 100 requests per hour (1 request every 36 seconds)
    Retry policy: Up to 3 retries with exponential backoff (2s, 4s, 8s)
    """

    def __init__(
        self,
        base_url: str,
        cert_path: Optional[str] = None,
        key_path: Optional[str] = None,
        timeout: float = 30.0,
    ):
        """
        Initialize DataJud client.

        Args:
            base_url: DataJud API base URL
            cert_path: Path to client certificate (.pem or .crt)
            key_path: Path to private key (.key)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.cert_path = cert_path
        self.key_path = key_path
        self.timeout = timeout

        # Rate limiting: 1 request per 36 seconds
        self.min_interval = 36.0
        self.last_request_time: Optional[datetime] = None
        self._lock = asyncio.Lock()

        # Create SSL context for certificate authentication
        self.ssl_context = self._create_ssl_context()

        # HTTP client with certificate
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            verify=self.ssl_context if self.ssl_context else True,
            cert=(cert_path, key_path) if cert_path and key_path else None,
        )

    def _create_ssl_context(self) -> Optional[ssl.SSLContext]:
        """Create SSL context for certificate authentication."""
        if not self.cert_path or not self.key_path:
            return None

        cert_file = Path(self.cert_path)
        key_file = Path(self.key_path)

        if not cert_file.exists() or not key_file.exists():
            raise FileNotFoundError(
                f"Certificate or key file not found: {cert_file}, {key_file}"
            )

        context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))

        return context

    async def _wait_for_rate_limit(self) -> None:
        """Wait if necessary to respect rate limit (1 req/36s)."""
        async with self._lock:
            if self.last_request_time is not None:
                elapsed = (datetime.utcnow() - self.last_request_time).total_seconds()
                wait_time = self.min_interval - elapsed

                if wait_time > 0:
                    await asyncio.sleep(wait_time)

            self.last_request_time = datetime.utcnow()

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        **kwargs,
    ) -> Dict:
        """
        Make HTTP request with rate limiting and retry.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            **kwargs: Additional arguments for httpx request

        Returns:
            Response JSON data

        Raises:
            DataJudRateLimitError: If rate limit is exceeded
            httpx.HTTPError: On HTTP errors after retries
        """
        # Wait for rate limit
        await self._wait_for_rate_limit()

        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        # Retry with exponential backoff
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=10),
            retry=retry_if_exception_type(
                (httpx.HTTPError, httpx.TimeoutException)
            ),
            reraise=True,
        ):
            with attempt:
                response = await self.client.request(method, url, **kwargs)

                # Handle rate limiting (429)
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After", "60")
                    raise DataJudRateLimitError(
                        f"Rate limit exceeded. Retry after {retry_after}s"
                    )

                response.raise_for_status()
                return response.json()

    async def search_cases(
        self,
        cnj_numbers: Optional[List[str]] = None,
        court: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, Dict]:
        """
        Search for cases in DataJud.

        Args:
            cnj_numbers: List of CNJ process numbers
            court: Court identifier (e.g., "TRT1", "TJSP")
            date_from: Start date for filtering
            date_to: End date for filtering

        Returns:
            Dictionary mapping CNJ number to case data
        """
        payload = {}

        if cnj_numbers:
            payload["numerosCnj"] = cnj_numbers

        if court:
            payload["tribunal"] = court

        if date_from:
            payload["dataInicio"] = date_from.isoformat()

        if date_to:
            payload["dataFim"] = date_to.isoformat()

        response = await self._make_request(
            "POST",
            "/processos/consulta",
            json=payload,
        )

        # Transform response to dict keyed by CNJ number
        cases = {}
        for case_data in response.get("processos", []):
            cnj = case_data.get("numeroCnj")
            if cnj:
                cases[cnj] = case_data

        return cases

    async def get_movements(
        self,
        cnj_numbers: List[str],
        date_from: Optional[datetime] = None,
    ) -> Dict[str, List[Dict]]:
        """
        Get movements for multiple processes.

        Args:
            cnj_numbers: List of CNJ process numbers (max 100)
            date_from: Only return movements after this date

        Returns:
            Dictionary mapping CNJ number to list of movements

        Raises:
            ValueError: If more than 100 CNJ numbers provided
        """
        if len(cnj_numbers) > 100:
            raise ValueError(
                f"Maximum 100 CNJ numbers allowed, got {len(cnj_numbers)}"
            )

        payload = {
            "numerosCnj": cnj_numbers,
        }

        if date_from:
            payload["dataInicio"] = date_from.isoformat()

        response = await self._make_request(
            "POST",
            "/processos/movimentacoes",
            json=payload,
        )

        # Transform response to dict keyed by CNJ number
        movements_by_cnj = {}
        for process_data in response.get("processos", []):
            cnj = process_data.get("numeroCnj")
            movements = process_data.get("movimentacoes", [])

            if cnj:
                movements_by_cnj[cnj] = movements

        return movements_by_cnj

    async def get_case_details(self, cnj_number: str) -> Dict:
        """
        Get detailed information for a single case.

        Args:
            cnj_number: CNJ process number

        Returns:
            Case details including parties, movements, etc.
        """
        response = await self._make_request(
            "GET",
            f"/processos/{cnj_number}",
        )

        return response

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()


def create_datajud_client() -> DataJudClient:
    """
    Factory function to create DataJud client from settings.

    Returns:
        Configured DataJudClient instance
    """
    return DataJudClient(
        base_url=settings.DATAJUD_API_URL,
        cert_path=settings.DATAJUD_CERT_PATH,
        key_path=settings.DATAJUD_KEY_PATH,
        timeout=30.0,
    )
