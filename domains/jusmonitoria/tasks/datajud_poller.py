"""
DataJud Polling Worker

Periodically polls DataJud API for process updates.
Respects rate limits and distributes load across time.

Requirements: 2.4, 2.5, 2.6, 10, 11, 12, 21
"""

import asyncio
from datetime import datetime, timedelta
from typing import List
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.services.datajud.batcher import Batch, create_batcher
from domains.jusmonitoria.services.datajud.client import create_datajud_client
from domains.jusmonitoria.services.datajud.parser import Movement, create_parser
from domains.jusmonitoria.db.session_compat import AsyncSessionLocal
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.repositories.case_movement import CaseMovementRepository
from domains.jusmonitoria.db.repositories.legal_case import LegalCaseRepository
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.events.bus import publish
from domains.jusmonitoria.tasks.events.types import EventType
from domains.jusmonitoria.tasks.base import BaseTask, with_retry, with_timeout

logger = structlog.get_logger(__name__)


class DataJudPollerTask(BaseTask):
    """Task for polling DataJud API for process updates."""

    def __init__(self):
        super().__init__("datajud_poller")

    async def execute(self, tenant_id: str) -> dict:
        """
        Execute DataJud polling for a tenant.

        Args:
            tenant_id: Tenant UUID as string

        Returns:
            Dictionary with polling statistics
        """
        tenant_uuid = UUID(tenant_id)

        self.logger.info("starting_datajud_poll", tenant_id=tenant_id)

        async with AsyncSessionLocal() as session:
            # Get processes that need syncing
            case_repo = LegalCaseRepository(session, tenant_uuid)
            cases_to_sync = await case_repo.get_cases_to_sync()

            if not cases_to_sync:
                self.logger.info(
                    "no_cases_to_sync",
                    tenant_id=tenant_id,
                )
                return {
                    "tenant_id": tenant_id,
                    "cases_synced": 0,
                    "movements_found": 0,
                    "new_movements": 0,
                }

            self.logger.info(
                "cases_to_sync",
                tenant_id=tenant_id,
                count=len(cases_to_sync),
            )

            # Create batches
            batcher = create_batcher()
            cnj_numbers = [case.cnj_number for case in cases_to_sync]
            batches = batcher.create_batches(cnj_numbers, tenant_uuid)

            self.logger.info(
                "batches_created",
                tenant_id=tenant_id,
                total_batches=len(batches),
                total_cases=len(cnj_numbers),
            )

            # Process batches
            stats = {
                "tenant_id": tenant_id,
                "cases_synced": 0,
                "movements_found": 0,
                "new_movements": 0,
                "errors": 0,
            }

            for batch in batches:
                try:
                    batch_stats = await self._process_batch(
                        session, tenant_uuid, batch, cases_to_sync
                    )

                    stats["cases_synced"] += batch_stats["cases_synced"]
                    stats["movements_found"] += batch_stats["movements_found"]
                    stats["new_movements"] += batch_stats["new_movements"]

                except Exception as e:
                    self.logger.error(
                        "batch_processing_failed",
                        tenant_id=tenant_id,
                        batch_id=batch.batch_id,
                        error=str(e),
                    )
                    stats["errors"] += 1

            self.logger.info(
                "datajud_poll_completed",
                tenant_id=tenant_id,
                **stats,
            )

            return stats

    async def _process_batch(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        batch: Batch,
        cases: List[LegalCase],
    ) -> dict:
        """
        Process a single batch of cases.

        Args:
            session: Database session
            tenant_id: Tenant UUID
            batch: Batch to process
            cases: List of all cases (for lookup)

        Returns:
            Dictionary with batch statistics
        """
        # Wait until scheduled time
        now = datetime.utcnow()
        if batch.scheduled_at > now:
            wait_seconds = (batch.scheduled_at - now).total_seconds()
            self.logger.info(
                "waiting_for_batch_schedule",
                batch_id=batch.batch_id,
                wait_seconds=wait_seconds,
            )
            await asyncio.sleep(wait_seconds)

        self.logger.info(
            "processing_batch",
            batch_id=batch.batch_id,
            case_count=len(batch.cnj_numbers),
        )

        # Create DataJud client
        client = create_datajud_client()
        parser = create_parser()

        try:
            # Fetch movements from DataJud
            movements_by_cnj = await client.get_movements(
                cnj_numbers=batch.cnj_numbers,
                date_from=datetime.utcnow() - timedelta(days=30),
            )

            stats = {
                "cases_synced": 0,
                "movements_found": 0,
                "new_movements": 0,
            }

            # Process each case
            for cnj_number in batch.cnj_numbers:
                # Find case in list
                case = next((c for c in cases if c.cnj_number == cnj_number), None)
                if not case:
                    continue

                # Get movements for this case
                raw_movements = movements_by_cnj.get(cnj_number, [])

                if raw_movements:
                    # Parse movements
                    parsed_movements = parser.parse_batch(raw_movements)

                    # Store new movements
                    new_count = await self._store_movements(
                        session, tenant_id, case, parsed_movements
                    )

                    stats["movements_found"] += len(parsed_movements)
                    stats["new_movements"] += new_count

                # Update last sync time
                case.last_sync_at = datetime.utcnow()
                if parsed_movements:
                    case.last_movement_date = max(m.date for m in parsed_movements)

                stats["cases_synced"] += 1

            await session.commit()

            self.logger.info(
                "batch_processed",
                batch_id=batch.batch_id,
                **stats,
            )

            return stats

        finally:
            await client.close()

    async def _store_movements(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        case: LegalCase,
        movements: List[Movement],
    ) -> int:
        """
        Store new movements in database.

        Args:
            session: Database session
            tenant_id: Tenant UUID
            case: Legal case
            movements: List of parsed movements

        Returns:
            Number of new movements stored
        """
        movement_repo = CaseMovementRepository(session, tenant_id)
        new_count = 0

        for movement in movements:
            # Check if movement already exists (by hash)
            content_hash = movement.compute_hash()
            existing = await movement_repo.get_by_hash(case.id, content_hash)

            if existing:
                continue

            # Create new movement
            case_movement = await movement_repo.create(
                legal_case_id=case.id,
                movement_date=movement.date,
                movement_type=movement.type,
                description=movement.description,
                content_hash=content_hash,
                is_important=False,  # Will be analyzed by AI later
                requires_action=False,
            )

            new_count += 1

            # Publish event for new movement
            await publish(
                EventType.MOVEMENT_DETECTED,
                {
                    "tenant_id": str(tenant_id),
                    "case_id": str(case.id),
                    "movement_id": str(case_movement.id),
                    "cnj_number": case.cnj_number,
                    "movement_date": movement.date.isoformat(),
                    "movement_type": movement.type,
                },
            )

            self.logger.info(
                "new_movement_stored",
                case_id=str(case.id),
                movement_id=str(case_movement.id),
                movement_date=movement.date.isoformat(),
            )

        return new_count


# Create task instance
datajud_poller_task = DataJudPollerTask()


# Register task with broker
@broker.task(
    task_name="datajud_poll_tenant",
    retry_on_error=True,
    max_retries=3,
)
@with_timeout(300.0)  # 5 minute timeout
@with_retry(max_retries=3, backoff_factor=2.0, initial_delay=5.0)
async def poll_datajud_for_tenant(tenant_id: str) -> dict:
    """
    Poll DataJud API for a specific tenant.

    Args:
        tenant_id: Tenant UUID as string

    Returns:
        Dictionary with polling statistics
    """
    return await datajud_poller_task(tenant_id)


@broker.task(
    task_name="datajud_poll_all_tenants",
    retry_on_error=True,
    max_retries=3,
)
async def poll_datajud_for_all_tenants() -> dict:
    """
    Poll DataJud API for all active tenants.

    This is typically scheduled to run every 6 hours.

    Returns:
        Dictionary with overall statistics
    """
    logger.info("starting_datajud_poll_all_tenants")

    async with AsyncSessionLocal() as session:
        # Get all active tenants
        from domains.jusmonitoria.db.repositories.tenant import TenantRepository

        tenant_repo = TenantRepository(session)
        tenants = await tenant_repo.get_active_tenants()

        logger.info("tenants_to_poll", count=len(tenants))

        # Schedule polling for each tenant
        tasks = []
        for tenant in tenants:
            task = poll_datajud_for_tenant.kiq(str(tenant.id))
            tasks.append(task)

        logger.info(
            "datajud_poll_tasks_scheduled",
            tenant_count=len(tenants),
        )

        return {
            "tenants_scheduled": len(tenants),
            "tasks_created": len(tasks),
        }


@broker.task(
    task_name="datajud_sync_single_case",
    retry_on_error=True,
    max_retries=3,
)
@with_timeout(60.0)
@with_retry(max_retries=3, backoff_factor=2.0)
async def sync_single_case(tenant_id: str, case_id: str) -> dict:
    """
    Sync a single case immediately (manual trigger).

    Args:
        tenant_id: Tenant UUID as string
        case_id: Case UUID as string

    Returns:
        Dictionary with sync results
    """
    tenant_uuid = UUID(tenant_id)
    case_uuid = UUID(case_id)

    logger.info(
        "syncing_single_case",
        tenant_id=tenant_id,
        case_id=case_id,
    )

    async with AsyncSessionLocal() as session:
        case_repo = LegalCaseRepository(session, tenant_uuid)
        case = await case_repo.get(case_uuid)

        if not case:
            logger.error("case_not_found", case_id=case_id)
            return {"error": "Case not found"}

        # Create single-case batch
        batcher = create_batcher()
        batches = batcher.create_batches([case.cnj_number], tenant_uuid)

        if not batches:
            return {"error": "Failed to create batch"}

        # Process immediately (ignore schedule)
        batch = batches[0]
        batch.scheduled_at = datetime.utcnow()

        poller = DataJudPollerTask()
        stats = await poller._process_batch(session, tenant_uuid, batch, [case])

        logger.info(
            "single_case_synced",
            tenant_id=tenant_id,
            case_id=case_id,
            **stats,
        )

        return stats
