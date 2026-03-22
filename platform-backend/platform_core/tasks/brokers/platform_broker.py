"""TaskIQ broker for shared platform tasks. Queue: platform:tasks."""

from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend

from platform_core.config import settings
from platform_core.tasks.middleware import LoggingMiddleware

result_backend = RedisAsyncResultBackend(
    redis_url=str(settings.redis_url),
    max_connection_pool_size=settings.redis_max_connections,
)

broker_platform = ListQueueBroker(
    url=str(settings.redis_url),
    max_connection_pool_size=settings.redis_max_connections,
    queue_name="platform:tasks",
).with_result_backend(result_backend)

broker_platform.add_middlewares(LoggingMiddleware())
