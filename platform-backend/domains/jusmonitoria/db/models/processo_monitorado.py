"""Database model for monitored legal processes."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import TenantBaseModel


class ProcessoMonitorado(TenantBaseModel):
    """
    Processo judicial monitorado via DataJud.

    Pode ser criado manualmente pelo usuário ou automaticamente
    quando uma petição é protocolada com sucesso.
    """

    __tablename__ = "processos_monitorados"
    __table_args__ = (
        UniqueConstraint("tenant_id", "numero", name="uq_processos_monitorados_tenant_numero"),
    )

    # Foreign keys
    criado_por: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    peticao_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("peticoes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Petição de origem (se criado automaticamente após protocolar)",
    )

    # Process identification
    numero: Mapped[str] = mapped_column(
        String(25), nullable=False, index=True,
        comment="Número do processo (20 dígitos puros)",
    )
    apelido: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
        comment="Apelido/descrição curta para identificação rápida",
    )

    # DataJud consultation data
    dados_datajud: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Resultado completo da última consulta DataJud",
    )
    ultima_consulta: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Data/hora da última consulta DataJud",
    )

    # Movement tracking
    movimentacoes_conhecidas: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Total de movimentações na última consulta",
    )
    novas_movimentacoes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Movimentações novas desde última visualização",
    )

    def __repr__(self) -> str:
        return f"<ProcessoMonitorado numero={self.numero} apelido={self.apelido}>"
