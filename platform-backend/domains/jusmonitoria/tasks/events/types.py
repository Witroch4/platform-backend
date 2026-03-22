"""Event type definitions for the event bus."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Event types for the system."""

    # Webhook events
    WEBHOOK_RECEIVED = "webhook.received"
    MESSAGE_RECEIVED = "message.received"

    # Lead events
    LEAD_CREATED = "lead.created"
    LEAD_QUALIFIED = "lead.qualified"
    LEAD_CONVERTED = "lead.converted"
    LEAD_STAGE_CHANGED = "lead.stage_changed"

    # Client events
    CLIENT_CREATED = "client.created"
    CLIENT_UPDATED = "client.updated"

    # Process events
    PROCESS_CREATED = "process.created"
    PROCESS_UPDATED = "process.updated"
    MOVEMENT_DETECTED = "movement.detected"
    DEADLINE_APPROACHING = "deadline.approaching"
    DEADLINE_MISSED = "deadline.missed"

    # AI events
    BRIEFING_GENERATED = "briefing.generated"
    DOCUMENT_DRAFTED = "document.drafted"
    EMBEDDING_CREATED = "embedding.created"

    # Contract events
    CONTRATO_CREATED = "contrato.created"
    CONTRATO_ACTIVATED = "contrato.activated"
    CONTRATO_SUSPENDED = "contrato.suspended"
    CONTRATO_CANCELLED = "contrato.cancelled"
    CONTRATO_ENCERRADO = "contrato.encerrado"
    CONTRATO_EXPIRING = "contrato.expiring"

    # Financial events
    FATURA_CREATED = "fatura.created"
    FATURA_PAGA = "fatura.paga"
    FATURA_VENCIDA = "fatura.vencida"

    # Payment webhook events
    PAYMENT_RECEIVED = "payment.received"
    PAYMENT_FAILED = "payment.failed"
    PAYMENT_REFUNDED = "payment.refunded"

    # Cobranca events
    COBRANCA_ENVIADA = "cobranca.enviada"
    COBRANCA_FALHOU = "cobranca.falhou"

    # Notification events
    NOTIFICATION_SENT = "notification.sent"
    NOTIFICATION_FAILED = "notification.failed"


class BaseEvent(BaseModel):
    """Base event model for all events."""

    event_id: UUID = Field(default_factory=uuid4)
    event_type: EventType
    tenant_id: UUID
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


class WebhookReceivedEvent(BaseEvent):
    """Event for received webhooks."""

    event_type: EventType = EventType.WEBHOOK_RECEIVED
    source: str
    payload: dict[str, Any]


class MessageReceivedEvent(BaseEvent):
    """Event for received messages."""

    event_type: EventType = EventType.MESSAGE_RECEIVED
    contact_id: str
    message_id: str
    content: str
    channel: str


class LeadCreatedEvent(BaseEvent):
    """Event for lead creation."""

    event_type: EventType = EventType.LEAD_CREATED
    lead_id: UUID
    source: str
    score: int = 0


class LeadQualifiedEvent(BaseEvent):
    """Event for lead qualification."""

    event_type: EventType = EventType.LEAD_QUALIFIED
    lead_id: UUID
    score: int
    ai_summary: str | None = None


class LeadConvertedEvent(BaseEvent):
    """Event for lead conversion to client."""

    event_type: EventType = EventType.LEAD_CONVERTED
    lead_id: UUID
    client_id: UUID


class LeadStageChangedEvent(BaseEvent):
    """Event for lead stage change."""

    event_type: EventType = EventType.LEAD_STAGE_CHANGED
    lead_id: UUID
    old_stage: str
    new_stage: str


class ClientCreatedEvent(BaseEvent):
    """Event for client creation."""

    event_type: EventType = EventType.CLIENT_CREATED
    client_id: UUID
    from_lead_id: UUID | None = None


class ClientUpdatedEvent(BaseEvent):
    """Event for client update."""

    event_type: EventType = EventType.CLIENT_UPDATED
    client_id: UUID
    changed_fields: list[str]


class ProcessCreatedEvent(BaseEvent):
    """Event for process creation."""

    event_type: EventType = EventType.PROCESS_CREATED
    process_id: UUID
    client_id: UUID
    cnj_number: str


class ProcessUpdatedEvent(BaseEvent):
    """Event for process update."""

    event_type: EventType = EventType.PROCESS_UPDATED
    process_id: UUID
    changed_fields: list[str]


class MovementDetectedEvent(BaseEvent):
    """Event for new process movement detection."""

    event_type: EventType = EventType.MOVEMENT_DETECTED
    process_id: UUID
    movement_id: UUID
    is_important: bool = False
    requires_action: bool = False


class DeadlineApproachingEvent(BaseEvent):
    """Event for approaching deadline."""

    event_type: EventType = EventType.DEADLINE_APPROACHING
    process_id: UUID
    deadline_date: datetime
    days_remaining: int


class DeadlineMissedEvent(BaseEvent):
    """Event for missed deadline."""

    event_type: EventType = EventType.DEADLINE_MISSED
    process_id: UUID
    deadline_date: datetime
    days_overdue: int


class BriefingGeneratedEvent(BaseEvent):
    """Event for generated briefing."""

    event_type: EventType = EventType.BRIEFING_GENERATED
    briefing_id: UUID
    user_id: UUID | None = None


class DocumentDraftedEvent(BaseEvent):
    """Event for drafted document."""

    event_type: EventType = EventType.DOCUMENT_DRAFTED
    document_id: UUID
    document_type: str


class EmbeddingCreatedEvent(BaseEvent):
    """Event for created embedding."""

    event_type: EventType = EventType.EMBEDDING_CREATED
    entity_type: str
    entity_id: UUID
    model: str


class NotificationSentEvent(BaseEvent):
    """Event for sent notification."""

    event_type: EventType = EventType.NOTIFICATION_SENT
    notification_id: UUID
    channel: str
    recipient_id: str


class NotificationFailedEvent(BaseEvent):
    """Event for failed notification."""

    event_type: EventType = EventType.NOTIFICATION_FAILED
    notification_id: UUID
    channel: str
    recipient_id: str
    error: str


class ContratoCreatedEvent(BaseEvent):
    """Event for contract creation."""

    event_type: EventType = EventType.CONTRATO_CREATED
    contrato_id: UUID
    client_id: UUID


class ContratoExpiringEvent(BaseEvent):
    """Event for contract approaching expiration."""

    event_type: EventType = EventType.CONTRATO_EXPIRING
    contrato_id: UUID
    days_remaining: int


class FaturaCreatedEvent(BaseEvent):
    """Event for invoice creation."""

    event_type: EventType = EventType.FATURA_CREATED
    fatura_id: UUID
    contrato_id: UUID
    valor: float


class FaturaPagaEvent(BaseEvent):
    """Event for paid invoice."""

    event_type: EventType = EventType.FATURA_PAGA
    fatura_id: UUID
    contrato_id: UUID
    valor: float


class FaturaVencidaEvent(BaseEvent):
    """Event for overdue invoice."""

    event_type: EventType = EventType.FATURA_VENCIDA
    fatura_id: UUID
    contrato_id: UUID
    dias_atraso: int


class CobrancaEnviadaEvent(BaseEvent):
    """Event for sent collection notice."""

    event_type: EventType = EventType.COBRANCA_ENVIADA
    cobranca_id: UUID
    canal: str
    client_id: UUID


class CobrancaFalhouEvent(BaseEvent):
    """Event for failed collection notice."""

    event_type: EventType = EventType.COBRANCA_FALHOU
    cobranca_id: UUID
    canal: str
    error: str


class PaymentReceivedEvent(BaseEvent):
    """Event for payment received via Chatwit webhook."""

    event_type: EventType = EventType.PAYMENT_RECEIVED
    payment_id: str
    client_id: UUID | None = None
    fatura_id: UUID | None = None
    lancamento_id: UUID | None = None
    amount: float
    payment_method: str | None = None
    source: str = "chatwit"


class PaymentFailedEvent(BaseEvent):
    """Event for failed payment via webhook."""

    event_type: EventType = EventType.PAYMENT_FAILED
    payment_id: str
    client_id: UUID | None = None
    amount: float
    error: str | None = None
    source: str = "chatwit"
