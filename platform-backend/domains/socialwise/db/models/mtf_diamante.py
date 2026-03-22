"""MtfDiamanteConfig and MtfDiamanteVariavel models — mirror of Prisma tables."""

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class MtfDiamanteConfig(SocialwiseModel):
    __tablename__ = "MtfDiamanteConfig"

    user_id: Mapped[str] = mapped_column("userId", String(30), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)

    # Relationships
    variaveis: Mapped[list["MtfDiamanteVariavel"]] = relationship(
        "MtfDiamanteVariavel", back_populates="config", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<MtfDiamanteConfig(id={self.id}, userId={self.user_id})>"


class MtfDiamanteVariavel(SocialwiseModel):
    __tablename__ = "MtfDiamanteVariavel"
    __table_args__ = (
        UniqueConstraint("configId", "chave", name="MtfDiamanteVariavel_configId_chave_key"),
    )

    config_id: Mapped[str] = mapped_column(
        "configId", String(30),
        ForeignKey("MtfDiamanteConfig.id", ondelete="CASCADE"),
        nullable=False,
    )
    chave: Mapped[str] = mapped_column(String, nullable=False)
    valor: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Relationships
    config: Mapped["MtfDiamanteConfig"] = relationship("MtfDiamanteConfig", back_populates="variaveis")

    def __repr__(self) -> str:
        return f"<MtfDiamanteVariavel(id={self.id}, chave={self.chave})>"
