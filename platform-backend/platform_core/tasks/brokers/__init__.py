"""Domain-specific TaskIQ brokers. Each domain gets its own Redis list queue."""

from platform_core.tasks.brokers.jusmonitoria import broker_jm
from platform_core.tasks.brokers.platform_broker import broker_platform
from platform_core.tasks.brokers.socialwise import broker_sw

__all__ = ["broker_jm", "broker_sw", "broker_platform"]
