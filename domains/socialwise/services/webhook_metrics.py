"""Prometheus metrics for the Socialwise webhook cutover."""

from __future__ import annotations

from prometheus_client import Counter, Histogram

socialwise_webhook_requests_total = Counter(
    "socialwise_webhook_requests_total",
    "Total Socialwise webhook requests handled by FastAPI",
    ["outcome", "status_code"],
)

socialwise_webhook_dedup_total = Counter(
    "socialwise_webhook_dedup_total",
    "Total Socialwise webhook dedup hits",
    ["kind"],
)

socialwise_webhook_processing_seconds = Histogram(
    "socialwise_webhook_processing_seconds",
    "Socialwise webhook processing time in seconds",
    ["outcome"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)


def observe_webhook_result(
    *,
    outcome: str,
    status_code: int,
    duration_seconds: float,
    dedup_kind: str | None = None,
) -> None:
    socialwise_webhook_requests_total.labels(outcome=outcome, status_code=str(status_code)).inc()
    socialwise_webhook_processing_seconds.labels(outcome=outcome).observe(max(duration_seconds, 0.0))
    if dedup_kind:
        socialwise_webhook_dedup_total.labels(kind=dedup_kind).inc()
