"""Pydantic schemas package."""

from domains.jusmonitoria.schemas.auth import LoginRequest, TokenResponse, RefreshTokenRequest, UserInfo
from domains.jusmonitoria.schemas.chatwit import ChatwitWebhookPayload
from domains.jusmonitoria.schemas.client import (
    ClientAutomationConfig,
    ClientAutomationResponse,
    ClientCreate,
    ClientHealthResponse,
    ClientListResponse,
    ClientNoteCreate,
    ClientNoteResponse,
    ClientResponse,
    ClientUpdate,
)
from domains.jusmonitoria.schemas.lead import (
    LeadCreate,
    LeadListResponse,
    LeadResponse,
    LeadScoreUpdate,
    LeadStageUpdate,
    LeadUpdate,
)

__all__ = [
    # Auth
    "LoginRequest",
    "TokenResponse",
    "RefreshTokenRequest",
    "UserInfo",
    # Chatwit
    "ChatwitWebhookPayload",
    # Client
    "ClientCreate",
    "ClientUpdate",
    "ClientResponse",
    "ClientListResponse",
    "ClientHealthResponse",
    "ClientNoteCreate",
    "ClientNoteResponse",
    "ClientAutomationConfig",
    "ClientAutomationResponse",
    # Lead
    "LeadCreate",
    "LeadUpdate",
    "LeadResponse",
    "LeadListResponse",
    "LeadStageUpdate",
    "LeadScoreUpdate",
]
