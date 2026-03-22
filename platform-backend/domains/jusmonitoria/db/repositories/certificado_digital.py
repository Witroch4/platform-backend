"""Repository for digital certificate CRUD with tenant isolation."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.certificado_digital import CertificadoDigital
from domains.jusmonitoria.db.repositories.base import BaseRepository


class CertificadoDigitalRepository(BaseRepository[CertificadoDigital]):
    """Repository for A1 digital certificates."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(CertificadoDigital, session, tenant_id)

    async def get_active(self) -> list[CertificadoDigital]:
        """List non-revoked certificates for the tenant."""
        query = (
            select(CertificadoDigital)
            .where(CertificadoDigital.revogado == False)  # noqa: E712
            .order_by(CertificadoDigital.created_at.desc())
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_by_serial(self, serial_number: str) -> CertificadoDigital | None:
        """Find an active (non-revoked) certificate by serial number within the tenant."""
        query = (
            select(CertificadoDigital)
            .where(CertificadoDigital.serial_number == serial_number)
            .where(CertificadoDigital.revogado == False)  # noqa: E712
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_serial_any(self, serial_number: str) -> CertificadoDigital | None:
        """Find any certificate (including revoked) by serial number within the tenant."""
        query = (
            select(CertificadoDigital)
            .where(CertificadoDigital.serial_number == serial_number)
        )
        query = self._apply_tenant_filter(query)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
