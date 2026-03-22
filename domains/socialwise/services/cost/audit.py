"""Structured audit logging for Socialwise cost processing."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.audit_log import AuditLog
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class CostAuditLogger:
    """Persist cost-related audit events in Socialwise AuditLog."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_event(
        self,
        *,
        event_type: str,
        resource_type: str,
        action: str,
        resource_id: str | None = None,
        user_id: str | None = None,
        session_id: str | None = None,
        inbox_id: str | None = None,
        details: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        severity: str = "INFO",
    ) -> None:
        timestamp = datetime.now(timezone.utc)
        payload = details or {}
        meta = metadata or {}

        log_method = logger.info
        if severity in {"WARN", "WARNING"}:
            log_method = logger.warning
        elif severity in {"ERROR", "CRITICAL"}:
            log_method = logger.error

        log_method(
            "socialwise_cost_audit",
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            severity=severity,
            details=payload,
            metadata=meta,
        )

        audit_user_id = user_id if user_id and user_id != "system" else None
        audit_log = AuditLog(
            user_id=audit_user_id,
            action=f"COST_{action}",
            resource_type=resource_type,
            resource_id=resource_id,
            details={
                "eventType": event_type,
                "severity": severity,
                "details": payload,
                "metadata": meta,
                "sessionId": session_id,
                "inboxId": inbox_id,
                "timestamp": timestamp.isoformat(),
            },
            ip_address=meta.get("ip_address") or meta.get("ipAddress") or "127.0.0.1",
            user_agent=meta.get("user_agent") or meta.get("userAgent") or "PlatformBackend/SocialwiseCost",
        )

        try:
            async with self.session.begin_nested():
                self.session.add(audit_log)
                await self.session.flush()
        except Exception as exc:  # pragma: no cover - audit must not break main flow
            logger.warning(
                "socialwise_cost_audit_persist_failed",
                event_type=event_type,
                resource_type=resource_type,
                error=str(exc),
            )

    async def log_cost_event_created(
        self,
        *,
        event_id: str,
        provider: str,
        product: str,
        units: float,
        session_id: str | None = None,
        inbox_id: str | None = None,
        user_id: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        await self.log_event(
            event_type="COST_EVENT_CREATED",
            user_id=user_id,
            session_id=session_id,
            inbox_id=inbox_id,
            resource_type="COST_EVENT",
            resource_id=event_id,
            action="CREATE",
            details={
                "provider": provider,
                "product": product,
                "units": units,
            },
            metadata={
                "correlation_id": correlation_id,
                "source": "cost_events_task",
            },
        )

    async def log_cost_event_priced(
        self,
        *,
        event_id: str,
        unit_price: float,
        total_cost: float,
        currency: str,
        processing_time_ms: int,
    ) -> None:
        await self.log_event(
            event_type="COST_EVENT_PRICED",
            resource_type="COST_EVENT",
            resource_id=event_id,
            action="PROCESS",
            details={
                "unitPrice": unit_price,
                "totalCost": total_cost,
                "currency": currency,
                "processingTimeMs": processing_time_ms,
            },
            metadata={"source": "cost_events_task"},
        )

    async def log_cost_event_failed(
        self,
        *,
        event_id: str,
        error: str,
        attempts: int,
        will_retry: bool,
    ) -> None:
        await self.log_event(
            event_type="COST_EVENT_FAILED",
            resource_type="COST_EVENT",
            resource_id=event_id,
            action="ERROR",
            details={
                "error": error,
                "attempts": attempts,
                "willRetry": will_retry,
            },
            metadata={"source": "cost_events_task"},
            severity="WARN" if will_retry else "ERROR",
        )

    async def log_budget_exceeded(
        self,
        *,
        budget_id: str,
        name: str,
        limit_usd: float,
        current_spent: float,
        percentage: float,
        inbox_id: str | None = None,
        user_id: str | None = None,
    ) -> None:
        await self.log_event(
            event_type="BUDGET_EXCEEDED",
            user_id=user_id,
            inbox_id=inbox_id,
            resource_type="BUDGET",
            resource_id=budget_id,
            action="ALERT",
            details={
                "name": name,
                "limitUSD": limit_usd,
                "currentSpent": current_spent,
                "percentage": percentage,
            },
            severity="CRITICAL" if percentage > 1.2 else "ERROR",
        )

    async def log_fx_rate_updated(
        self,
        *,
        base: str,
        quote: str,
        old_rate: float | None,
        new_rate: float,
        date: datetime,
    ) -> None:
        await self.log_event(
            event_type="FX_RATE_UPDATED",
            resource_type="FX_RATE",
            resource_id=f"{base}_{quote}_{date.date().isoformat()}",
            action="UPDATE",
            details={
                "base": base,
                "quote": quote,
                "oldRate": old_rate,
                "newRate": new_rate,
                "date": date.isoformat(),
            },
            metadata={"source": "fx_rate_task"},
        )
