"""Pydantic schemas for Certificate API."""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field
from pydantic.alias_generators import to_camel


class CertificadoResponse(BaseModel):
    """Response schema for a digital certificate."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    tenant_id: UUID
    nome: str
    titular_nome: str
    titular_cpf_cnpj: str
    emissora: str
    serial_number: str
    valido_ate: datetime
    criptografia: str = "AES-128-CBC"
    ultimo_teste_em: Optional[datetime] = None
    ultimo_teste_resultado: Optional[str] = None
    criado_em: datetime = Field(validation_alias="created_at")
    totp_secret_encrypted: Optional[bytes] = Field(default=None, exclude=True)

    @computed_field
    @property
    def totp_configurado(self) -> bool:
        """Whether TOTP 2FA is configured for this certificate."""
        return self.totp_secret_encrypted is not None

    @computed_field
    @property
    def status(self) -> str:
        """Compute certificate status from validity date."""
        now = datetime.now(timezone.utc)
        valido = self.valido_ate
        if valido.tzinfo is None:
            valido = valido.replace(tzinfo=timezone.utc)

        if valido < now:
            return "expirado"
        if valido < now + timedelta(days=30):
            return "expirando"
        return "valido"


class CertificadoListResponse(BaseModel):
    """Response schema for certificate list."""

    items: list[CertificadoResponse]
    total: int


class CertificadoTesteResponse(BaseModel):
    """Response schema for mTLS connection test."""

    sucesso: bool
    mensagem: str


class CertificadoTesteRequest(BaseModel):
    """Request schema for testing a certificate against a tribunal."""

    tribunal_wsdl_url: Optional[str] = Field(
        None,
        description="WSDL URL to test against. Defaults to TRF5-JFCE.",
    )
