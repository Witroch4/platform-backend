"""Flow, FlowNode, FlowEdge models — mirror of Prisma tables."""

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, SocialwiseModel


class Flow(SocialwiseModel):
    __tablename__ = "Flow"
    __table_args__ = (
        Index("Flow_inboxId_isActive_idx", "inboxId", "isActive"),
        Index("Flow_inboxId_isCampaign_isActive_idx", "inboxId", "isCampaign", "isActive"),
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    inbox_id: Mapped[str] = mapped_column("inboxId", String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    is_campaign: Mapped[bool] = mapped_column("isCampaign", Boolean, nullable=False, default=False)
    canvas_json: Mapped[Optional[dict]] = mapped_column("canvasJson", JSONB, nullable=True)

    # Relationships
    nodes: Mapped[list["FlowNode"]] = relationship("FlowNode", back_populates="flow", cascade="all, delete-orphan")
    edges: Mapped[list["FlowEdge"]] = relationship("FlowEdge", back_populates="flow", cascade="all, delete-orphan")
    sessions: Mapped[list["FlowSession"]] = relationship("FlowSession", back_populates="flow")
    campaigns: Mapped[list["FlowCampaign"]] = relationship("FlowCampaign", back_populates="flow")
    mapeamentos: Mapped[list["MapeamentoIntencao"]] = relationship("MapeamentoIntencao", back_populates="flow")

    def __repr__(self) -> str:
        return f"<Flow(id={self.id}, name={self.name}, active={self.is_active})>"


class FlowNode(SocialwiseBase):
    """Flow node — no timestamps in Prisma schema."""

    __tablename__ = "FlowNode"
    __table_args__ = (
        Index("FlowNode_flowId_idx", "flowId"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    flow_id: Mapped[str] = mapped_column(
        "flowId", String(30),
        ForeignKey("Flow.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_type: Mapped[str] = mapped_column("nodeType", String, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    position_x: Mapped[float] = mapped_column("positionX", Float, nullable=False)
    position_y: Mapped[float] = mapped_column("positionY", Float, nullable=False)

    # Relationships
    flow: Mapped["Flow"] = relationship("Flow", back_populates="nodes")
    out_edges: Mapped[list["FlowEdge"]] = relationship(
        "FlowEdge", foreign_keys="FlowEdge.source_node_id", back_populates="source_node",
    )
    in_edges: Mapped[list["FlowEdge"]] = relationship(
        "FlowEdge", foreign_keys="FlowEdge.target_node_id", back_populates="target_node",
    )

    def __repr__(self) -> str:
        return f"<FlowNode(id={self.id}, type={self.node_type})>"


class FlowEdge(SocialwiseBase):
    """Flow edge — no timestamps in Prisma schema."""

    __tablename__ = "FlowEdge"
    __table_args__ = (
        Index("FlowEdge_flowId_idx", "flowId"),
        Index("FlowEdge_sourceNodeId_idx", "sourceNodeId"),
        Index("FlowEdge_targetNodeId_idx", "targetNodeId"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    flow_id: Mapped[str] = mapped_column(
        "flowId", String(30),
        ForeignKey("Flow.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_node_id: Mapped[str] = mapped_column(
        "sourceNodeId", String(30),
        ForeignKey("FlowNode.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_node_id: Mapped[str] = mapped_column(
        "targetNodeId", String(30),
        ForeignKey("FlowNode.id", ondelete="CASCADE"),
        nullable=False,
    )
    button_id: Mapped[Optional[str]] = mapped_column("buttonId", String, nullable=True)
    condition_branch: Mapped[Optional[str]] = mapped_column("conditionBranch", String, nullable=True)

    # Relationships
    flow: Mapped["Flow"] = relationship("Flow", back_populates="edges")
    source_node: Mapped["FlowNode"] = relationship(
        "FlowNode", foreign_keys=[source_node_id], back_populates="out_edges",
    )
    target_node: Mapped["FlowNode"] = relationship(
        "FlowNode", foreign_keys=[target_node_id], back_populates="in_edges",
    )

    def __repr__(self) -> str:
        return f"<FlowEdge(id={self.id}, {self.source_node_id} → {self.target_node_id})>"
