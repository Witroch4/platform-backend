"""Client automation model for individual automation toggles."""

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class ClientAutomation(TenantBaseModel):
    """
    Client automation model for per-client automation configuration.
    
    Allows enabling/disabling specific automations for individual clients:
    - briefing_matinal: Daily morning briefing
    - alertas_urgentes: Urgent alerts for critical movements
    - resumo_semanal: Weekly summary report
    """
    
    __tablename__ = "client_automations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_id", name="uq_client_automations_tenant_client"),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    client_id: Mapped[UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Client this automation config belongs to",
    )
    
    # Automation toggles
    briefing_matinal: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Enable daily morning briefing",
    )
    
    alertas_urgentes: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Enable urgent alerts for critical movements",
    )
    
    resumo_semanal: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Enable weekly summary report",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    client: Mapped["Client"] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<ClientAutomation(id={self.id}, client_id={self.client_id})>"
