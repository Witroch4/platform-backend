"""Database model for granular scraping job tracking.

Each OAB sync is broken into a pipeline of small jobs:
  1. LISTING  — search tribunal → get list of processo numbers
  2. DETAIL   — open one processo → extract partes + movimentações
  3. DOCUMENT — download one document → upload to S3

Jobs form a tree: orchestrator → listing → detail → document.
If any job fails, only that unit is retried.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class ScrapeJob(TenantBaseModel):
    """
    Unidade atômica de trabalho do pipeline de scraping.

    Cada job representa UMA operação (listar, detalhar ou baixar doc).
    Jobs são encadeados via parent_job_id formando uma árvore.
    """

    __tablename__ = "scrape_jobs"
    __table_args__ = (
        # Index for fast lookup of pending children
        # UniqueConstraint not needed — jobs are unique by PK
    )

    # ── Hierarchy ──
    parent_job_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("scrape_jobs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Job pai que criou este job",
    )

    # ── Job identity ──
    fase: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Fase: listing | detail | document",
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending",
        index=True,
        comment="Status: pending | running | completed | failed | blocked",
    )
    tribunal: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Código do tribunal (trf1, trf5, tjce, etc.)",
    )

    # ── OAB context (always set) ──
    oab_numero: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True,
        comment="Número OAB sendo buscado",
    )
    oab_uf: Mapped[str] = mapped_column(
        String(2), nullable=False,
        comment="UF da OAB",
    )

    # ── Process context (set from detail phase) ──
    numero_processo: Mapped[Optional[str]] = mapped_column(
        String(25), nullable=True, index=True,
        comment="Número CNJ do processo (preenchido a partir da fase detail)",
    )

    # ── Document context (set from document phase) ──
    doc_id: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
        comment="ID do documento no tribunal (fase document)",
    )
    doc_url: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="URL do documento no tribunal (fase document)",
    )

    # ── Execution tracking ──
    tentativas: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Número de tentativas de execução",
    )
    max_tentativas: Mapped[int] = mapped_column(
        Integer, default=3, nullable=False,
        comment="Máximo de tentativas antes de marcar como failed",
    )
    erro_mensagem: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Mensagem de erro da última tentativa",
    )

    # ── Metadata (flexible JSONB) ──
    metadata_json: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, default=dict,
        comment="Dados extras: detail_url, doc_description, etc.",
    )

    # ── Result (populated on success) ──
    resultado_json: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Resultado da execução (processos listados, detalhes, s3_url, etc.)",
    )

    # ── Timing ──
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Quando o job começou a executar",
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Quando o job completou (sucesso ou falha final)",
    )

    # ── Sync config reference ──
    sync_config_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("oab_sync_configs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Referência à config de sync que originou este pipeline",
    )

    def __repr__(self) -> str:
        return (
            f"<ScrapeJob fase={self.fase} status={self.status} "
            f"tribunal={self.tribunal} processo={self.numero_processo}>"
        )
