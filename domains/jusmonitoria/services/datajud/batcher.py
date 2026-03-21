"""
DataJud Batching System

Groups processes into batches and distributes requests over time to respect
rate limits.

Strategy:
- Batch size: 100 processes per request
- Distribution: Spread over 6 hours (360 minutes)
- Delay between requests: 36 seconds (100 req/hour)

Requirements: 2.5, 11
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID


@dataclass
class Batch:
    """Represents a batch of processes to sync."""

    batch_id: int
    cnj_numbers: List[str]
    scheduled_at: datetime
    tenant_id: UUID


class DataJudBatcher:
    """
    Batching system for DataJud API requests.

    Distributes process queries across time to respect rate limits:
    - Max 100 processes per batch
    - 36 seconds between batches (100 requests per hour)
    - Distributes load evenly over 6-hour window
    """

    def __init__(
        self,
        batch_size: int = 100,
        delay_seconds: float = 36.0,
        distribution_hours: int = 6,
    ):
        """
        Initialize batcher.

        Args:
            batch_size: Maximum processes per batch (default: 100)
            delay_seconds: Delay between batches in seconds (default: 36)
            distribution_hours: Hours to distribute batches over (default: 6)
        """
        self.batch_size = batch_size
        self.delay_seconds = delay_seconds
        self.distribution_hours = distribution_hours

    def create_batches(
        self,
        cnj_numbers: List[str],
        tenant_id: UUID,
        start_time: Optional[datetime] = None,
    ) -> List[Batch]:
        """
        Create batches from list of CNJ numbers.

        Args:
            cnj_numbers: List of CNJ process numbers to batch
            tenant_id: Tenant ID for the batches
            start_time: When to start processing (default: now)

        Returns:
            List of Batch objects with scheduled times
        """
        if not cnj_numbers:
            return []

        if start_time is None:
            start_time = datetime.utcnow()

        batches = []
        total_batches = (len(cnj_numbers) + self.batch_size - 1) // self.batch_size

        for i in range(0, len(cnj_numbers), self.batch_size):
            batch_cnj = cnj_numbers[i : i + self.batch_size]
            batch_index = i // self.batch_size

            # Calculate scheduled time for this batch
            delay = timedelta(seconds=self.delay_seconds * batch_index)
            scheduled_at = start_time + delay

            batch = Batch(
                batch_id=batch_index,
                cnj_numbers=batch_cnj,
                scheduled_at=scheduled_at,
                tenant_id=tenant_id,
            )
            batches.append(batch)

        return batches

    def calculate_distribution(
        self,
        total_processes: int,
    ) -> dict:
        """
        Calculate batch distribution statistics.

        Args:
            total_processes: Total number of processes to sync

        Returns:
            Dictionary with distribution statistics
        """
        total_batches = (total_processes + self.batch_size - 1) // self.batch_size
        total_time_seconds = total_batches * self.delay_seconds
        total_time_hours = total_time_seconds / 3600

        return {
            "total_processes": total_processes,
            "batch_size": self.batch_size,
            "total_batches": total_batches,
            "delay_seconds": self.delay_seconds,
            "total_time_seconds": total_time_seconds,
            "total_time_hours": round(total_time_hours, 2),
            "fits_in_window": total_time_hours <= self.distribution_hours,
        }

    def distribute_evenly(
        self,
        cnj_numbers: List[str],
        tenant_id: UUID,
        window_hours: Optional[int] = None,
    ) -> List[Batch]:
        """
        Distribute batches evenly across a time window.

        Instead of fixed 36s delay, calculates optimal delay to spread
        batches evenly across the window.

        Args:
            cnj_numbers: List of CNJ process numbers
            tenant_id: Tenant ID
            window_hours: Time window in hours (default: self.distribution_hours)

        Returns:
            List of Batch objects with evenly distributed times
        """
        if not cnj_numbers:
            return []

        if window_hours is None:
            window_hours = self.distribution_hours

        total_batches = (len(cnj_numbers) + self.batch_size - 1) // self.batch_size

        if total_batches == 1:
            # Single batch, schedule immediately
            return self.create_batches(cnj_numbers, tenant_id)

        # Calculate optimal delay to spread evenly
        window_seconds = window_hours * 3600
        optimal_delay = window_seconds / (total_batches - 1)

        # Ensure we don't go below minimum rate limit (36s)
        delay = max(optimal_delay, self.delay_seconds)

        batches = []
        start_time = datetime.utcnow()

        for i in range(0, len(cnj_numbers), self.batch_size):
            batch_cnj = cnj_numbers[i : i + self.batch_size]
            batch_index = i // self.batch_size

            scheduled_at = start_time + timedelta(seconds=delay * batch_index)

            batch = Batch(
                batch_id=batch_index,
                cnj_numbers=batch_cnj,
                scheduled_at=scheduled_at,
                tenant_id=tenant_id,
            )
            batches.append(batch)

        return batches

    async def process_batches_sequentially(
        self,
        batches: List[Batch],
        process_func,
    ) -> List:
        """
        Process batches sequentially with delays.

        Args:
            batches: List of batches to process
            process_func: Async function to process each batch
                         Should accept (batch: Batch) and return result

        Returns:
            List of results from processing each batch
        """
        results = []

        for i, batch in enumerate(batches):
            # Wait until scheduled time
            now = datetime.utcnow()
            if batch.scheduled_at > now:
                wait_seconds = (batch.scheduled_at - now).total_seconds()
                await asyncio.sleep(wait_seconds)

            # Process batch
            result = await process_func(batch)
            results.append(result)

        return results

    def get_next_batch_time(
        self,
        last_batch_time: datetime,
    ) -> datetime:
        """
        Calculate when the next batch can be processed.

        Args:
            last_batch_time: When the last batch was processed

        Returns:
            Datetime when next batch can be processed
        """
        return last_batch_time + timedelta(seconds=self.delay_seconds)

    def can_process_now(
        self,
        last_batch_time: Optional[datetime],
    ) -> bool:
        """
        Check if a batch can be processed now.

        Args:
            last_batch_time: When the last batch was processed (None if first)

        Returns:
            True if enough time has passed since last batch
        """
        if last_batch_time is None:
            return True

        elapsed = (datetime.utcnow() - last_batch_time).total_seconds()
        return elapsed >= self.delay_seconds


def create_batcher() -> DataJudBatcher:
    """
    Factory function to create DataJud batcher with default settings.

    Returns:
        Configured DataJudBatcher instance
    """
    return DataJudBatcher(
        batch_size=100,
        delay_seconds=36.0,
        distribution_hours=6,
    )
