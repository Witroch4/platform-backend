"""Database model for OAB scraper sync configuration."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import TenantBaseModel


class OABSyncConfig(TenantBaseModel):
    """
    Configuração de sincronização por OAB.

    Rastreia quando cada OAB foi sincronizada pela última vez
    e evita scrapes duplicados para a mesma OAB no mesmo tenant.
    """

    __tablename__ = "oab_sync_configs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "oab_numero", "oab_uf", name="uq_oab_sync_tenant_oab"),
    )

    oab_numero: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True,
        comment="Número OAB",
    )
    oab_uf: Mapped[str] = mapped_column(
        String(2), nullable=False,
        comment="UF da OAB",
    )
    tribunal: Mapped[str] = mapped_column(
        String(20), nullable=False, default="trf1",
        comment="Tribunal alvo do scraping",
    )

    # Sync state
    ultimo_sync: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Data/hora da última sincronização",
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="idle",
        comment="Status: idle | running | error",
    )
    erro_mensagem: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Mensagem de erro da última sync (se houver)",
    )
    total_processos: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Total de processos encontrados na última sync",
    )

    # Pipeline progress tracking (JSONB)
    progresso_detalhado: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, default=dict,
        comment="Progresso granular: {fase_atual, tribunal_atual, total_processos, processados, total_docs, docs_baixados, tribunais_status}",
    )

    # Which tribunals to sync
    tribunais: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list,
        comment="Lista de tribunais a sincronizar (auto-detectado pela UF)",
    )

    # Fallback search by name
    nome_advogado: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Nome completo do advogado — usado como fallback quando OAB retorna 0 resultados",
    )

    def __repr__(self) -> str:
        return f"<OABSyncConfig oab={self.oab_uf}{self.oab_numero} status={self.status}>"
