"""Prometheus metrics for monitoring."""

from prometheus_client import Counter, Gauge, Histogram, generate_latest
from prometheus_client.core import CollectorRegistry

# Create a custom registry to avoid conflicts
registry = CollectorRegistry()

# HTTP Request metrics
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path", "status_code"],
    registry=registry,
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

http_request_count = Counter(
    "http_request_count",
    "Total HTTP request count",
    ["method", "path", "status_code"],
    registry=registry,
)

http_error_rate = Counter(
    "http_error_rate",
    "HTTP error count by type",
    ["method", "path", "error_type"],
    registry=registry,
)

# Business metrics - Leads
leads_created_total = Counter(
    "leads_created_total",
    "Total number of leads created",
    ["tenant_id", "source"],
    registry=registry,
)

leads_converted_total = Counter(
    "leads_converted_total",
    "Total number of leads converted to clients",
    ["tenant_id"],
    registry=registry,
)

leads_by_stage = Gauge(
    "leads_by_stage",
    "Number of leads by stage",
    ["tenant_id", "stage"],
    registry=registry,
)

# Business metrics - Cases
cases_created_total = Counter(
    "cases_created_total",
    "Total number of legal cases created",
    ["tenant_id"],
    registry=registry,
)

cases_updated_total = Counter(
    "cases_updated_total",
    "Total number of legal cases updated",
    ["tenant_id", "update_type"],
    registry=registry,
)

cases_by_status = Gauge(
    "cases_by_status",
    "Number of cases by status",
    ["tenant_id", "status"],
    registry=registry,
)

# Business metrics - Movements
movements_detected_total = Counter(
    "movements_detected_total",
    "Total number of case movements detected",
    ["tenant_id", "is_important"],
    registry=registry,
)

movements_requiring_action = Gauge(
    "movements_requiring_action",
    "Number of movements requiring action",
    ["tenant_id"],
    registry=registry,
)

# AI metrics
ai_requests_total = Counter(
    "ai_requests_total",
    "Total AI requests",
    ["tenant_id", "agent_type", "provider"],
    registry=registry,
)

ai_request_duration_seconds = Histogram(
    "ai_request_duration_seconds",
    "AI request duration in seconds",
    ["agent_type", "provider"],
    registry=registry,
    buckets=(0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0),
)

ai_errors_total = Counter(
    "ai_errors_total",
    "Total AI errors",
    ["tenant_id", "agent_type", "provider", "error_type"],
    registry=registry,
)

# Embedding metrics
embeddings_generated_total = Counter(
    "embeddings_generated_total",
    "Total embeddings generated",
    ["tenant_id", "model"],
    registry=registry,
)

embeddings_generation_duration_seconds = Histogram(
    "embeddings_generation_duration_seconds",
    "Embedding generation duration in seconds",
    ["model"],
    registry=registry,
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 5.0),
)

# DataJud integration metrics
datajud_requests_total = Counter(
    "datajud_requests_total",
    "Total DataJud API requests",
    ["tenant_id", "status"],
    registry=registry,
)

datajud_request_duration_seconds = Histogram(
    "datajud_request_duration_seconds",
    "DataJud API request duration in seconds",
    registry=registry,
    buckets=(0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)

datajud_rate_limit_remaining = Gauge(
    "datajud_rate_limit_remaining",
    "Remaining DataJud API quota",
    ["tenant_id"],
    registry=registry,
)

# Chatwit integration metrics
chatwit_webhooks_received_total = Counter(
    "chatwit_webhooks_received_total",
    "Total Chatwit webhooks received",
    ["event_type"],
    registry=registry,
)

chatwit_messages_sent_total = Counter(
    "chatwit_messages_sent_total",
    "Total messages sent via Chatwit",
    ["tenant_id", "channel", "status"],
    registry=registry,
)

# Task queue metrics
taskiq_tasks_enqueued_total = Counter(
    "taskiq_tasks_enqueued_total",
    "Total tasks enqueued",
    ["task_name"],
    registry=registry,
)

taskiq_task_enqueue_failures_total = Counter(
    "taskiq_task_enqueue_failures_total",
    "Total task enqueue failures",
    ["task_name", "error_type"],
    registry=registry,
)

taskiq_tasks_completed_total = Counter(
    "taskiq_tasks_completed_total",
    "Total tasks completed",
    ["task_name", "status"],
    registry=registry,
)

taskiq_task_duration_seconds = Histogram(
    "taskiq_task_duration_seconds",
    "Task execution duration in seconds",
    ["task_name"],
    registry=registry,
    buckets=(0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0),
)

# Database metrics
db_query_duration_seconds = Histogram(
    "db_query_duration_seconds",
    "Database query duration in seconds",
    ["operation", "table"],
    registry=registry,
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

db_connections_active = Gauge(
    "db_connections_active",
    "Number of active database connections",
    registry=registry,
)

db_connections_idle = Gauge(
    "db_connections_idle",
    "Number of idle database connections",
    registry=registry,
)

# Cache metrics
cache_hits_total = Counter(
    "cache_hits_total",
    "Total cache hits",
    ["cache_type"],
    registry=registry,
)

cache_misses_total = Counter(
    "cache_misses_total",
    "Total cache misses",
    ["cache_type"],
    registry=registry,
)


def get_metrics() -> bytes:
    """
    Generate Prometheus metrics in text format.
    
    Returns:
        Metrics in Prometheus exposition format
    """
    return generate_latest(registry)
