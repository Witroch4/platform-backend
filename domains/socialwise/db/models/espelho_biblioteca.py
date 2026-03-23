"""EspelhoBiblioteca model — mirror of Prisma EspelhoBiblioteca table."""

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class EspelhoBiblioteca(SocialwiseModel):
    __tablename__ = "EspelhoBiblioteca"
    __table_args__ = (
        Index("EspelhoBiblioteca_criadoPorId_isAtivo_idx", "criadoPorId", "isAtivo"),
    )

    nome: Mapped[str] = mapped_column(String, nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    texto_do_espelho: Mapped[Optional[dict]] = mapped_column("textoDOEspelho", JSONB, nullable=True)
    espelho_correcao: Mapped[Optional[str]] = mapped_column("espelhoCorrecao", String, nullable=True)
    is_ativo: Mapped[bool] = mapped_column("isAtivo", Boolean, nullable=False, default=True)
    total_usos: Mapped[int] = mapped_column("totalUsos", Integer, nullable=False, default=0)
    espelho_biblioteca_processado: Mapped[bool] = mapped_column(
        "espelhoBibliotecaProcessado", Boolean, nullable=False, default=False,
    )
    aguardando_espelho: Mapped[bool] = mapped_column(
        "aguardandoEspelho", Boolean, nullable=False, default=False,
    )

    # FK to UsuarioChatwit
    criado_por_id: Mapped[str] = mapped_column(
        "criadoPorId", String(30),
        ForeignKey("UsuarioChatwit.id", ondelete="CASCADE"),
        nullable=False,
    )

    criado_por: Mapped["UsuarioChatwit"] = relationship("UsuarioChatwit", lazy="selectin")

    def __repr__(self) -> str:
        return f"<EspelhoBiblioteca(id={self.id}, nome={self.nome})>"
