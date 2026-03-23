"""Platform-wide Prometheus metrics (shared across domains)."""

from prometheus_client import Counter, Histogram

# HTTP Request metrics (used by platform_core.middleware.metrics)
http_request_duration_seconds = Histogram(
    "platform_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path", "status_code"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

http_request_count = Counter(
    "platform_http_request_count",
    "Total HTTP request count",
    ["method", "path", "status_code"],
)

http_error_rate = Counter(
    "platform_http_error_rate",
    "HTTP error count by type",
    ["method", "path", "error_type"],
)
