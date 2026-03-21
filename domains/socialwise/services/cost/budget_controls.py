"""Budget controls for Socialwise cost governance."""

import json
from decimal import Decimal

from redis.asyncio import Redis

from domains.socialwise.db.models.cost_budget import CostBudget
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

BUDGET_CONTROLS_CONFIG = {
    "REDIS_PREFIXES": {
        "INBOX_BLOCKED": "cost:blocked:inbox:",
        "USER_BLOCKED": "cost:blocked:user:",
        "MODEL_DOWNGRADE": "cost:downgrade:",
        "ALERT_SENT": "cost:alert:sent:",
    },
    "TTL": {
        "BLOCK_FLAG": 3600,
        "ALERT_COOLDOWN": 1800,
        "DOWNGRADE_FLAG": 7200,
    },
    "MODEL_DOWNGRADES": {
        "gpt-4o": "gpt-4o-mini",
        "gpt-4": "gpt-3.5-turbo",
        "gpt-4-turbo": "gpt-4o-mini",
    },
    "THRESHOLDS": {
        "SOFT_LIMIT": Decimal("0.8"),
        "HARD_LIMIT": Decimal("1.0"),
        "CRITICAL_LIMIT": Decimal("1.2"),
    },
}


def _redis() -> Redis:
    return Redis.from_url(str(settings.redis_url), decode_responses=True)


async def send_budget_alert(
    budget: CostBudget,
    current_spending: Decimal,
    percentage: Decimal,
    alert_type: str,
    redis_client: Redis | None = None,
) -> bool:
    redis = redis_client or _redis()
    alert_key = f"{BUDGET_CONTROLS_CONFIG['REDIS_PREFIXES']['ALERT_SENT']}{budget.id}:{alert_type}"

    if await redis.get(alert_key):
        return False

    payload = {
        "budgetId": budget.id,
        "budgetName": budget.name,
        "currentSpending": str(current_spending),
        "limitUSD": str(budget.limit_usd),
        "percentage": str(percentage),
        "period": budget.period,
        "inboxId": budget.inbox_id,
        "userId": budget.user_id,
        "type": alert_type,
    }
    await redis.setex(
        alert_key,
        BUDGET_CONTROLS_CONFIG["TTL"]["ALERT_COOLDOWN"],
        json.dumps(payload),
    )
    logger.warning("socialwise_budget_alert_sent", **payload)
    return True


async def apply_budget_controls(
    budget: CostBudget,
    percentage: Decimal,
    redis_client: Redis | None = None,
) -> None:
    redis = redis_client or _redis()
    thresholds = BUDGET_CONTROLS_CONFIG["THRESHOLDS"]
    ttl = BUDGET_CONTROLS_CONFIG["TTL"]
    prefixes = BUDGET_CONTROLS_CONFIG["REDIS_PREFIXES"]

    if percentage >= thresholds["CRITICAL_LIMIT"]:
        if budget.inbox_id:
            await redis.setex(f"{prefixes['INBOX_BLOCKED']}{budget.inbox_id}", ttl["BLOCK_FLAG"], budget.id)
        if budget.user_id:
            await redis.setex(f"{prefixes['USER_BLOCKED']}{budget.user_id}", ttl["BLOCK_FLAG"], budget.id)

    if percentage >= thresholds["HARD_LIMIT"]:
        await redis.setex(f"{prefixes['MODEL_DOWNGRADE']}{budget.id}", ttl["DOWNGRADE_FLAG"], budget.id)


async def remove_budget_controls(budget: CostBudget, redis_client: Redis | None = None) -> None:
    redis = redis_client or _redis()
    prefixes = BUDGET_CONTROLS_CONFIG["REDIS_PREFIXES"]
    keys: list[str] = [f"{prefixes['MODEL_DOWNGRADE']}{budget.id}"]

    if budget.inbox_id:
        keys.append(f"{prefixes['INBOX_BLOCKED']}{budget.inbox_id}")
    if budget.user_id:
        keys.append(f"{prefixes['USER_BLOCKED']}{budget.user_id}")

    await redis.delete(*keys)


async def is_inbox_blocked(inbox_id: str, redis_client: Redis | None = None) -> bool:
    redis = redis_client or _redis()
    return bool(await redis.get(f"{BUDGET_CONTROLS_CONFIG['REDIS_PREFIXES']['INBOX_BLOCKED']}{inbox_id}"))


async def is_user_blocked(user_id: str, redis_client: Redis | None = None) -> bool:
    redis = redis_client or _redis()
    return bool(await redis.get(f"{BUDGET_CONTROLS_CONFIG['REDIS_PREFIXES']['USER_BLOCKED']}{user_id}"))


async def get_downgraded_model(
    original_model: str,
    budget_id: str,
    redis_client: Redis | None = None,
) -> str:
    redis = redis_client or _redis()
    downgrade_key = f"{BUDGET_CONTROLS_CONFIG['REDIS_PREFIXES']['MODEL_DOWNGRADE']}{budget_id}"
    if not await redis.get(downgrade_key):
        return original_model
    return BUDGET_CONTROLS_CONFIG["MODEL_DOWNGRADES"].get(original_model, original_model)
