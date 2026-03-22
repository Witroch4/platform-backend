"""Pydantic schemas for Client API."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from domains.jusmonitoria.db.models.client import ClientStatus


class ClientBase(BaseModel):
    """Base client schema with common fields."""
    
    full_name: str = Field(..., min_length=1, max_length=255, description="Client full name")
    cpf_cnpj: Optional[str] = Field(None, max_length=18, description="CPF or CNPJ")
    email: Optional[EmailStr] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    address: Optional[dict] = Field(None, description="Address information")
    chatwit_contact_id: Optional[str] = Field(None, max_length=100, description="Chatwit contact ID")
    assigned_to: Optional[UUID] = Field(None, description="Lawyer responsible for this client")
    notes: Optional[str] = Field(None, description="Internal notes about client")
    custom_fields: dict = Field(default_factory=dict, description="Custom fields for tenant-specific data")


class ClientCreate(ClientBase):
    """Schema for creating a new client."""
    
    lead_id: Optional[UUID] = Field(None, description="Original lead if converted")


class ClientUpdate(BaseModel):
    """Schema for updating an existing client."""
    
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    cpf_cnpj: Optional[str] = Field(None, max_length=18)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[dict] = None
    chatwit_contact_id: Optional[str] = Field(None, max_length=100)
    assigned_to: Optional[UUID] = None
    status: Optional[ClientStatus] = None
    health_score: Optional[int] = Field(None, ge=0, le=100)
    notes: Optional[str] = None
    custom_fields: Optional[dict] = None


class ClientResponse(ClientBase):
    """Schema for client response."""
    
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    lead_id: Optional[UUID] = None
    status: ClientStatus
    health_score: int
    created_at: datetime
    updated_at: datetime


class ClientListResponse(BaseModel):
    """Schema for paginated client list response."""
    
    items: list[ClientResponse]
    total: int
    skip: int
    limit: int


class ClientHealthResponse(BaseModel):
    """Schema for client health dashboard response."""
    
    client_id: UUID
    health_score: int
    alerts: list[dict]
    recommendations: list[dict]
    metrics: dict
    last_activity: Optional[datetime] = None


class ClientNoteCreate(BaseModel):
    """Schema for creating a client note."""
    
    content: str = Field(..., min_length=1, description="Note content in markdown")


class ClientNoteResponse(BaseModel):
    """Schema for client note response."""
    
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    client_id: UUID
    author_id: UUID
    content: str
    mentions: list[UUID] = Field(default_factory=list, description="Mentioned user IDs")
    created_at: datetime
    updated_at: datetime


class ClientAutomationConfig(BaseModel):
    """Schema for client automation configuration."""
    
    briefing_matinal: bool = Field(default=True, description="Enable morning briefing")
    alertas_urgentes: bool = Field(default=True, description="Enable urgent alerts")
    resumo_semanal: bool = Field(default=True, description="Enable weekly summary")


class ClientAutomationResponse(BaseModel):
    """Schema for client automation response."""
    
    model_config = ConfigDict(from_attributes=True)
    
    client_id: UUID
    briefing_matinal: bool
    alertas_urgentes: bool
    resumo_semanal: bool
    updated_at: datetime
