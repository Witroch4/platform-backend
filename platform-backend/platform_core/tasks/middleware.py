"""Shared TaskIQ middleware for all domain brokers."""

import structlog
from taskiq import TaskiqMiddleware

logger = structlog.get_logger(__name__)


class LoggingMiddleware(TaskiqMiddleware):
    """Structured logging for task execution."""

    async def pre_execute(self, message: "TaskiqMessage") -> "TaskiqMessage":
        logger.info(
            "task_started",
            task_name=message.task_name,
            task_id=message.task_id,
            labels=message.labels,
        )
        return message

    async def post_execute(
        self,
        message: "TaskiqMessage",
        result: "TaskiqResult",
    ) -> None:
        if result.is_err:
            logger.error(
                "task_failed",
                task_name=message.task_name,
                task_id=message.task_id,
                error=str(result.error),
                execution_time=result.execution_time,
            )
        else:
            logger.info(
                "task_completed",
                task_name=message.task_name,
                task_id=message.task_id,
                execution_time=result.execution_time,
            )
