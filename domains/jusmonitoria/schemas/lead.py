"""Pydantic schemas for Lead API."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from domains.jusmonitoria.db.models.lead import LeadSource, LeadStage, LeadStatus


class LeadBase(BaseModel):
    """Base lead schema with common fields."""

    full_name: str = Field(..., min_length=1, max_length=255, description="Lead full name")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    email: Optional[EmailStr] = Field(None, description="Email address")
    source: LeadSource = Field(default=LeadSource.CHATWIT, description="Lead acquisition source")
    chatwit_contact_id: Optional[str] = Field(None, max_length=100, description="Chatwit contact ID")
    stage: LeadStage = Field(default=LeadStage.NEW, description="Current stage in sales funnel")
    score: int = Field(default=0, ge=0, le=100, description="Lead quality score (0-100)")
    assigned_to: Optional[UUID] = Field(None, description="User responsible for this lead")
    metadata: dict = Field(default_factory=dict, description="Additional lead metadata")


class LeadCreate(LeadBase):
    """Schema for creating a new lead."""
    
    pass


class LeadUpdate(BaseModel):
    """Schema for updating an existing lead."""
    
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    source: Optional[LeadSource] = None
    chatwit_contact_id: Optional[str] = Field(None, max_length=100)
    stage: Optional[LeadStage] = None
    score: Optional[int] = Field(None, ge=0, le=100)
    assigned_to: Optional[UUID] = None
    ai_summary: Optional[str] = None
    ai_recommended_action: Optional[str] = None
    status: Optional[LeadStatus] = None
    metadata: Optional[dict] = None


class LeadResponse(LeadBase):
    """Schema for lead response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    status: LeadStatus
    # ORM attribute is lead_metadata (mapped to DB column "metadata").
    # validation_alias makes from_attributes read lead.lead_metadata instead of lead.metadata
    # (lead.metadata collides with SQLAlchemy's MetaData descriptor).
    metadata: dict = Field(
        default_factory=dict,
        validation_alias="lead_metadata",
    )
    ai_summary: Optional[str] = None
    ai_recommended_action: Optional[str] = None
    converted_to_client_id: Optional[UUID] = None
    converted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class LeadListResponse(BaseModel):
    """Schema for paginated lead list response."""
    
    items: list[LeadResponse]
    total: int
    skip: int
    limit: int


class LeadStageUpdate(BaseModel):
    """Schema for updating lead stage."""
    
    stage: LeadStage = Field(..., description="New stage in sales funnel")


class LeadScoreUpdate(BaseModel):
    """Schema for updating lead score."""
    
    score: int = Field(..., ge=0, le=100, description="New lead score (0-100)")
