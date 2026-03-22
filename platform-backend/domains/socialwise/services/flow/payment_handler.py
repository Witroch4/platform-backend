"""Payment confirmed handler for Socialwise payment webhook events."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select

from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_payment import (
    LeadPayment,
    PaymentServiceType,
    PaymentStatus,
)
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.orchestrator import FlowOrchestrator
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


async def handle_payment_confirmed(
    payload: dict[str, Any],
    trace_id: str | None = None,
) -> dict[str, Any]:
    data = payload.get("data") or {}
    contact = data.get("contact") or {}
    order_nsu = str(data.get("order_nsu") or "").strip()

    if order_nsu:
        async with session_ctx() as db:
            existing = (
                await db.execute(select(LeadPayment).where(LeadPayment.external_id == order_nsu))
            ).scalars().first()
            if existing:
                return {
                    "ok": True,
                    "skipped": True,
                    "leadId": existing.lead_id,
                    "paymentId": existing.id,
                }

    phone_digits = "".join(ch for ch in str(contact.get("phone_number") or "") if ch.isdigit())
    if not phone_digits:
        return {"ok": True, "skipped": True, "reason": "missing_contact_phone"}

    async with session_ctx() as db:
        lead = (
            await db.execute(
                select(Lead).where(
                    Lead.source == "CHATWIT_OAB",
                    or_(
                        Lead.phone.ilike(f"%{phone_digits}%"),
                        Lead.source_identifier.ilike(f"%{phone_digits}%"),
                    ),
                )
            )
        ).scalars().first()
        if not lead:
            logger.warning("payment_confirmed_lead_not_found", phone_digits=phone_digits, trace_id=trace_id)
            return {"ok": True, "skipped": True}

        payment = LeadPayment(
            lead_id=lead.id,
            amount_cents=int(data.get("amount_cents") or 0),
            paid_amount_cents=int(data.get("paid_amount_cents") or 0) or None,
            service_type=PaymentServiceType.OUTRO.value,
            status=PaymentStatus.CONFIRMED.value,
            capture_method=str(data.get("capture_method") or ""),
            receipt_url=data.get("receipt_url"),
            external_id=order_nsu or None,
            confirmed_by="webhook",
            chatwit_conversation_id=int(data.get("conversation_id") or 0) or None,
            contact_phone=str(contact.get("phone_number") or ""),
            metadata_json=payload,
        )
        db.add(payment)

        tags = list(lead.tags or [])
        if "pago" not in tags:
            lead.tags = [*tags, "pago"]

        await db.commit()
        await db.refresh(payment)

    try:
        conversation_id = str(data.get("conversation_id") or "").strip()
        if conversation_id and conversation_id != "0":
            orchestrator = FlowOrchestrator()
            await orchestrator.resume_from_payment(conversation_id, order_nsu, trace_id)
    except Exception as exc:
        logger.warning("payment_confirmed_resume_failed", error=str(exc), trace_id=trace_id)

    return {"ok": True, "leadId": lead.id, "paymentId": payment.id}
