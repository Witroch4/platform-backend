"""Event system for async task processing."""

from domains.jusmonitoria.tasks.events.bus import publish, subscribe
from domains.jusmonitoria.tasks.events.types import (
    BaseEvent,
    ClientCreatedEvent,
    ClientUpdatedEvent,
    DeadlineApproachingEvent,
    DeadlineMissedEvent,
    EventType,
    LeadConvertedEvent,
    LeadCreatedEvent,
    LeadQualifiedEvent,
    LeadStageChangedEvent,
    MessageReceivedEvent,
    MovementDetectedEvent,
    ProcessCreatedEvent,
    ProcessUpdatedEvent,
    WebhookReceivedEvent,
)

__all__ = [
    # Event bus functions
    "publish",
    "subscribe",
    # Event types
    "EventType",
    "BaseEvent",
    "WebhookReceivedEvent",
    "MessageReceivedEvent",
    "LeadCreatedEvent",
    "LeadQualifiedEvent",
    "LeadConvertedEvent",
    "LeadStageChangedEvent",
    "ClientCreatedEvent",
    "ClientUpdatedEvent",
    "ProcessCreatedEvent",
    "ProcessUpdatedEvent",
    "MovementDetectedEvent",
    "DeadlineApproachingEvent",
    "DeadlineMissedEvent",
]
