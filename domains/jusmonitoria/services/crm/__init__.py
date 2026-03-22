"""CRM services package."""

from domains.jusmonitoria.services.crm.health_dashboard import HealthDashboardService
from domains.jusmonitoria.services.crm.timeline import TimelineService

__all__ = [
    "TimelineService",
    "HealthDashboardService",
]
