"""Pydantic schemas for Chatwit integration."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChatwitContact(BaseModel):
    """Chatwit contact information."""
    
    id: str = Field(..., description="Chatwit contact ID")
    name: str = Field(..., description="Contact name")
    phone: str = Field(..., description="Phone number")
    email: str | None = Field(None, description="Email address")
    tags: list[str] = Field(default_factory=list, description="Contact tags")
    custom_fields: dict[str, Any] = Field(default_factory=dict, description="Custom fields")


class ChatwitMessage(BaseModel):
    """Chatwit message information."""
    
    id: str = Field(..., description="Message ID")
    direction: str = Field(..., description="Message direction: inbound or outbound")
    content: str = Field(..., description="Message content")
    media_url: str | None = Field(None, description="Media URL if present")
    channel: str = Field(..., description="Channel: whatsapp, instagram, etc")


class ChatwitWebhookPayload(BaseModel):
    """Chatwit webhook payload."""
    
    event_type: str = Field(..., description="Event type: message.received, tag.added, tag.removed")
    timestamp: datetime = Field(..., description="Event timestamp")
    contact: ChatwitContact = Field(..., description="Contact information")
    message: ChatwitMessage | None = Field(None, description="Message if applicable")
    tag: str | None = Field(None, description="Tag name for tag events")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class ChatwitWebhookResponse(BaseModel):
    """Response for webhook endpoint."""
    
    status: str = Field(default="received", description="Status of webhook processing")
    event_id: str | None = Field(None, description="Generated event ID")


class ChatwitSendMessageRequest(BaseModel):
    """Request to send message via Chatwit."""
    
    contact_id: str = Field(..., description="Chatwit contact ID")
    message: str = Field(..., description="Message content")
    channel: str = Field(default="whatsapp", description="Channel to send message")


class ChatwitSendMessageResponse(BaseModel):
    """Response from sending message."""
    
    message_id: str = Field(..., description="Sent message ID")
    status: str = Field(..., description="Send status")


class ChatwitAddTagRequest(BaseModel):
    """Request to add tag to contact."""
    
    contact_id: str = Field(..., description="Chatwit contact ID")
    tag: str = Field(..., description="Tag name to add")


class ChatwitAddTagResponse(BaseModel):
    """Response from adding tag."""
    
    status: str = Field(..., description="Operation status")


# ── Init endpoint schema ────────────────────────────────────────────────────


class ChatwitInitPayload(BaseModel):
    """Payload for POST /v1/integrations/chatwit/init from Chatwit startup."""

    agent_bot_token: str = Field(..., description="Auto-generated bot token for async responses")
    base_url: str = Field(..., description="Chatwit instance base URL")
    secret: str = Field(..., description="Shared secret for verification")


class ChatwitInitResponse(BaseModel):
    """Response from init endpoint."""

    status: str = Field(default="ok", description="Init result")
    message: str = Field(default="Bot registered", description="Human-readable message")


# ── Contact event schemas (contract-aligned) ────────────────────────────────


class ChatwitContactAccount(BaseModel):
    """Account block inside contact events."""

    id: int = Field(..., description="Chatwit account ID")
    name: str = Field(..., description="Account/office name")


class ChatwitContactEventData(BaseModel):
    """Data block for contact.created / contact.updated events."""

    id: int = Field(..., description="Chatwit contact ID")
    name: str = Field(..., description="Contact name")
    email: str | None = Field(None, description="Contact email")
    phone_number: str | None = Field(None, description="Phone number in E.164")
    identifier: str | None = Field(None, description="Channel identifier (e.g. whatsapp_id)")
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    account: ChatwitContactAccount = Field(..., description="Account that owns this contact")


class ChatwitEventMetadata(BaseModel):
    """Common metadata block for all Chatwit webhook events."""

    account_id: int = Field(..., description="Chatwit account ID")
    chatwit_base_url: str = Field(default="", description="Chatwit instance URL")
    chatwit_agent_bot_token: str = Field(default="", description="Bot token")
    timestamp: str = Field(default="", description="ISO 8601 timestamp")


class ChatwitContactEventPayload(BaseModel):
    """Payload for contact.created and contact.updated events."""

    event_type: str = Field(..., description="contact.created or contact.updated")
    data: ChatwitContactEventData = Field(..., description="Contact data")
    metadata: ChatwitEventMetadata = Field(..., description="Routing metadata")


# ── Conversation resolved schema ────────────────────────────────────────────


class ChatwitConversationContact(BaseModel):
    """Contact block in conversation event."""

    id: int = Field(..., description="Chatwit contact ID")
    name: str = Field(..., description="Contact name")


class ChatwitConversationData(BaseModel):
    """Data block for conversation.resolved."""

    conversation: dict[str, Any] = Field(..., description="Conversation details")


class ChatwitConversationResolvedPayload(BaseModel):
    """Payload for conversation.resolved event."""

    event_type: str = Field(default="conversation.resolved")
    data: ChatwitConversationData = Field(..., description="Conversation data")
    metadata: ChatwitEventMetadata = Field(..., description="Routing metadata")


# ── Connect / Status schemas (tenant integration management) ─────────────


class ChatwitConnectRequest(BaseModel):
    """Request body for POST /v1/integrations/chatwit/connect."""

    access_token: str = Field(..., min_length=10, description="Chatwit admin ACCESS_TOKEN")
    base_url: str = Field(
        default="https://chatwit.witdev.com.br",
        description="Chatwit instance base URL",
    )


class ChatwitConnectResponse(BaseModel):
    """Response from connect endpoint."""

    status: str = Field(default="connected")
    account_id: int = Field(..., description="Chatwit account ID resolved from token")
    account_name: str = Field(..., description="Chatwit account name")


class ChatwitStatusResponse(BaseModel):
    """Response from GET /v1/integrations/chatwit/status."""

    connected: bool = Field(..., description="Whether Chatwit integration is active")
    account_id: int | None = Field(None, description="Chatwit account ID if connected")
    account_name: str | None = Field(None, description="Chatwit account name if connected")


# ── Standard Chatwit webhook payload (like SocialWise receives) ──────────


class ChatwitStandardWebhookAccount(BaseModel):
    """Account block in standard Chatwit webhook."""

    id: int
    name: str = ""


class ChatwitStandardWebhookPayload(BaseModel):
    """Standard Chatwit webhook payload (include_access_token=true).

    This is the raw format Chatwit sends to registered webhooks,
    as opposed to the custom JusMonitorIA-bot format.
    """

    event: str = Field(..., description="Event name: message_created, contact_created, etc.")
    account: ChatwitStandardWebhookAccount = Field(..., description="Account info")
    contact: dict[str, Any] | None = Field(None, description="Contact data")
    conversation: dict[str, Any] | None = Field(None, description="Conversation data")
    inbox: dict[str, Any] | None = Field(None, description="Inbox data")
    sender: dict[str, Any] | None = Field(None, description="Sender (contact or user)")
    # Message fields (present on message_created)
    id: int | None = Field(None, description="Message ID for message events")
    content: str | None = Field(None, description="Message content")
    content_type: str | None = Field(None, description="Content type")
    content_attributes: dict[str, Any] | None = Field(None)
    message_type: str | None = Field(None, description="incoming, outgoing, etc.")
    attachments: list[dict[str, Any]] | None = Field(None)
    # Token for tenant resolution
    ACCESS_TOKEN: str | None = Field(None, description="Admin ACCESS_TOKEN for tenant resolution")
