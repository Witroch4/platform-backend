"""Tenant-aware AI provider management — extends platform_core.

The base ProviderManager lives in platform_core/ai/provider_manager.py.
This domain-specific version adds:
- Tenant-scoped DB provider loading (AIProvider model)
- AIProviderRepository integration
- Encrypted API key handling
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.ai.litellm_config import LLMResponse
from platform_core.ai.provider_manager import (
    ProviderEntry,
    ProviderManager as _BaseProviderManager,
)
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class ProviderManager(_BaseProviderManager):
    """Tenant-aware provider manager with DB-backed provider loading.

    Extends the base ProviderManager with:
    - Database-driven provider configs per tenant
    - Encrypted API key decryption
    - Usage tracking per provider
    """

    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ) -> None:
        super().__init__()
        self.session = session
        self.tenant_id = tenant_id
        # Lazy import to avoid circular deps
        from domains.jusmonitoria.db.repositories.ai_provider_repository import AIProviderRepository
        self.repository = AIProviderRepository(session, tenant_id)

    async def get_available_providers(self) -> list:
        """Get all active providers for the tenant, ordered by priority."""
        providers = await self.repository.get_active_providers(
            order_by_priority=True
        )
        if not providers:
            logger.warning(
                "no_db_providers",
                tenant_id=str(self.tenant_id),
            )
        return providers

    async def call_llm(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
        use_case: str = "default",
        **kwargs: Any,
    ) -> LLMResponse:
        """Call LLM with tenant-scoped provider selection and fallback.

        If DB providers are configured, uses them first. Falls back to
        env-based chains from the base ProviderManager.
        """
        db_providers = await self.get_available_providers()

        if db_providers:
            entries = []
            for provider in db_providers:
                if not provider.is_active:
                    continue
                entries.append(ProviderEntry(
                    provider=provider.provider,
                    model=provider.model,
                    api_key=self._decrypt_api_key(provider.api_key_encrypted),
                    temperature=temperature or float(provider.temperature),
                    max_tokens=max_tokens or provider.max_tokens,
                    priority=provider.priority,
                ))

            try:
                response = await self.call_with_fallback(
                    messages=messages,
                    providers=entries,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs,
                )
                if db_providers:
                    await self.repository.record_usage(db_providers[0].id)
                    await self.session.commit()
                return response
            except Exception:
                logger.warning(
                    "db_providers_exhausted_falling_back",
                    tenant_id=str(self.tenant_id),
                    use_case=use_case,
                )

        # Fallback to env-based chain
        return await self.call_with_fallback(
            messages=messages,
            use_case=use_case,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )

    async def generate_embedding(
        self,
        text: str,
        provider_id: UUID | None = None,
        **kwargs: Any,
    ) -> list[float]:
        """Generate embedding vector for text with optional provider override."""
        provider = None

        if provider_id:
            provider = await self.repository.get(provider_id)
        else:
            providers = await self.get_available_providers()
            if providers:
                provider = providers[0]

        if provider:
            key = self._decrypt_api_key(provider.api_key_encrypted)
            model = f"{provider.provider}/{provider.model}"
            result = await super().generate_embedding(text, model=model, api_key=key)
            await self.repository.record_usage(provider.id)
            await self.session.commit()
            return result[0] if result else []

        result = await super().generate_embedding(text)
        return result[0] if result else []

    @staticmethod
    def _decrypt_api_key(encrypted_key: str) -> str:
        """Decrypt API key stored with Fernet encryption."""
        from domains.jusmonitoria.crypto import decrypt
        try:
            return decrypt(encrypted_key)
        except Exception:
            return encrypted_key

    async def add_provider(
        self,
        provider: str,
        model: str,
        api_key: str,
        priority: int = 0,
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ):
        """Add a new AI provider configuration."""
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
            "provider_added",
            tenant_id=str(self.tenant_id),
            provider=provider,
            model=model,
            priority=priority,
        )
        return new_provider

    async def update_provider_priority(self, provider_id: UUID, new_priority: int):
        """Update provider priority for fallback ordering."""
        provider = await self.repository.update_priority(
            provider_id=provider_id,
            new_priority=new_priority,
        )
        if provider:
            await self.session.commit()
            logger.info(
                "provider_priority_updated",
                tenant_id=str(self.tenant_id),
                provider_id=str(provider_id),
                new_priority=new_priority,
            )
        return provider

    async def toggle_provider(self, provider_id: UUID, is_active: bool):
        """Enable or disable a provider."""
        provider = await self.repository.toggle_active(
            provider_id=provider_id,
            is_active=is_active,
        )
        if provider:
            await self.session.commit()
            logger.info(
                "provider_toggled",
                tenant_id=str(self.tenant_id),
                provider_id=str(provider_id),
                is_active=is_active,
            )
        return provider

    async def get_usage_stats(self) -> dict[str, int]:
        """Get usage statistics for all providers."""
        return await self.repository.get_usage_stats()
