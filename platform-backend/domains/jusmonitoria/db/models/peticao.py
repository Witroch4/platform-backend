"""Petition models for electronic filing via MNI 2.2.2."""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel

if TYPE_CHECKING:
    from domains.jusmonitoria.db.models.certificado_digital import CertificadoDigital
    from domains.jusmonitoria.db.models.user import User


class PeticaoStatus(str, enum.Enum):
    RASCUNHO = "rascunho"
    VALIDANDO = "validando"
    ASSINANDO = "assinando"
    PROTOCOLANDO = "protocolando"
    PROTOCOLADA = "protocolada"
    ACEITA = "aceita"
    REJEITADA = "rejeitada"


class TipoPeticao(str, enum.Enum):
    PETICAO_INICIAL = "peticao_inicial"
    CONTESTACAO = "contestacao"
    RECURSO_APELACAO = "recurso_apelacao"
    AGRAVO_INSTRUMENTO = "agravo_instrumento"
    EMBARGOS_DECLARACAO = "embargos_declaracao"
    HABEAS_CORPUS = "habeas_corpus"
    MANDADO_SEGURANCA = "mandado_seguranca"
    MANIFESTACAO = "manifestacao"
    OUTRO = "outro"


class TipoDocumento(str, enum.Enum):
    PETICAO_PRINCIPAL = "peticao_principal"
    PROCURACAO = "procuracao"
    ANEXO = "anexo"
    COMPROVANTE = "comprovante"


class DocumentoStatus(str, enum.Enum):
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    ERROR = "error"
    VALIDADO = "validado"


class Peticao(TenantBaseModel):
    """
    Petition for electronic filing via MNI 2.2.2.

    Status lifecycle: rascunho → validando → assinando → protocolando → protocolada/rejeitada
    """

    __tablename__ = "peticoes"

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    criado_por: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    certificado_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("certificados_digitais.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Process identification
    processo_numero: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="Número CNJ (20 dígitos) ou formatado com pontos",
    )
    tribunal_id: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True,
        comment="ID do tribunal (e.g. TRF5-JFCE)",
    )
    tipo_peticao: Mapped[TipoPeticao] = mapped_column(
        Enum(TipoPeticao, name="tipo_peticao_enum", native_enum=False),
        nullable=False,
    )
    assunto: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status lifecycle
    status: Mapped[PeticaoStatus] = mapped_column(
        Enum(PeticaoStatus, name="peticao_status_enum", native_enum=False),
        nullable=False,
        default=PeticaoStatus.RASCUNHO,
        index=True,
    )

    # Protocol info (set after successful filing)
    numero_protocolo: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
    )
    protocolado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    protocolo_recibo: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Recibo base64 retornado pelo tribunal",
    )
    motivo_rejeicao: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
    )

    # Tipo de documento e descrição específicos do PJe (select de 82 opções do tribunal)
    # Quando preenchido, sobrescreve o tipo enum interno na chamada ao scraper Playwright
    tipo_documento_pje: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
        comment="Label exato do select PJe (ex: 'Petição intercorrente', 'Contestação')",
    )
    descricao_pje: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True,
        comment="Descrição livre para o campo Descrição do formulário PJe",
    )

    # MNI 2.2.2 dados básicos (polo[], orgaoJulgador, assuntos[], etc.)
    dados_basicos_json: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Estrutura MNI 2.2.2: polos, orgaoJulgador, assuntos, classeProcessual, etc.",
    )

    # AI analysis result
    analise_ia: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
    )

    # Relationships
    documentos: Mapped[list["PeticaoDocumento"]] = relationship(
        back_populates="peticao",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PeticaoDocumento.ordem",
    )
    eventos: Mapped[list["PeticaoEvento"]] = relationship(
        back_populates="peticao",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PeticaoEvento.created_at",
    )

    def __repr__(self) -> str:
        return (
            f"<Peticao id={self.id} processo={self.processo_numero} "
            f"status={self.status} tribunal={self.tribunal_id}>"
        )


class PeticaoDocumento(TenantBaseModel):
    """PDF document attached to a petition, stored on S3/MinIO."""

    __tablename__ = "peticao_documentos"

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    peticao_id: Mapped[UUID] = mapped_column(
        ForeignKey("peticoes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Document metadata
    nome_original: Mapped[str] = mapped_column(String(500), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo_documento: Mapped[TipoDocumento] = mapped_column(
        Enum(TipoDocumento, name="tipo_documento_enum", native_enum=False),
        nullable=False,
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # S3 storage key (replaces conteudo_encrypted BYTEA)
    s3_key: Mapped[str] = mapped_column(
        String(1000), nullable=False,
        comment="S3 object key (e.g. peticoes/{tenant}/{peticao}/{uuid}.pdf)",
    )

    # Integrity
    hash_sha256: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="SHA-256 hash of original PDF bytes",
    )

    # Secrecy flags
    sigiloso: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="Documento marcado como sigiloso pelo usuário",
    )

    # Validation status
    status: Mapped[DocumentoStatus] = mapped_column(
        Enum(DocumentoStatus, name="documento_status_enum", native_enum=False),
        nullable=False,
        default=DocumentoStatus.UPLOADED,
    )
    erro_validacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    peticao: Mapped["Peticao"] = relationship(back_populates="documentos")

    def __repr__(self) -> str:
        return (
            f"<PeticaoDocumento id={self.id} nome={self.nome_original} "
            f"tipo={self.tipo_documento} ordem={self.ordem}>"
        )


class PeticaoEvento(TenantBaseModel):
    """Status change event for petition timeline."""

    __tablename__ = "peticao_eventos"

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    peticao_id: Mapped[UUID] = mapped_column(
        ForeignKey("peticoes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Event data
    status: Mapped[PeticaoStatus] = mapped_column(
        Enum(PeticaoStatus, name="peticao_status_enum", native_enum=False, create_constraint=False),
        nullable=False,
    )
    descricao: Mapped[str] = mapped_column(String(500), nullable=False)
    detalhes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    peticao: Mapped["Peticao"] = relationship(back_populates="eventos")

    def __repr__(self) -> str:
        return (
            f"<PeticaoEvento id={self.id} status={self.status} "
            f"descricao={self.descricao[:50]}>"
        )
