"""Repository for scrape job pipeline tracking."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.scrape_job import ScrapeJob
from domains.jusmonitoria.db.repositories.base import BaseRepository


class ScrapeJobRepository(BaseRepository[ScrapeJob]):
    """Repository for managing granular scrape jobs within the pipeline."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(ScrapeJob, session, tenant_id)

    # ── Creation helpers ──

    async def create_listing_job(
        self,
        *,
        tribunal: str,
        oab_numero: str,
        oab_uf: str,
        sync_config_id: UUID | None = None,
        parent_job_id: UUID | None = None,
    ) -> ScrapeJob:
        """Create a LISTING phase job (search tribunal → get process list)."""
        return await self.create(
            fase="listing",
            status="pending",
            tribunal=tribunal,
            oab_numero=oab_numero,
            oab_uf=oab_uf,
            sync_config_id=sync_config_id,
            parent_job_id=parent_job_id,
        )

    async def create_detail_job(
        self,
        *,
        tribunal: str,
        oab_numero: str,
        oab_uf: str,
        numero_processo: str,
        sync_config_id: UUID | None = None,
        parent_job_id: UUID | None = None,
        metadata: dict | None = None,
    ) -> ScrapeJob:
        """Create a DETAIL phase job (open one processo → extract data)."""
        return await self.create(
            fase="detail",
            status="pending",
            tribunal=tribunal,
            oab_numero=oab_numero,
            oab_uf=oab_uf,
            numero_processo=numero_processo,
            sync_config_id=sync_config_id,
            parent_job_id=parent_job_id,
            metadata_json=metadata or {},
        )

    async def create_document_job(
        self,
        *,
        tribunal: str,
        oab_numero: str,
        oab_uf: str,
        numero_processo: str,
        doc_id: str,
        doc_url: str,
        sync_config_id: UUID | None = None,
        parent_job_id: UUID | None = None,
        metadata: dict | None = None,
    ) -> ScrapeJob:
        """Create a DOCUMENT phase job (download one doc → S3)."""
        return await self.create(
            fase="document",
            status="pending",
            tribunal=tribunal,
            oab_numero=oab_numero,
            oab_uf=oab_uf,
            numero_processo=numero_processo,
            doc_id=doc_id,
            doc_url=doc_url,
            sync_config_id=sync_config_id,
            parent_job_id=parent_job_id,
            metadata_json=metadata or {},
        )

    # ── Status transitions ──

    async def mark_running(self, job_id: UUID) -> ScrapeJob | None:
        """Mark a job as running (increment tentativas)."""
        job = await self.get(job_id)
        if not job:
            return None
        return await self.update(
            job_id,
            status="running",
            tentativas=job.tentativas + 1,
            started_at=datetime.now(timezone.utc),
            erro_mensagem=None,
        )

    async def mark_completed(
        self, job_id: UUID, resultado: dict | None = None
    ) -> ScrapeJob | None:
        """Mark a job as completed with optional result data."""
        return await self.update(
            job_id,
            status="completed",
            completed_at=datetime.now(timezone.utc),
            resultado_json=resultado,
        )

    async def mark_failed(
        self, job_id: UUID, erro: str
    ) -> ScrapeJob | None:
        """Mark a job as failed. If retries remain, set back to pending."""
        job = await self.get(job_id)
        if not job:
            return None

        if job.tentativas < job.max_tentativas:
            # Still has retries — set back to pending for re-dispatch
            return await self.update(
                job_id,
                status="pending",
                erro_mensagem=erro,
            )
        else:
            # Exhausted retries — permanent failure
            return await self.update(
                job_id,
                status="failed",
                completed_at=datetime.now(timezone.utc),
                erro_mensagem=erro,
            )

    # ── Queries ──

    async def get_children(
        self, parent_job_id: UUID, fase: str | None = None
    ) -> list[ScrapeJob]:
        """Get all child jobs of a parent, optionally filtered by phase."""
        q = select(ScrapeJob).where(ScrapeJob.parent_job_id == parent_job_id)
        q = self._apply_tenant_filter(q)
        if fase:
            q = q.where(ScrapeJob.fase == fase)
        q = q.order_by(ScrapeJob.created_at)
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def get_pending_by_sync(
        self, sync_config_id: UUID, fase: str | None = None
    ) -> list[ScrapeJob]:
        """Get pending jobs for a sync config."""
        q = (
            select(ScrapeJob)
            .where(ScrapeJob.sync_config_id == sync_config_id)
            .where(ScrapeJob.status == "pending")
        )
        q = self._apply_tenant_filter(q)
        if fase:
            q = q.where(ScrapeJob.fase == fase)
        q = q.order_by(ScrapeJob.created_at)
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def get_progress_summary(self, sync_config_id: UUID) -> dict:
        """Get aggregate progress for a sync pipeline.

        Returns:
            {
                "listing": {"total": 2, "completed": 1, "failed": 0, "running": 1, "pending": 0},
                "detail": {"total": 7, "completed": 3, "failed": 0, "running": 1, "pending": 3},
                "document": {"total": 12, "completed": 8, "failed": 1, "running": 0, "pending": 3},
            }
        """
        q = (
            select(
                ScrapeJob.fase,
                ScrapeJob.status,
                func.count().label("cnt"),
            )
            .where(ScrapeJob.sync_config_id == sync_config_id)
            .group_by(ScrapeJob.fase, ScrapeJob.status)
        )
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        rows = result.all()

        summary: dict[str, dict[str, int]] = {}
        for fase, status, cnt in rows:
            if fase not in summary:
                summary[fase] = {"total": 0, "completed": 0, "failed": 0, "running": 0, "pending": 0}
            summary[fase][status] = cnt
            summary[fase]["total"] += cnt

        return summary

    async def get_stale_running_jobs(self, stale_minutes: int = 10) -> list[ScrapeJob]:
        """Find jobs stuck in 'running' state (likely from crashed workers).

        Used by recovery mechanism on startup.
        """
        from datetime import timedelta

        threshold = datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)
        q = (
            select(ScrapeJob)
            .where(ScrapeJob.status == "running")
            .where(ScrapeJob.started_at < threshold)
        )
        # No tenant filter — recovery is cross-tenant
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def cleanup_old_jobs(self, older_than_days: int = 7) -> int:
        """Delete completed/failed jobs older than N days. Returns count deleted."""
        from datetime import timedelta

        threshold = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        q = (
            ScrapeJob.__table__.delete()
            .where(ScrapeJob.status.in_(["completed", "failed"]))
            .where(ScrapeJob.completed_at < threshold)
        )
        result = await self.session.execute(q)
        return result.rowcount
