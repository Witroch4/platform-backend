"""Chatwit API client with rate limiting and retry logic."""

import asyncio
from datetime import datetime, timedelta
from typing import Any

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from platform_core.config import settings

logger = structlog.get_logger(__name__)


class ChatwitRateLimitError(Exception):
    """Raised when rate limit is exceeded."""
    
    pass


class ChatwitAPIError(Exception):
    """Raised when Chatwit API returns an error."""
    
    pass


class ChatwitRateLimiter:
    """
    Rate limiter for Chatwit API.
    
    Implements token bucket algorithm to limit requests to 100/minute.
    """
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        """
        Initialize rate limiter.
        
        Args:
            max_requests: Maximum requests per window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: list[datetime] = []
        self._lock = asyncio.Lock()
    
    async def acquire(self) -> None:
        """
        Acquire permission to make a request.
        
        Blocks if rate limit would be exceeded.
        
        Raises:
            ChatwitRateLimitError: If rate limit is exceeded
        """
        async with self._lock:
            now = datetime.utcnow()
            cutoff = now - timedelta(seconds=self.window_seconds)
            
            # Remove old requests outside the window
            self.requests = [req for req in self.requests if req > cutoff]
            
            # Check if we can make a request
            if len(self.requests) >= self.max_requests:
                # Calculate wait time
                oldest_request = self.requests[0]
                wait_seconds = (oldest_request - cutoff).total_seconds()
                
                logger.warning(
                    "chatwit_rate_limit_reached",
                    requests_in_window=len(self.requests),
                    wait_seconds=wait_seconds,
                )
                
                # Wait until we can make a request
                await asyncio.sleep(wait_seconds + 0.1)
                
                # Retry acquire
                return await self.acquire()
            
            # Record this request
            self.requests.append(now)
    
    def get_remaining_quota(self) -> int:
        """
        Get remaining requests in current window.
        
        Returns:
            Number of remaining requests
        """
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=self.window_seconds)
        
        # Count requests in current window
        recent_requests = [req for req in self.requests if req > cutoff]
        
        return max(0, self.max_requests - len(recent_requests))


class ChatwitClient:
    """
    Chatwit API client with rate limiting and retry logic.
    
    Features:
    - Rate limiting: 100 requests/minute
    - Exponential backoff retry
    - 30s timeout
    - Structured logging
    """
    
    def __init__(
        self,
        api_url: str | None = None,
        api_key: str | None = None,
        rate_limit_per_minute: int | None = None,
        timeout_seconds: float = 30.0,
    ):
        """
        Initialize Chatwit client.
        
        Args:
            api_url: Chatwit API base URL (defaults to settings)
            api_key: Chatwit API key (defaults to settings)
            rate_limit_per_minute: Rate limit (defaults to settings)
            timeout_seconds: Request timeout in seconds
        """
        self.api_url = api_url or settings.chatwit_api_url
        self.api_key = api_key or settings.chatwit_api_key
        self.timeout = timeout_seconds
        
        # Initialize rate limiter
        rate_limit = rate_limit_per_minute or settings.chatwit_rate_limit_per_minute
        self.rate_limiter = ChatwitRateLimiter(max_requests=rate_limit, window_seconds=60)
        
        # Initialize HTTP client
        self.client = httpx.AsyncClient(
            base_url=self.api_url,
            timeout=self.timeout,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        
        logger.info(
            "chatwit_client_initialized",
            api_url=self.api_url,
            rate_limit=rate_limit,
            timeout=timeout_seconds,
        )

    @classmethod
    async def for_tenant(cls, tenant_id, session) -> "ChatwitClient":
        """Create a ChatwitClient authenticated with the tenant's own ACCESS_TOKEN.

        This ensures outbound API calls (send_message, update_contact, etc.)
        use the correct tenant's credentials for multi-tenant isolation.
        """
        from domains.jusmonitoria.crypto import decrypt
        from domains.jusmonitoria.db.models.tenant import Tenant

        tenant = await session.get(Tenant, tenant_id)
        if not tenant or not tenant.chatwit_access_token_encrypted:
            raise ChatwitAPIError(
                "Tenant não possui integração Chatwit configurada"
            )

        token = decrypt(tenant.chatwit_access_token_encrypted)
        base_url = (tenant.settings or {}).get(
            "chatwit_base_url", "https://chatwit.witdev.com.br"
        )

        return cls(
            api_url=f"{base_url}/api/v1",
            api_key=token,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Make HTTP request with rate limiting and retry.
        
        Args:
            method: HTTP method
            endpoint: API endpoint
            **kwargs: Additional request parameters
            
        Returns:
            Response JSON
            
        Raises:
            ChatwitRateLimitError: If rate limit is exceeded
            ChatwitAPIError: If API returns an error
            httpx.HTTPError: If request fails
        """
        # Acquire rate limit permission
        await self.rate_limiter.acquire()
        
        # Make request
        try:
            response = await self.client.request(method, endpoint, **kwargs)
            response.raise_for_status()
            
            logger.info(
                "chatwit_request_success",
                method=method,
                endpoint=endpoint,
                status_code=response.status_code,
                remaining_quota=self.rate_limiter.get_remaining_quota(),
            )
            
            return response.json()
        
        except httpx.HTTPStatusError as e:
            logger.error(
                "chatwit_request_failed",
                method=method,
                endpoint=endpoint,
                status_code=e.response.status_code,
                error=str(e),
            )
            
            if e.response.status_code == 429:
                raise ChatwitRateLimitError("Chatwit API rate limit exceeded") from e
            
            raise ChatwitAPIError(f"Chatwit API error: {e}") from e
        
        except httpx.TimeoutException as e:
            logger.error(
                "chatwit_request_timeout",
                method=method,
                endpoint=endpoint,
                timeout=self.timeout,
            )
            raise
    
    async def send_message(
        self,
        contact_id: str,
        message: str,
        channel: str = "whatsapp",
    ) -> dict[str, Any]:
        """
        Send message to contact via Chatwit.
        
        Args:
            contact_id: Chatwit contact ID
            message: Message content
            channel: Channel to send message (default: whatsapp)
            
        Returns:
            Response with message_id and status
            
        Raises:
            ChatwitAPIError: If API returns an error
        """
        payload = {
            "contact_id": contact_id,
            "channel": channel,
            "content": message,
        }
        
        logger.info(
            "chatwit_sending_message",
            contact_id=contact_id,
            channel=channel,
            message_length=len(message),
        )
        
        response = await self._request("POST", "/messages", json=payload)
        
        logger.info(
            "chatwit_message_sent",
            contact_id=contact_id,
            message_id=response.get("message_id"),
        )
        
        return response
    
    async def add_tag(
        self,
        contact_id: str,
        tag: str,
    ) -> dict[str, Any]:
        """
        Add tag to contact.
        
        Args:
            contact_id: Chatwit contact ID
            tag: Tag name to add
            
        Returns:
            Response with status
            
        Raises:
            ChatwitAPIError: If API returns an error
        """
        payload = {"tag": tag}
        
        logger.info(
            "chatwit_adding_tag",
            contact_id=contact_id,
            tag=tag,
        )
        
        response = await self._request(
            "POST",
            f"/contacts/{contact_id}/tags",
            json=payload,
        )
        
        logger.info(
            "chatwit_tag_added",
            contact_id=contact_id,
            tag=tag,
        )
        
        return response
    
    async def remove_tag(
        self,
        contact_id: str,
        tag: str,
    ) -> dict[str, Any]:
        """
        Remove tag from contact.
        
        Args:
            contact_id: Chatwit contact ID
            tag: Tag name to remove
            
        Returns:
            Response with status
            
        Raises:
            ChatwitAPIError: If API returns an error
        """
        logger.info(
            "chatwit_removing_tag",
            contact_id=contact_id,
            tag=tag,
        )
        
        response = await self._request(
            "DELETE",
            f"/contacts/{contact_id}/tags/{tag}",
        )
        
        logger.info(
            "chatwit_tag_removed",
            contact_id=contact_id,
            tag=tag,
        )
        
        return response
    
    async def get_contact(
        self,
        contact_id: str,
    ) -> dict[str, Any]:
        """
        Get contact information.
        
        Args:
            contact_id: Chatwit contact ID
            
        Returns:
            Contact information
            
        Raises:
            ChatwitAPIError: If API returns an error
        """
        logger.info(
            "chatwit_getting_contact",
            contact_id=contact_id,
        )
        
        response = await self._request("GET", f"/contacts/{contact_id}")
        
        return response
    
    async def get_active_tags(self) -> list[str]:
        """
        Get list of active tags from Chatwit.
        
        Returns:
            List of tag names
            
        Raises:
            ChatwitAPIError: If API returns an error
        """
        logger.info("chatwit_getting_active_tags")
        
        response = await self._request("GET", "/tags")
        
        tags = response.get("tags", [])
        
        logger.info(
            "chatwit_active_tags_retrieved",
            tag_count=len(tags),
        )
        
        return tags

    async def update_contact(
        self,
        contact_id: str,
        **fields: Any,
    ) -> dict[str, Any]:
        """
        Update contact fields via Chatwit API.

        Args:
            contact_id: Chatwit contact ID
            **fields: Fields to update (e.g. identifier="jm_lead_xxx")

        Returns:
            Updated contact data
        """
        logger.info(
            "chatwit_updating_contact",
            contact_id=contact_id,
            fields=list(fields.keys()),
        )

        response = await self._request(
            "PATCH",
            f"/contacts/{contact_id}",
            json=fields,
        )

        logger.info(
            "chatwit_contact_updated",
            contact_id=contact_id,
        )

        return response


# Global client instance (lazy initialized)
_client: ChatwitClient | None = None


def get_chatwit_client() -> ChatwitClient:
    """
    Get global Chatwit client instance.

    Returns:
        ChatwitClient instance
    """
    global _client

    if _client is None:
        _client = ChatwitClient()

    return _client


async def sync_identifier_to_chatwit(
    entity_id: str,
    chatwit_contact_id: str,
    metadata: dict[str, Any],
    entity_type: str = "lead",
) -> str | None:
    """
    Set identifier on Chatwit contact for bidirectional link.

    Uses Agent Bot token from metadata to PATCH the contact.
    Convention: jm_{type}_{id} (e.g. jm_lead_uuid, jm_client_uuid)

    Args:
        entity_id: Lead or Client UUID as string
        chatwit_contact_id: Chatwit contact ID
        metadata: Event metadata with chatwit_base_url, account_id, chatwit_agent_bot_token
        entity_type: "lead" or "client"

    Returns:
        The identifier string set, or None on failure
    """
    base_url = metadata.get("chatwit_base_url", "")
    account_id = metadata.get("account_id")
    bot_token = metadata.get("chatwit_agent_bot_token", "")

    # Debug: log token info (masked) for troubleshooting 401s
    token_preview = f"{bot_token[:6]}...{bot_token[-4:]}" if len(bot_token) > 10 else f"<short:{len(bot_token)}>"
    logger.info(
        "sync_identifier_attempt",
        chatwit_contact_id=chatwit_contact_id,
        base_url=base_url,
        account_id=account_id,
        token_preview=token_preview,
    )

    if not base_url or not bot_token or not account_id:
        logger.warning(
            "sync_identifier_missing_metadata",
            chatwit_contact_id=chatwit_contact_id,
            has_base_url=bool(base_url),
            has_bot_token=bool(bot_token),
            has_account_id=bool(account_id),
        )
        return None

    identifier = f"jm_{entity_type}_{entity_id}"
    url = f"{base_url}/api/v1/accounts/{account_id}/contacts/{chatwit_contact_id}"
    headers = {"api_access_token": bot_token, "Content-Type": "application/json"}
    payload = {"identifier": identifier}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.patch(url, json=payload, headers=headers)
            response.raise_for_status()

        logger.info(
            "sync_identifier_success",
            chatwit_contact_id=chatwit_contact_id,
            identifier=identifier,
        )
        return identifier

    except Exception as e:
        logger.warning(
            "sync_identifier_failed",
            chatwit_contact_id=chatwit_contact_id,
            identifier=identifier,
            error=str(e),
        )
        return None
