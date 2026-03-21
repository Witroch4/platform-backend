"""Pydantic schemas for Chatwit payment webhook integration."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class ChatwitPaymentContext(BaseModel):
    """Context data from Chatwit payment webhook containing client identification."""

    client_id: Optional[str] = Field(None, description="Internal client ID from Chatwit context")
    contact_id: Optional[str] = Field(None, description="Chatwit contact ID")
    conversation_id: Optional[str] = Field(None, description="Chatwit conversation ID")
    account_id: Optional[str] = Field(None, description="Chatwit account ID")
    extra: dict[str, Any] = Field(default_factory=dict, description="Additional context data")


class ChatwitPaymentItem(BaseModel):
    """Individual item/service in a payment."""

    description: str = Field(..., description="Service description")
    amount: Decimal = Field(..., gt=0, description="Item amount")
    quantity: int = Field(default=1, ge=1, description="Item quantity")


class ChatwitPaymentWebhookPayload(BaseModel):
    """
    Payload for payment webhooks from Chatwit.

    Chatwit creates payment links for services via chat,
    sends to client, and when client pays, Chatwit forwards
    the payment notification to this webhook.
    """

    event_type: str = Field(
        default="payment.completed",
        description="Event type: payment.completed, payment.failed, payment.refunded",
    )
    payment_id: str = Field(..., description="Unique payment ID from payment provider")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Payment event timestamp")

    # Payment details
    amount: Decimal = Field(..., gt=0, description="Total payment amount in BRL")
    currency: str = Field(default="BRL", description="Currency code")
    payment_method: Optional[str] = Field(
        None,
        description="Payment method: pix, boleto, cartao, transferencia",
    )
    payment_status: str = Field(
        default="completed",
        description="Payment status: completed, failed, refunded, pending",
    )

    # Payer info
    payer_name: Optional[str] = Field(None, description="Payer name")
    payer_email: Optional[str] = Field(None, description="Payer email")
    payer_phone: Optional[str] = Field(None, description="Payer phone")
    payer_document: Optional[str] = Field(None, description="Payer CPF/CNPJ")

    # Chatwit identification
    user_id: str = Field(..., description="Chatwit user ID who created the payment link")
    context: ChatwitPaymentContext = Field(
        default_factory=ChatwitPaymentContext,
        description="Context with client identification",
    )

    # Service details
    description: Optional[str] = Field(None, description="Payment description/service name")
    items: list[ChatwitPaymentItem] = Field(default_factory=list, description="Payment items")
    reference: Optional[str] = Field(None, description="External reference (e.g., invoice number)")

    # Additional metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional payment metadata")


class PaymentWebhookResponse(BaseModel):
    """Response for payment webhook endpoint."""

    status: str = Field(default="received", description="Processing status")
    event_id: Optional[str] = Field(None, description="Generated event ID for tracking")
    fatura_id: Optional[str] = Field(None, description="Matched/created invoice ID")
    lancamento_id: Optional[str] = Field(None, description="Created transaction ID")
    message: str = Field(default="Payment processed", description="Human-readable message")


# ── payment.confirmed schema (InfinitePay via Chatwit) ──────────────────────


class PaymentConfirmedContactAccount(BaseModel):
    """Account block inside contact in payment.confirmed."""

    id: int = Field(..., description="Chatwit account ID")
    name: str = Field(default="", description="Account/office name")


class PaymentConfirmedContact(BaseModel):
    """Contact data in payment.confirmed event (enriched per contract v2)."""

    id: int = Field(..., description="Chatwit contact ID")
    name: str = Field(..., description="Contact name")
    email: Optional[str] = Field(None, description="Contact email")
    phone_number: str = Field(..., description="Contact phone number")
    identifier: Optional[str] = Field(None, description="Bidirectional identifier (jm_lead_*/jm_client_*)")
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    additional_attributes: dict[str, Any] = Field(default_factory=dict)
    account: Optional[PaymentConfirmedContactAccount] = Field(None, description="Account that owns this contact")


class PaymentConfirmedConversationContact(BaseModel):
    """Minimal contact inside conversation block."""

    id: int = Field(..., description="Chatwit contact ID")
    name: str = Field(default="", description="Contact name")


class PaymentConfirmedInbox(BaseModel):
    """Inbox block in payment.confirmed event."""

    id: int = Field(..., description="Inbox ID")
    name: str = Field(default="", description="Inbox name")
    channel_type: str = Field(default="", description="Channel type (e.g. Channel::Whatsapp)")


class PaymentConfirmedConversation(BaseModel):
    """Conversation block in payment.confirmed event."""

    id: int = Field(..., description="Conversation ID in Chatwit")
    status: str = Field(default="open", description="Conversation status")
    labels: list[str] = Field(default_factory=list, description="Conversation labels")
    contact: Optional[PaymentConfirmedConversationContact] = Field(None)
    inbox: Optional[PaymentConfirmedInbox] = Field(None)


class PaymentConfirmedData(BaseModel):
    """Data block in payment.confirmed event."""

    payment_link_id: int = Field(..., description="ID of the PaymentLink in Chatwit")
    order_nsu: str = Field(..., description="NSU generated by Chatwit (chatwit-{account}-{conv}-{hex})")
    amount_cents: int = Field(..., gt=0, description="Original amount in cents")
    paid_amount_cents: int = Field(..., gt=0, description="Actually paid amount in cents")
    capture_method: Optional[str] = Field(None, description="pix or credit_card")
    receipt_url: Optional[str] = Field(None, description="URL of the payment receipt")
    conversation_id: int = Field(..., description="Conversation ID in Chatwit")
    contact: PaymentConfirmedContact = Field(..., description="Contact who paid")
    conversation: Optional[PaymentConfirmedConversation] = Field(None, description="Conversation context")
    inbox: Optional[PaymentConfirmedInbox] = Field(None, description="Inbox summary")

    @property
    def amount_brl(self) -> Decimal:
        """Convert amount_cents to BRL Decimal."""
        return Decimal(self.amount_cents) / Decimal(100)

    @property
    def paid_amount_brl(self) -> Decimal:
        """Convert paid_amount_cents to BRL Decimal."""
        return Decimal(self.paid_amount_cents) / Decimal(100)


class PaymentConfirmedMetadata(BaseModel):
    """Metadata block in payment.confirmed event."""

    account_id: int = Field(..., description="Chatwit account ID (maps to tenant)")
    chatwit_base_url: str = Field(..., description="Chatwit instance base URL")
    chatwit_agent_bot_token: str = Field(..., description="Agent bot token for async responses")
    timestamp: datetime = Field(..., description="Event timestamp (ISO 8601)")


class ChatwitPaymentConfirmedPayload(BaseModel):
    """
    Payload for payment.confirmed events from Chatwit (InfinitePay integration).

    This is the contract-aligned schema. Chatwit sends this when InfinitePay
    confirms a payment (PIX or credit card) on a payment link sent via chat.
    """

    event_type: str = Field(default="payment.confirmed", description="Always payment.confirmed")
    data: PaymentConfirmedData = Field(..., description="Payment data")
    metadata: PaymentConfirmedMetadata = Field(..., description="Routing metadata")
