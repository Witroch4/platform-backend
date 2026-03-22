"""TaskIQ scheduler definition for Socialwise tasks."""

from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListRedisScheduleSource

from platform_core.config import settings
from platform_core.tasks.brokers.socialwise import broker_sw

dynamic_schedule_source = ListRedisScheduleSource(
    url=str(settings.redis_url),
    prefix=settings.socialwise_schedule_prefix,
    max_connection_pool_size=settings.redis_max_connections,
    skip_past_schedules=False,
)

scheduler = TaskiqScheduler(
    broker_sw,
    sources=[
        LabelScheduleSource(broker_sw),
        dynamic_schedule_source,
    ],
)
