"""ArquivoLeadOab model — mirror of Prisma ArquivoLeadOab table."""

from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class ArquivoLeadOab(SocialwiseModel):
    __tablename__ = "ArquivoLeadOab"
    __table_args__ = (
        Index("ArquivoLeadOab_leadOabDataId_idx", "leadOabDataId"),
    )

    lead_oab_data_id: Mapped[str] = mapped_column(
        "leadOabDataId", String(30),
        ForeignKey("LeadOabData.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_type: Mapped[str] = mapped_column("fileType", String, nullable=False)
    data_url: Mapped[str] = mapped_column("dataUrl", String, nullable=False)
    pdf_convertido: Mapped[Optional[str]] = mapped_column("pdfConvertido", String, nullable=True)
    chatwit_file_id: Mapped[Optional[int]] = mapped_column(
        "chatwitFileId", Integer, unique=True, nullable=True,
    )

    lead_oab_data: Mapped["LeadOabData"] = relationship("LeadOabData", lazy="selectin")

    def __repr__(self) -> str:
        return f"<ArquivoLeadOab(id={self.id}, fileType={self.file_type}, chatwitFileId={self.chatwit_file_id})>"
