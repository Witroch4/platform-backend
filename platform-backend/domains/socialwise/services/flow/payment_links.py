"""Payment link generation for flow nodes."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from platform_core.logging.config import get_logger

logger = get_logger(__name__)

INFINITEPAY_API_URL = "https://api.infinitepay.io/invoices/public/checkout/links"
MAX_RETRIES = 3
BASE_DELAY_MS = 800


@dataclass(slots=True)
class PaymentCustomer:
    name: str
    email: str | None = None
    phone: str | None = None


@dataclass(slots=True)
class PaymentLinkRequest:
    handle: str
    amount_cents: int
    description: str
    customer: PaymentCustomer
    order_nsu: str
    webhook_url: str | None = None
    redirect_url: str | None = None


@dataclass(slots=True)
class PaymentLinkResult:
    success: bool
    checkout_url: str | None = None
    link_id: str | None = None
    error: str | None = None


async def generate_payment_link(provider: str, request: PaymentLinkRequest) -> PaymentLinkResult:
    if provider != "infinitepay":
        return PaymentLinkResult(success=False, error=f"Unsupported provider: {provider}")
    payload = {
        "handle": request.handle,
        "items": [
            {
                "quantity": 1,
                "price": request.amount_cents,
                "description": request.description,
            }
        ],
        "order_nsu": request.order_nsu,
    }
    if request.webhook_url:
        payload["webhook_url"] = request.webhook_url
    if request.redirect_url:
        payload["redirect_url"] = request.redirect_url
    payload["customer"] = {
        "name": request.customer.name if len((request.customer.name or "").strip()) >= 3 else "Cliente",
    }
    if request.customer.email:
        payload["customer"]["email"] = request.customer.email
    if request.customer.phone:
        payload["customer"]["phone_number"] = request.customer.phone

    last_error = ""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(INFINITEPAY_API_URL, json=payload)
            if not response.is_success:
                body = response.text[:200]
                last_error = f"InfinitePay API error: {response.status_code} - {body}"
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    return PaymentLinkResult(success=False, error=last_error)
            else:
                data = response.json()
                checkout_url = data.get("checkout_url") or data.get("url") or data.get("link")
                if checkout_url:
                    return PaymentLinkResult(
                        success=True,
                        checkout_url=checkout_url,
                        link_id=data.get("slug") or data.get("id") or request.order_nsu,
                    )
                last_error = "InfinitePay did not return a checkout URL"
        except Exception as exc:
            last_error = str(exc)

        if attempt < MAX_RETRIES:
            await asyncio.sleep(BASE_DELAY_MS / 1000 * (2 ** (attempt - 1)))

    logger.error("payment_link_generation_failed", provider=provider, order_nsu=request.order_nsu, error=last_error)
    return PaymentLinkResult(success=False, error=last_error)
