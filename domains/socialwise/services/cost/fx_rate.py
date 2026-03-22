"""Robust USD/BRL FX rate service for Socialwise costs."""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.fx_rate import FxRate
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


@dataclass(slots=True, frozen=True)
class FxRateData:
    date: datetime
    base: str
    quote: str
    rate: Decimal


class FxRateService:
    FALLBACK_RATE = Decimal("5.5")
    BASE = "USD"
    QUOTE = "BRL"
    REQUEST_TIMEOUT_SECONDS = 10.0
    RETRIES = 2

    def __init__(self, session: AsyncSession):
        self.session = session

    async def _fetch_json(self, url: str) -> Any:
        async with httpx.AsyncClient(
            timeout=self.REQUEST_TIMEOUT_SECONDS,
            headers={
                "Accept": "application/json",
                "User-Agent": "PlatformBackend/Socialwise/1.0",
            },
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async def _try_with_retries(self, callback, label: str) -> Decimal:
        last_error: Exception | None = None
        for attempt in range(self.RETRIES + 1):
            try:
                return await callback()
            except Exception as exc:  # pragma: no cover - network variability
                last_error = exc
                logger.warning(
                    "fx_rate_provider_retry",
                    provider=label,
                    attempt=attempt + 1,
                    max_attempts=self.RETRIES + 1,
                    error=str(exc),
                )
                if attempt < self.RETRIES:
                    await asyncio.sleep(0.25 * (attempt + 1))

        assert last_error is not None
        raise last_error

    async def _from_open_er_api(self) -> Decimal:
        data = await self._fetch_json(f"https://open.er-api.com/v6/latest/{self.BASE}")
        if data.get("result") != "success":
            raise ValueError(f"ER-API result={data.get('result')}")
        return Decimal(str(data["rates"][self.QUOTE]))

    async def _from_exchange_rate_host(self) -> Decimal:
        data = await self._fetch_json(
            f"https://api.exchangerate.host/latest?base={self.BASE}&symbols={self.QUOTE}"
        )
        return Decimal(str(data["rates"][self.QUOTE]))

    async def _from_awesome_api(self) -> Decimal:
        data = await self._fetch_json(f"https://economia.awesomeapi.com.br/last/{self.BASE}-{self.QUOTE}")
        rate = data.get("USDBRL", {}).get("ask") or data.get("USDBRL", {}).get("bid")
        if rate is None:
            raise ValueError("AwesomeAPI missing BRL rate")
        return Decimal(str(rate))

    @staticmethod
    def _format_date_to_bacen(date_value: datetime) -> str:
        return date_value.strftime("%m-%d-%Y")

    async def _from_bacen_ptax(self, target: datetime | None = None) -> Decimal:
        date_cursor = target or datetime.now(timezone.utc)
        for _ in range(7):
            formatted_date = self._format_date_to_bacen(date_cursor)
            url = (
                "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
                f"CotacaoDolarDia(dataCotacao='{formatted_date}')?$format=json"
            )
            data = await self._fetch_json(url)
            values = data.get("value", [])
            if values:
                last_value = values[-1]
                return Decimal(str(last_value["cotacaoVenda"]))

            date_cursor = date_cursor - timedelta(days=1)

        raise ValueError("PTAX sem dados recentes")

    async def fetch_current_rate(self) -> Decimal:
        providers = [
            ("open.er-api", self._from_open_er_api),
            ("exchangerate.host", self._from_exchange_rate_host),
            ("awesomeapi", self._from_awesome_api),
            ("bacen-ptax", self._from_bacen_ptax),
        ]

        for name, provider_fn in providers:
            try:
                rate = await self._try_with_retries(provider_fn, name)
                logger.info("fx_rate_provider_success", provider=name, rate=str(rate))
                return rate
            except Exception as exc:  # pragma: no cover - network variability
                logger.warning("fx_rate_provider_failed", provider=name, error=str(exc))

        latest_rate = await self.get_latest_stored_rate()
        if latest_rate is not None:
            logger.warning(
                "fx_rate_fallback_latest_stored",
                rate=str(latest_rate.rate),
                date=latest_rate.date.isoformat(),
            )
            return latest_rate.rate

        logger.warning("fx_rate_fallback_constant", rate=str(self.FALLBACK_RATE))
        return self.FALLBACK_RATE

    async def store_rate(self, rate: Decimal, date_value: datetime | None = None) -> FxRate:
        normalized_date = (date_value or datetime.now(timezone.utc)).astimezone(timezone.utc)
        normalized_date = normalized_date.replace(hour=0, minute=0, second=0, microsecond=0)

        stmt = select(FxRate).where(
            FxRate.date == normalized_date,
            FxRate.base == self.BASE,
            FxRate.quote == self.QUOTE,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is None:
            existing = FxRate(
                date=normalized_date,
                base=self.BASE,
                quote=self.QUOTE,
                rate=rate,
            )
            self.session.add(existing)
        else:
            existing.rate = rate

        await self.session.flush()
        return existing

    async def update_current_rate(self) -> Decimal:
        rate = await self.fetch_current_rate()
        await self.store_rate(rate)
        return rate

    async def get_rate_for_date(self, date_value: datetime) -> Decimal:
        normalized_date = date_value.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        exact_stmt = select(FxRate).where(
            FxRate.date == normalized_date,
            FxRate.base == self.BASE,
            FxRate.quote == self.QUOTE,
        )
        exact_match = (await self.session.execute(exact_stmt)).scalar_one_or_none()
        if exact_match is not None:
            return Decimal(str(exact_match.rate))

        cutoff = normalized_date - timedelta(days=7)
        nearby_stmt = (
            select(FxRate)
            .where(
                FxRate.base == self.BASE,
                FxRate.quote == self.QUOTE,
                FxRate.date >= cutoff,
                FxRate.date <= normalized_date,
            )
            .order_by(FxRate.date.desc())
            .limit(1)
        )
        nearby_match = (await self.session.execute(nearby_stmt)).scalar_one_or_none()
        if nearby_match is not None:
            return Decimal(str(nearby_match.rate))

        try:
            ptax_rate = await self._from_bacen_ptax(normalized_date)
            await self.store_rate(ptax_rate, normalized_date)
            return ptax_rate
        except Exception:  # pragma: no cover - network variability
            return await self.fetch_current_rate()

    async def get_latest_stored_rate(self) -> FxRateData | None:
        stmt = (
            select(FxRate)
            .where(FxRate.base == self.BASE, FxRate.quote == self.QUOTE)
            .order_by(FxRate.date.desc())
            .limit(1)
        )
        fx_rate = (await self.session.execute(stmt)).scalar_one_or_none()
        if fx_rate is None:
            return None
        return FxRateData(
            date=fx_rate.date,
            base=fx_rate.base,
            quote=fx_rate.quote,
            rate=Decimal(str(fx_rate.rate)),
        )

    async def cleanup_old_rates(self, days_to_keep: int = 365) -> int:
        cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
            days=days_to_keep
        )
        result = await self.session.execute(
            delete(FxRate).where(
                FxRate.base == self.BASE,
                FxRate.quote == self.QUOTE,
                FxRate.date < cutoff,
            )
        )
        return result.rowcount or 0
