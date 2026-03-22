"""UserOAB model — múltiplas OABs por advogado."""

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class UserOAB(TenantBaseModel):
    """
    Registro de OAB de um advogado.

    Permite que um mesmo usuário possua múltiplas inscrições OAB
    em estados diferentes (ex: OAB/SP, OAB/RJ, OAB/DF).

    A OAB primária (`is_primary=True`) é mantida como retrocompatibilidade
    com os campos `users.oab_number` e `users.oab_state`.
    """

    __tablename__ = "user_oabs"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "oab_numero", "oab_uf",
            name="uq_user_oabs_tenant_oab",
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    oab_numero: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Número de inscrição OAB (somente dígitos)",
    )

    oab_uf: Mapped[str] = mapped_column(
        String(2),
        nullable=False,
        comment="UF da inscrição OAB (ex: SP, RJ, DF)",
    )

    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Se verdadeiro, é a OAB principal do advogado",
    )

    nome_advogado: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Nome completo — fallback para busca por nome quando OAB retorna 0 resultados",
    )

    ativo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Se falso, esta OAB está desativada e não será sincronizada",
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="oabs",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<UserOAB(oab={self.oab_uf}{self.oab_numero} "
            f"user={self.user_id} primary={self.is_primary})>"
        )

    @property
    def oab_formatted(self) -> str:
        """Retorna OAB formatada, ex: 'OAB/SP 123.456'."""
        num = self.oab_numero
        if len(num) > 3:
            num = f"{num[:-3]}.{num[-3:]}"
        return f"OAB/{self.oab_uf} {num}"
