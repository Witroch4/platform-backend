"""Database models for processual unified tables (TPU) from CNJ."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import Base, TimestampMixin

class TpuClasse(Base, TimestampMixin):
    """
    Tabela Processual Unificada (TPU) - Classes.
    Armazena a classe processual de acordo com a tabela do CNJ (`cod_item`).
    """
    
    __tablename__ = "tpu_classes"
    
    codigo: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
        comment="Código da classe no CNJ",
    )
    
    nome: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        index=True,
        comment="Nome ou descrição da classe",
    )
    
    sigla: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    
    cod_item_pai: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("tpu_classes.codigo"),
        nullable=True,
        index=True,
    )
    
    glossario: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    
    # Adicionais uteis que vem na API do CNJ
    natureza: Mapped[str | None] = mapped_column(Text, nullable=True)
    polo_ativo: Mapped[str | None] = mapped_column(Text, nullable=True)
    polo_passivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    def __repr__(self) -> str:
        return f"<TpuClasse(codigo={self.codigo}, nome={self.nome})>"
        

class TpuAssunto(Base, TimestampMixin):
    """
    Tabela Processual Unificada (TPU) - Assuntos.
    Armazena o assunto processual (matéria) de acordo com a tabela do CNJ (`cod_item`).
    """
    
    __tablename__ = "tpu_assuntos"
    
    codigo: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
        comment="Código do assunto no CNJ (cod_item)",
    )
    
    nome: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        index=True,
        comment="Nome ou descrição do assunto",
    )
    
    cod_item_pai: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("tpu_assuntos.codigo"),
        nullable=True,
        index=True,
    )
    
    glossario: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    
    artigo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    
    def __repr__(self) -> str:
        return f"<TpuAssunto(codigo={self.codigo}, nome={self.nome})>"


class TpuDocumento(Base, TimestampMixin):
    """
    Tabela Processual Unificada (TPU) - Documentos Processuais.
    Armazena os tipos de documento conforme tabela oficial do CNJ.
    """

    __tablename__ = "tpu_documentos"

    codigo: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
        comment="Código do tipo de documento no CNJ (cod_item)",
    )

    nome: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        index=True,
        comment="Nome do tipo de documento",
    )

    cod_item_pai: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
        comment="Código do item pai (categoria)",
    )

    glossario: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Descrição/glossário do tipo de documento",
    )

    def __repr__(self) -> str:
        return f"<TpuDocumento(codigo={self.codigo}, nome={self.nome})>"


class PjeJurisdicao(Base, TimestampMixin):
    """Jurisdições (Comarcas/Seções) por tribunal PJe, organizadas por Matéria.

    Coletadas automaticamente pelo scraper via cascade JSF:
    Matéria → Jurisdição → Classes Judiciais.

    Chave única: (tribunal, materia_value, jurisdicao_value)
    Atualizada incrementalmente — só recoleta combos não existentes.
    """

    __tablename__ = "pje_jurisdicoes"

    __table_args__ = (
        UniqueConstraint(
            "tribunal", "materia_value", "jurisdicao_value",
            name="uq_pje_jurisdicoes_tribunal_materia_jurisdicao",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    tribunal: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="Código do tribunal: trf1, trf3, trf5, trf6, tjce …",
    )

    materia_value: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Valor numérico da Matéria (TPU CNJ)",
    )

    materia_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Texto descritivo da Matéria",
    )

    jurisdicao_value: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Valor numérico da Jurisdição no PJe deste tribunal",
    )

    jurisdicao_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Nome da Seção/Subseção judiciária",
    )

    classes: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Classes judiciais e metadados: [{value, text, codigo_tpu, competencias, tipos_parte}, …]",
    )

    status_coleta: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="pendente",
        comment="Checkpoint do combo: pendente | fase1_ok | completo | erro",
    )

    coleta_completa: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
        comment="True quando o scraper terminou este combo com sucesso (classes + metadados)",
    )

    ultimo_erro: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Último erro de coleta registrado para este combo",
    )

    coletado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Quando este combo foi coletado pelo scraper",
    )

    def __repr__(self) -> str:
        return (
            f"<PjeJurisdicao(tribunal={self.tribunal!r}, "
            f"materia={self.materia_value!r}, "
            f"jurisdicao={self.jurisdicao_text!r})>"
        )
