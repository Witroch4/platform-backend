"""TaskIQ broker for JusMonitorIA domain. Queue: jusmonitoria:tasks."""

from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend

from platform_core.config import settings
from platform_core.tasks.middleware import LoggingMiddleware

result_backend = RedisAsyncResultBackend(
    redis_url=str(settings.redis_url),
    max_connection_pool_size=settings.redis_max_connections,
)

broker_jm = ListQueueBroker(
    url=str(settings.redis_url),
    max_connection_pool_size=settings.redis_max_connections,
    queue_name="jusmonitoria:tasks",
).with_result_backend(result_backend)

broker_jm.add_middlewares(LoggingMiddleware())
