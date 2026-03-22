"""Pricing service for Socialwise cost events."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.cost_event import CostEvent, EventStatus
from domains.socialwise.db.models.price_card import PriceCard

TOKEN_UNITS = {"TOKENS_IN", "TOKENS_OUT", "TOKENS_CACHED"}


@dataclass(slots=True, frozen=True)
class ResolvedPrice:
    price_per_unit: Decimal
    currency: str
    price_card_id: str
    effective_from: datetime
    effective_to: datetime | None
    region: str | None
    is_regional_price: bool


def calculate_cost(units: Decimal, unit_price: Decimal, unit: str) -> Decimal:
    """Calculate a final cost from units and unit price."""

    if unit in TOKEN_UNITS or unit.startswith("TOKENS_"):
        return (units / Decimal("1000000")) * unit_price
    return units * unit_price


class PricingService:
    """Resolve price cards with a small in-memory TTL cache."""

    CACHE_TTL_SECONDS = 300

    def __init__(self, session: AsyncSession):
        self.session = session
        self._price_cache: dict[str, tuple[datetime, ResolvedPrice]] = {}

    def _cache_key(
        self,
        provider: str,
        product: str,
        unit: str,
        when: datetime,
        region: str | None,
    ) -> str:
        date_str = when.astimezone(timezone.utc).date().isoformat()
        return f"{provider}:{product}:{unit}:{date_str}:{region or 'global'}"

    def _get_cached(self, key: str) -> ResolvedPrice | None:
        cached = self._price_cache.get(key)
        if cached is None:
            return None

        cached_at, resolved_price = cached
        age_seconds = (datetime.now(timezone.utc) - cached_at).total_seconds()
        if age_seconds >= self.CACHE_TTL_SECONDS:
            self._price_cache.pop(key, None)
            return None
        return resolved_price

    async def resolve_unit_price(
        self,
        provider: str,
        product: str,
        unit: str,
        when: datetime,
        region: str | None = None,
    ) -> ResolvedPrice | None:
        cache_key = self._cache_key(provider, product, unit, when, region)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        price_card = await self._find_best_price_card(provider, product, unit, when, region)
        if price_card is None:
            return None

        resolved_price = ResolvedPrice(
            price_per_unit=Decimal(str(price_card.price_per_unit)),
            currency=price_card.currency,
            price_card_id=price_card.id,
            effective_from=price_card.effective_from,
            effective_to=price_card.effective_to,
            region=price_card.region,
            is_regional_price=price_card.region is not None,
        )
        self._price_cache[cache_key] = (datetime.now(timezone.utc), resolved_price)
        return resolved_price

    async def _find_best_price_card(
        self,
        provider: str,
        product: str,
        unit: str,
        when: datetime,
        region: str | None,
    ) -> PriceCard | None:
        base_where = [
            PriceCard.provider == provider,
            PriceCard.product == product,
            PriceCard.unit == unit,
            PriceCard.effective_from <= when,
            or_(PriceCard.effective_to.is_(None), PriceCard.effective_to >= when),
        ]

        if region:
            regional_stmt = (
                select(PriceCard)
                .where(*base_where, PriceCard.region == region)
                .order_by(PriceCard.effective_from.desc())
                .limit(1)
            )
            regional = (await self.session.execute(regional_stmt)).scalar_one_or_none()
            if regional is not None:
                return regional

        global_stmt = (
            select(PriceCard)
            .where(*base_where, PriceCard.region.is_(None))
            .order_by(PriceCard.effective_from.desc())
            .limit(1)
        )
        return (await self.session.execute(global_stmt)).scalar_one_or_none()

    async def process_pending_pricing_events(self, limit: int = 100) -> dict[str, int]:
        stmt = (
            select(CostEvent)
            .where(CostEvent.status == EventStatus.PENDING_PRICING.value)
            .order_by(CostEvent.ts.asc())
            .limit(limit)
        )
        events = list((await self.session.execute(stmt)).scalars().all())

        processed = 0
        unresolved = 0
        for event in events:
            resolved = await self.resolve_unit_price(
                provider=event.provider,
                product=event.product,
                unit=event.unit,
                when=event.ts,
            )
            if resolved is None:
                unresolved += 1
                continue

            event.unit_price = resolved.price_per_unit
            event.currency = resolved.currency
            event.cost = calculate_cost(Decimal(str(event.units)), resolved.price_per_unit, event.unit)
            event.status = EventStatus.PRICED.value
            processed += 1

        return {
            "processed": processed,
            "unresolved": unresolved,
            "total": len(events),
        }


async def process_pending_pricing_events(session: AsyncSession, limit: int = 100) -> dict[str, int]:
    service = PricingService(session)
    return await service.process_pending_pricing_events(limit)
