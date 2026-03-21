"""Unified platform configuration using Pydantic Settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Platform settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"
    secret_key: str = Field(default="dev-secret-key-change-in-production-32ch")

    # Active domains (comma-separated: "jusmonitoria,socialwise")
    active_domains: str = "jusmonitoria,socialwise"

    # --- Databases (3 separate databases) ---
    socialwise_database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/socialwise"
    jusmonitoria_database_url: str = (
        "postgresql+asyncpg://postgres:postgres@postgres:5432/jusmonitoria"
    )
    platform_database_url: str = (
        "postgresql+asyncpg://postgres:postgres@postgres:5432/platform"
    )
    database_pool_size: int = 20
    database_max_overflow: int = 10

    # Redis
    redis_url: RedisDsn = "redis://redis:6379/0"  # type: ignore[assignment]
    redis_max_connections: int = 50

    # --- Auth ---
    # JusMonitorIA JWT
    jwt_secret_key: str = Field(default="dev-jwt-secret-key-change-in-prod-32ch")
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 0  # 0 = no expiry

    # Socialwise NextAuth
    nextauth_secret: str = ""  # AUTH_SECRET from NextAuth

    # Service-to-service
    platform_api_key: str = Field(default="dev-platform-api-key")

    # JWT (additional)
    jwt_refresh_token_expire_days: int = 0  # 0 = no expiry
    pje_internal_api_key: str = ""

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://socialwise.witdev.com.br",
        "https://jusmonitoriaia.witdev.com.br",
    ]
    cors_allow_credentials: bool = True
    cors_max_age: int = 600  # 10 minutes

    # Security
    security_headers_enabled: bool = True
    max_payload_size_mb: int = 10
    input_validation_enabled: bool = True
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 100
    rate_limit_ai_per_minute: int = 10
    compression_enabled: bool = True
    compression_minimum_size: int = 500
    compression_level: int = 6
    cache_enabled: bool = True
    cache_default_max_age: int = 0
    cache_static_max_age: int = 86400
    cache_api_max_age: int = 60

    # --- Instagram OAuth (JusMonitorIA) ---
    instagram_app_id: str = "1543909259581320"
    instagram_app_secret: str = ""
    instagram_callback_url: str = "https://jusmonitoriaia.witdev.com.br/auth/instagram/callback"

    # Backend public URL (JusMonitorIA webhooks)
    backend_public_url: str = "https://jusmonitoria.witdev.com.br"

    # Certificate Encryption
    encrypt_key: str = ""  # Fernet key (32 bytes base64) for encrypting PFX blobs

    # MNI / Tribunal
    mni_wsdl_cache_path: str = "/tmp/zeep_cache.db"
    mni_request_timeout: int = 60
    mni_max_file_size_mb: int = 5

    # DataJud
    DATAJUD_API_URL: str = "https://api-publica.datajud.cnj.jus.br"
    DATAJUD_API_KEY: str = ""
    DATAJUD_CERT_PATH: str = ""
    DATAJUD_KEY_PATH: str = ""
    DATAJUD_RATE_LIMIT_PER_HOUR: int = 100
    DATAJUD_BATCH_SIZE: int = 100
    DATAJUD_SYNC_INTERVAL_HOURS: int = 6

    # --- AI Providers ---
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1"
    openai_document_model: str = "gpt-4.1"
    openai_daily_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_max_tokens: int = 4096
    openai_temperature: float = 0.7

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_haiku_model: str = "claude-haiku-4-5-20251001"
    anthropic_max_tokens: int = 4096

    google_api_key: str = ""
    google_model: str = "gemini-flash-latest"
    google_document_model: str = "gemini-3-flash-preview"
    google_daily_model: str = "gemini-flash-latest"

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_document_model: str = "llama-3.3-70b-versatile"
    groq_daily_model: str = "llama-3.3-70b-versatile"
    groq_max_tokens: int = 8192
    groq_temperature: float = 0.3

    # LiteLLM
    litellm_fallback_enabled: bool = True
    litellm_retry_attempts: int = 3
    litellm_timeout_seconds: int = 60

    # --- Storage (MinIO/S3) ---
    s3_endpoint: str = "objstoreapi.witdev.com.br"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "platform"
    s3_presign_expiry_seconds: int = 3600

    # Embeddings
    embedding_dimension: int = 1536
    embedding_batch_size: int = 50

    # Multimodal Embeddings (Gemini)
    gemini_embedding_model: str = "gemini-embedding-2-preview"
    gemini_embedding_dimension: int = 1536
    gemini_embedding_enabled: bool = False
    gemini_embedding_max_file_size_mb: int = 20
    gemini_embedding_task_type: str = "RETRIEVAL_DOCUMENT"

    # Comarcas (jurisdicoes PJe)
    comarcas_refresh_interval_days: int = 30
    comarcas_refresh_tribunais: str = "trf1,trf5"
    oab_scraper_sync_enabled: bool = True

    # --- Chatwit ---
    chatwit_api_url: str = "https://api.chatwit.com/v1"
    chatwit_api_key: str = ""
    chatwit_webhook_secret: str = ""
    chatwit_rate_limit_per_minute: int = 100

    # Taskiq
    taskiq_workers: int = 4
    taskiq_max_retries: int = 3
    taskiq_retry_delay_seconds: int = 60

    # --- Email ---
    mailer_sender_email: str = "suporte@witdev.com.br"
    smtp_domain: str = "zoho.com"
    smtp_address: str = "smtp.zoho.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_authentication: str = "login"
    smtp_enable_starttls_auto: bool = True
    smtp_openssl_verify_mode: str = "peer"

    # Frontend URL for emails
    frontend_url: str = "http://localhost:3001"

    # Monitoring
    prometheus_enabled: bool = True
    sentry_dsn: str = ""
    scheduler_enabled: bool = True

    # Super Admin
    super_admin_email: str = ""
    super_admin_password: str = ""

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def active_domain_list(self) -> list[str]:
        return [d.strip() for d in self.active_domains.split(",") if d.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
