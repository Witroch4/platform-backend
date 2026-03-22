"""Schemas for JARVIS AI briefing endpoints."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

# ── Request schemas ──────────────────────────────────────────────

class BriefingRequest(BaseModel):
    """Request to generate a JARVIS briefing."""
    hours_back: int = Field(default=24, ge=1, le=168, description="Hours to look back for movements")


class ChatRequest(BaseModel):
    """Request to chat with JARVIS."""
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: UUID | None = None
    chat_id: str | None = Field(default=None, min_length=1, max_length=200)


# ── Movement item in briefing ────────────────────────────────────

class BriefingMovementItem(BaseModel):
    """A single movement inside the briefing."""
    movement_id: UUID
    case_id: UUID
    cnj_number: str
    client_name: str | None = None
    movement_date: date
    movement_type: str | None = None
    description: str
    ai_summary: str | None = None
    is_important: bool = False
    requires_action: bool = False


# ── Briefing response ───────────────────────────────────────────

class BriefingResponse(BaseModel):
    """Response with the complete JARVIS briefing."""
    date: str
    summary: str
    urgente: list[BriefingMovementItem] = []
    atencao: list[BriefingMovementItem] = []
    boas_noticias: list[BriefingMovementItem] = []
    ruido: list[BriefingMovementItem] = []
    total_movements: int = 0
    total_cases_analyzed: int = 0
    cases_with_no_news: int = 0


# ── Chat response ───────────────────────────────────────────────

class ChatResponse(BaseModel):
    """Response from JARVIS chat."""
    message: str
    conversation_id: UUID | None = None
    agent_used: str | None = None
