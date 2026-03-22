"""Dynamic AI provider configuration."""

from sqlalchemy import Boolean, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from platform_core.db.base import PlatformModel


class ProviderConfig(PlatformModel):
    __tablename__ = "provider_configs"

    domain: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True
    )  # NULL = shared across domains
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # openai, anthropic, google, groq
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    cost_per_1k_input: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    cost_per_1k_output: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    fallback_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
