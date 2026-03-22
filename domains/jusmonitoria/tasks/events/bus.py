"""Event bus implementation with at-least-once delivery guarantees."""

import json
from datetime import datetime
from typing import Any, Callable
from uuid import UUID

import structlog
from redis.asyncio import Redis

from platform_core.config import settings
from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
from domains.jusmonitoria.tasks.events.types import BaseEvent, EventType

logger = structlog.get_logger(__name__)

# Event handlers registry
_event_handlers: dict[EventType, list[Callable]] = {}

# Dead letter queue configuration
DLQ_KEY_PREFIX = "jusmonitoria:dlq"
DLQ_MAX_RETRIES = 3
DLQ_RETRY_DELAY_SECONDS = 60


class EventBusError(Exception):
    """Base exception for event bus errors."""

    pass


async def publish(event: BaseEvent) -> None:
    """
    Publish an event to the event bus.
    
    Events are processed asynchronously with at-least-once delivery guarantees.
    Failed events are retried with exponential backoff and moved to DLQ after max retries.
    
    Args:
        event: The event to publish
        
    Raises:
        EventBusError: If event publishing fails
    """
    try:
        # Serialize event to dict
        event_data = event.model_dump(mode="json")
        
        # Convert UUID and datetime to strings for JSON serialization
        event_data = _serialize_event_data(event_data)
        
        # Enqueue event processing task
        await _process_event.kiq(
            event_type=event.event_type.value,
            event_data=event_data,
            retry_count=0,
        )
        
        logger.info(
            "event_published",
            event_id=str(event.event_id),
            event_type=event.event_type.value,
            tenant_id=str(event.tenant_id),
        )
        
    except Exception as e:
        logger.error(
            "event_publish_failed",
            event_id=str(event.event_id),
            event_type=event.event_type.value,
            error=str(e),
        )
        raise EventBusError(f"Failed to publish event: {e}") from e


def subscribe(event_type: EventType):
    """
    Decorator to register an event handler.
    
    Example:
        @subscribe(EventType.LEAD_CREATED)
        async def handle_lead_created(event: LeadCreatedEvent):
            # Process event
            pass
    
    Args:
        event_type: The event type to subscribe to
    """

    def decorator(handler: Callable):
        if event_type not in _event_handlers:
            _event_handlers[event_type] = []
        
        _event_handlers[event_type].append(handler)
        
        logger.info(
            "event_handler_registered",
            event_type=event_type.value,
            handler=handler.__name__,
        )
        
        return handler

    return decorator


@broker.task(
    retry_on_error=True,
    max_retries=DLQ_MAX_RETRIES,
    retry_delay=DLQ_RETRY_DELAY_SECONDS,
)
async def _process_event(
    event_type: str,
    event_data: dict[str, Any],
    retry_count: int = 0,
) -> None:
    """
    Process an event by calling all registered handlers.
    
    This is an internal task that should not be called directly.
    Use publish() to send events to the bus.
    
    Args:
        event_type: The type of event
        event_data: The event data
        retry_count: Current retry attempt
    """
    try:
        # Get handlers for this event type
        event_type_enum = EventType(event_type)
        handlers = _event_handlers.get(event_type_enum, [])
        
        if not handlers:
            logger.warning(
                "no_handlers_registered",
                event_type=event_type,
                event_id=event_data.get("event_id"),
            )
            return
        
        # Call all handlers
        for handler in handlers:
            try:
                await handler(event_data)
                
                logger.info(
                    "event_handler_executed",
                    event_type=event_type,
                    event_id=event_data.get("event_id"),
                    handler=handler.__name__,
                )
                
            except Exception as e:
                logger.error(
                    "event_handler_failed",
                    event_type=event_type,
                    event_id=event_data.get("event_id"),
                    handler=handler.__name__,
                    error=str(e),
                    retry_count=retry_count,
                )
                
                # Re-raise to trigger task retry
                raise
        
    except Exception as e:
        # If we've exhausted retries, move to DLQ
        if retry_count >= DLQ_MAX_RETRIES:
            await _move_to_dlq(event_type, event_data, str(e))
        
        raise


async def _move_to_dlq(
    event_type: str,
    event_data: dict[str, Any],
    error: str,
) -> None:
    """
    Move a failed event to the dead letter queue.
    
    Args:
        event_type: The type of event
        event_data: The event data
        error: The error message
    """
    try:
        redis = Redis.from_url(str(settings.redis_url))
        
        dlq_entry = {
            "event_type": event_type,
            "event_data": event_data,
            "error": error,
            "failed_at": datetime.utcnow().isoformat(),
            "retries_exhausted": DLQ_MAX_RETRIES,
        }
        
        # Store in Redis sorted set with timestamp as score
        dlq_key = f"{DLQ_KEY_PREFIX}:{event_type}"
        timestamp = datetime.utcnow().timestamp()
        
        await redis.zadd(
            dlq_key,
            {json.dumps(dlq_entry): timestamp},
        )
        
        logger.error(
            "event_moved_to_dlq",
            event_type=event_type,
            event_id=event_data.get("event_id"),
            error=error,
        )
        
        await redis.close()
        
    except Exception as e:
        logger.error(
            "dlq_storage_failed",
            event_type=event_type,
            event_id=event_data.get("event_id"),
            error=str(e),
        )


async def get_dlq_events(
    event_type: EventType | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Retrieve events from the dead letter queue.
    
    Args:
        event_type: Optional event type to filter by
        limit: Maximum number of events to retrieve
        
    Returns:
        List of failed events
    """
    try:
        redis = Redis.from_url(str(settings.redis_url))
        
        if event_type:
            dlq_key = f"{DLQ_KEY_PREFIX}:{event_type.value}"
            keys = [dlq_key]
        else:
            # Get all DLQ keys
            pattern = f"{DLQ_KEY_PREFIX}:*"
            keys = await redis.keys(pattern)
        
        events = []
        for key in keys:
            # Get events from sorted set (newest first)
            entries = await redis.zrevrange(key, 0, limit - 1)
            
            for entry in entries:
                try:
                    events.append(json.loads(entry))
                except json.JSONDecodeError:
                    logger.error("dlq_entry_parse_failed", entry=entry)
        
        await redis.close()
        
        return events[:limit]
        
    except Exception as e:
        logger.error("dlq_retrieval_failed", error=str(e))
        return []


async def retry_dlq_event(event_id: str) -> bool:
    """
    Retry a failed event from the dead letter queue.
    
    Args:
        event_id: The event ID to retry
        
    Returns:
        True if event was found and retried, False otherwise
    """
    try:
        redis = Redis.from_url(str(settings.redis_url))
        
        # Search all DLQ keys for the event
        pattern = f"{DLQ_KEY_PREFIX}:*"
        keys = await redis.keys(pattern)
        
        for key in keys:
            entries = await redis.zrange(key, 0, -1)
            
            for entry in entries:
                try:
                    dlq_entry = json.loads(entry)
                    
                    if dlq_entry["event_data"].get("event_id") == event_id:
                        # Remove from DLQ
                        await redis.zrem(key, entry)
                        
                        # Re-publish event
                        await _process_event.kiq(
                            event_type=dlq_entry["event_type"],
                            event_data=dlq_entry["event_data"],
                            retry_count=0,
                        )
                        
                        logger.info("dlq_event_retried", event_id=event_id)
                        
                        await redis.close()
                        return True
                        
                except json.JSONDecodeError:
                    continue
        
        await redis.close()
        return False
        
    except Exception as e:
        logger.error("dlq_retry_failed", event_id=event_id, error=str(e))
        return False


def _serialize_event_data(data: Any) -> Any:
    """
    Recursively serialize event data for JSON compatibility.
    
    Converts UUID and datetime objects to strings.
    
    Args:
        data: The data to serialize
        
    Returns:
        Serialized data
    """
    if isinstance(data, dict):
        return {k: _serialize_event_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_serialize_event_data(item) for item in data]
    elif isinstance(data, UUID):
        return str(data)
    elif isinstance(data, datetime):
        return data.isoformat()
    else:
        return data
