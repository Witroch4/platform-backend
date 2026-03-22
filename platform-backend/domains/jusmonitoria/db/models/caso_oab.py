"""Database model for cases found via OAB web scraping."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import TenantBaseModel


class CasoOAB(TenantBaseModel):
    """
    Processo judicial encontrado via scraping por número OAB.

    Armazena dados completos: partes, movimentações e documentos como JSONB.
    Sincronizado automaticamente 2x/dia ou manualmente pelo usuário.
    """

    __tablename__ = "casos_oab"
    __table_args__ = (
        UniqueConstraint("tenant_id", "numero", name="uq_casos_oab_tenant_numero"),
    )

    # Process identification
    numero: Mapped[str] = mapped_column(
        String(25), nullable=False, index=True,
        comment="Número CNJ do processo",
    )
    classe: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Classe processual (ex: MANDADO DE SEGURANÇA)",
    )
    assunto: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Assunto do processo",
    )
    partes_resumo: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True,
        comment="Resumo das partes (Fulano X Beltrano)",
    )

    # Scraper source
    oab_numero: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True,
        comment="Número OAB que encontrou este caso",
    )
    oab_uf: Mapped[str] = mapped_column(
        String(2), nullable=False,
        comment="UF da OAB",
    )
    tribunal: Mapped[str] = mapped_column(
        String(20), nullable=False, default="trf1",
        comment="Tribunal fonte do scraping",
    )

    # Scraped data (JSONB)
    partes_json: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list,
        comment="Partes detalhadas [{polo, nome, papel, oab, documento}]",
    )
    movimentacoes_json: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list,
        comment="Movimentações [{descricao, documento_vinculado, tem_documento}]",
    )
    documentos_json: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list,
        comment="Documentos [{nome, tipo, s3_url, tamanho_bytes}]",
    )

    # Sync tracking
    ultima_sincronizacao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Data/hora da última sincronização bem-sucedida",
    )
    total_movimentacoes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Total de movimentações na última sync",
    )
    novas_movimentacoes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Movimentações novas desde última visualização",
    )
    total_documentos: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Total de documentos/anexos",
    )

    # Monitoring
    monitoramento_ativo: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="Se o caso está sendo monitorado ativamente",
    )

    # Foreign keys
    criado_por: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    def __repr__(self) -> str:
        return f"<CasoOAB numero={self.numero} oab={self.oab_uf}{self.oab_numero}>"
