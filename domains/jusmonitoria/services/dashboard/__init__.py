"""Dashboard services."""

from domains.jusmonitoria.services.dashboard.aggregator import DashboardAggregator
from domains.jusmonitoria.services.dashboard.metrics import MetricsCalculator

__all__ = ["DashboardAggregator", "MetricsCalculator"]

