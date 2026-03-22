"""Digital certificate (A1 ICP-Brasil) model for petition signing and mTLS."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import TenantBaseModel


class CertificadoDigital(TenantBaseModel):
    """
    A1 digital certificate (ICP-Brasil) stored with Fernet encryption.

    The PFX blob and its password are encrypted at rest using AES-128-CBC (Fernet).
    Decryption only happens in RAM for mTLS handshakes and PDF signing.
    """

    __tablename__ = "certificados_digitais"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "serial_number", name="uq_cert_tenant_serial"
        ),
    )

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # User-facing metadata
    nome: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Friendly name (e.g. Certificado Dra. Maria)"
    )
    titular_nome: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Certificate subject CN"
    )
    titular_cpf_cnpj: Mapped[str] = mapped_column(
        String(18), nullable=False, comment="CPF or CNPJ extracted from certificate"
    )
    emissora: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Certificate issuer CN (e.g. AC SERASA RFB v5)"
    )
    serial_number: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="Certificate serial number (hex)"
    )

    # Validity
    valido_de: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valido_ate: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Encrypted storage (Fernet / AES-128-CBC)
    pfx_encrypted: Mapped[bytes] = mapped_column(
        LargeBinary, nullable=False, comment="Fernet-encrypted PFX/P12 binary"
    )
    pfx_password_encrypted: Mapped[bytes] = mapped_column(
        LargeBinary, nullable=False, comment="Fernet-encrypted PFX password"
    )
    totp_secret_encrypted: Mapped[Optional[bytes]] = mapped_column(
        LargeBinary, nullable=True, comment="Fernet-encrypted TOTP secret (base32) for PJe SSO 2FA"
    )

    # mTLS test results
    ultimo_teste_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ultimo_teste_resultado: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, comment="sucesso | falha"
    )
    ultimo_teste_mensagem: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    # Soft delete
    revogado: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
