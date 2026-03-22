"""LeadOabData model — mirror of Prisma LeadOabData table."""

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase


class LeadOabData(SocialwiseBase):
    """OAB evaluation data for a Lead. No timestamps in Prisma schema."""

    __tablename__ = "LeadOabData"
    __table_args__ = (
        Index("LeadOabData_usuarioChatwitId_espelhoBibliotecaId_idx", "usuarioChatwitId", "espelhoBibliotecaId"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    lead_id: Mapped[str] = mapped_column(
        "leadId", String(30),
        ForeignKey("Lead.id", ondelete="CASCADE"),
        unique=True, nullable=False,
    )
    nome_real: Mapped[Optional[str]] = mapped_column("nomeReal", String, nullable=True)
    concluido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    anotacoes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_unificado: Mapped[Optional[str]] = mapped_column("pdfUnificado", String, nullable=True)
    imagens_convertidas: Mapped[Optional[str]] = mapped_column("imagensConvertidas", String, nullable=True)
    lead_url: Mapped[Optional[str]] = mapped_column("leadUrl", String, nullable=True)
    fez_recurso: Mapped[bool] = mapped_column("fezRecurso", Boolean, nullable=False, default=False)
    datas_recurso: Mapped[Optional[str]] = mapped_column("datasRecurso", String, nullable=True)

    # Prova manuscrita
    prova_manuscrita: Mapped[Optional[dict]] = mapped_column("provaManuscrita", JSONB, nullable=True)
    manuscrito_processado: Mapped[bool] = mapped_column("manuscritoProcessado", Boolean, nullable=False, default=False)
    aguardando_manuscrito: Mapped[bool] = mapped_column("aguardandoManuscrito", Boolean, nullable=False, default=False)

    # Espelho
    espelho_correcao: Mapped[Optional[str]] = mapped_column("espelhoCorrecao", String, nullable=True)
    texto_do_espelho: Mapped[Optional[dict]] = mapped_column("textoDOEspelho", JSONB, nullable=True)
    espelho_processado: Mapped[bool] = mapped_column("espelhoProcessado", Boolean, nullable=False, default=False)
    aguardando_espelho: Mapped[bool] = mapped_column("aguardandoEspelho", Boolean, nullable=False, default=False)

    # Análise
    analise_url: Mapped[Optional[str]] = mapped_column("analiseUrl", String, nullable=True)
    argumentacao_url: Mapped[Optional[str]] = mapped_column("argumentacaoUrl", String, nullable=True)
    analise_processada: Mapped[bool] = mapped_column("analiseProcessada", Boolean, nullable=False, default=False)
    aguardando_analise: Mapped[bool] = mapped_column("aguardandoAnalise", Boolean, nullable=False, default=False)
    analise_preliminar: Mapped[Optional[dict]] = mapped_column("analisePreliminar", JSONB, nullable=True)
    analise_validada: Mapped[bool] = mapped_column("analiseValidada", Boolean, nullable=False, default=False)
    consultoria_fase2: Mapped[bool] = mapped_column("consultoriaFase2", Boolean, nullable=False, default=False)
    always_show_in_lead_list: Mapped[bool] = mapped_column("alwaysShowInLeadList", Boolean, nullable=False, default=False)

    # Recurso
    recurso_preliminar: Mapped[Optional[dict]] = mapped_column("recursoPreliminar", JSONB, nullable=True)
    recurso_validado: Mapped[bool] = mapped_column("recursoValidado", Boolean, nullable=False, default=False)
    recurso_url: Mapped[Optional[str]] = mapped_column("recursoUrl", String, nullable=True)
    recurso_argumentacao_url: Mapped[Optional[str]] = mapped_column("recursoArgumentacaoUrl", String, nullable=True)
    aguardando_recurso: Mapped[bool] = mapped_column("aguardandoRecurso", Boolean, nullable=False, default=False)

    # Metadata
    seccional: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    area_juridica: Mapped[Optional[str]] = mapped_column("areaJuridica", String, nullable=True)
    nota_final: Mapped[Optional[float]] = mapped_column("notaFinal", Float, nullable=True)
    situacao: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    inscricao: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exames_participados: Mapped[Optional[dict]] = mapped_column("examesParticipados", JSONB, nullable=True)
    especialidade: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # FK columns (tables not mirrored — no ForeignKey constraint)
    espelho_padrao_id: Mapped[Optional[str]] = mapped_column("espelhoPadraoId", String(30), nullable=True)
    usuario_chatwit_id: Mapped[str] = mapped_column(
        "usuarioChatwitId", String(30),
        ForeignKey("UsuarioChatwit.id", ondelete="CASCADE"),
        nullable=False,
    )
    espelho_biblioteca_id: Mapped[Optional[str]] = mapped_column("espelhoBibliotecaId", String(30), nullable=True)

    # Relationships
    lead: Mapped["Lead"] = relationship("Lead", back_populates="oab_data", lazy="selectin")
    usuario_chatwit: Mapped["UsuarioChatwit"] = relationship("UsuarioChatwit", lazy="selectin")

    def __repr__(self) -> str:
        return f"<LeadOabData(id={self.id}, leadId={self.lead_id}, concluido={self.concluido})>"
