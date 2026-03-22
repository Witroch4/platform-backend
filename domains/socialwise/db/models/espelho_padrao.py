"""EspelhoPadrao model — mirror of Prisma EspelhoPadrao table."""

import enum
from typing import Optional

from sqlalchemy import Boolean, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class EspecialidadeJuridica(str, enum.Enum):
    ADMINISTRATIVO = "ADMINISTRATIVO"
    CIVIL = "CIVIL"
    CONSTITUCIONAL = "CONSTITUCIONAL"
    TRABALHO = "TRABALHO"
    EMPRESARIAL = "EMPRESARIAL"
    PENAL = "PENAL"
    TRIBUTARIO = "TRIBUTARIO"


class EspelhoPadrao(SocialwiseModel):
    __tablename__ = "EspelhoPadrao"
    __table_args__ = (
        Index("EspelhoPadrao_isAtivo_idx", "isAtivo"),
    )

    especialidade: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    texto_markdown: Mapped[Optional[str]] = mapped_column("textoMarkdown", String, nullable=True)
    espelho_correcao: Mapped[Optional[str]] = mapped_column("espelhoCorrecao", String, nullable=True)
    is_ativo: Mapped[bool] = mapped_column("isAtivo", Boolean, nullable=False, default=True)
    total_usos: Mapped[int] = mapped_column("totalUsos", Integer, nullable=False, default=0)
    processado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    aguardando_processamento: Mapped[bool] = mapped_column("aguardandoProcessamento", Boolean, nullable=False, default=False)

    # FK to UsuarioChatwit (who last updated)
    atualizado_por_id: Mapped[str] = mapped_column("atualizadoPorId", String(30), nullable=False)

    def __repr__(self) -> str:
        return f"<EspelhoPadrao(id={self.id}, especialidade={self.especialidade})>"
