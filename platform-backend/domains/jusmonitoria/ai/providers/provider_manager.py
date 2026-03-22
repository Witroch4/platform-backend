"""Dynamic AI provider management system."""

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.providers.litellm_config import LLMResponse, litellm_config
from domains.jusmonitoria.db.models.ai_provider import AIProvider
from domains.jusmonitoria.db.repositories.ai_provider_repository import AIProviderRepository

logger = logging.getLogger(__name__)


class ProviderManager:
    """
    Manages dynamic AI provider selection and routing.
    
    Loads provider configuration from database and handles:
    - Provider selection by priority and availability
    - Real-time rate limit updates
    - Fallback routing
    - Usage tracking
    """
    
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ):
        """
        Initialize provider manager.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for provider isolation
        """
        self.session = session
        self.tenant_id = tenant_id
        self.repository = AIProviderRepository(session, tenant_id)
    
    async def get_available_providers(self) -> list[AIProvider]:
        """
        Get all available providers for the tenant.
        
        Returns providers ordered by priority (highest first).
        
        Returns:
            List of active AIProvider instances
        """
        providers = await self.repository.get_active_providers(
            order_by_priority=True
        )
        
        if not providers:
            logger.warning(
                "No active AI providers configured for tenant",
                extra={"tenant_id": str(self.tenant_id)},
            )
        
        return providers
    
    async def call_llm(
        self,
        messages: list[dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        use_case: str = "default",  # "default" | "document" | "daily"
        **kwargs: Any,
    ) -> LLMResponse:
        """
        Call LLM with automatic provider selection and fallback.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Override temperature
            max_tokens: Override max tokens
            use_case: Chain de providers — "default" (geral), "document" (petições/docs),
                      "daily" (DataJud poller / briefing matinal)
            **kwargs: Additional parameters for LiteLLM

        Returns:
            LLMResponse with content and token usage metadata

        Raises:
            Exception: If all providers fail
        """
        # Get available providers from database
        providers = await self.get_available_providers()
        
        # Se não há providers no BD, litellm_config usará as chains de env vars
        # conforme o use_case ("default", "document" ou "daily")
        if not providers:
            logger.warning(
                "No DB providers configured for tenant, using env-based chain",
                extra={"tenant_id": str(self.tenant_id), "use_case": use_case},
            )
        
        # Call with fallback
        try:
            response = await litellm_config.call_with_fallback(
                messages=messages,
                providers=providers if providers else None,
                temperature=temperature,
                max_tokens=max_tokens,
                use_case=use_case,
                **kwargs,
            )
            
            # Record usage for the first DB provider (successful one)
            if providers:
                await self.repository.record_usage(providers[0].id)
                await self.session.commit()
            
            return response
        
        except Exception as e:
            logger.error(
                "All AI providers failed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "use_case": use_case,
                    "error": str(e),
                },
            )
            raise
    
    async def generate_embedding(
        self,
        text: str,
        provider_id: Optional[UUID] = None,
    ) -> list[float]:
        """
        Generate embedding vector for text.
        
        Args:
            text: Text to embed
            provider_id: Optional specific provider to use
        
        Returns:
            Embedding vector as list of floats
        """
        provider = None
        
        if provider_id:
            provider = await self.repository.get(provider_id)
        else:
            # Use first available provider
            providers = await self.get_available_providers()
            if providers:
                provider = providers[0]
        
        embedding = await litellm_config.generate_embedding(
            text=text,
            provider=provider,
        )
        
        if provider:
            await self.repository.record_usage(provider.id)
            await self.session.commit()
        
        return embedding
    
    async def add_provider(
        self,
        provider: str,
        model: str,
        api_key: str,
        priority: int = 0,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
    ) -> AIProvider:
        """
        Add a new AI provider configuration.
        
        Args:
            provider: Provider name (openai, anthropic, google)
            model: Model identifier
            api_key: API key (will be encrypted)
            priority: Priority for provider selection
            max_tokens: Maximum tokens per request
            temperature: Temperature for generation
        
        Returns:
            Created AIProvider instance
        """
        from domains.jusmonitoria.crypto import encrypt
        api_key_encrypted = encrypt(api_key)
        
        new_provider = await self.repository.create(
            provider=provider,
            model=model,
            api_key_encrypted=api_key_encrypted,
            priority=priority,
            max_tokens=max_tokens,
            temperature=temperature,
            is_active=True,
        )
        
        await self.session.commit()
        
        logger.info(
            "Added new AI provider",
            extra={
                "tenant_id": str(self.tenant_id),
                "provider": provider,
                "model": model,
                "priority": priority,
            },
        )
        
        return new_provider
    
    async def update_provider_priority(
        self,
        provider_id: UUID,
        new_priority: int,
    ) -> Optional[AIProvider]:
        """
        Update provider priority for fallback ordering.
        
        Args:
            provider_id: UUID of the provider
            new_priority: New priority value (higher = preferred)
        
        Returns:
            Updated AIProvider instance or None if not found
        """
        provider = await self.repository.update_priority(
            provider_id=provider_id,
            new_priority=new_priority,
        )
        
        if provider:
            await self.session.commit()
            logger.info(
                "Updated provider priority",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "provider_id": str(provider_id),
                    "new_priority": new_priority,
                },
            )
        
        return provider
    
    async def toggle_provider(
        self,
        provider_id: UUID,
        is_active: bool,
    ) -> Optional[AIProvider]:
        """
        Enable or disable a provider.
        
        Args:
            provider_id: UUID of the provider
            is_active: New active status
        
        Returns:
            Updated AIProvider instance or None if not found
        """
        provider = await self.repository.toggle_active(
            provider_id=provider_id,
            is_active=is_active,
        )
        
        if provider:
            await self.session.commit()
            logger.info(
                f"{'Enabled' if is_active else 'Disabled'} provider",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "provider_id": str(provider_id),
                },
            )
        
        return provider
    
    async def get_usage_stats(self) -> dict[str, int]:
        """
        Get usage statistics for all providers.
        
        Returns:
            Dictionary mapping provider/model to usage count
        """
        return await self.repository.get_usage_stats()
