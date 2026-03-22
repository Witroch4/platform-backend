"""TaskIQ broker for Socialwise domain. Queue: socialwise:tasks."""

from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend

from platform_core.config import settings
from platform_core.tasks.middleware import LoggingMiddleware

result_backend = RedisAsyncResultBackend(
    redis_url=str(settings.redis_url),
    max_connection_pool_size=settings.redis_max_connections,
)

broker_sw = ListQueueBroker(
    url=str(settings.redis_url),
    max_connection_pool_size=settings.redis_max_connections,
    queue_name="socialwise:tasks",
).with_result_backend(result_backend)

broker_sw.add_middlewares(LoggingMiddleware())
