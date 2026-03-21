"""Pydantic schemas for Dashboard API."""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UrgentCaseItem(BaseModel):
    """Schema for urgent case item."""
    
    model_config = ConfigDict(from_attributes=True)
    
    case_id: UUID
    cnj_number: str
    client_id: UUID
    client_name: str
    next_deadline: date
    days_remaining: int
    case_type: Optional[str] = None
    court: Optional[str] = None
    last_movement_date: Optional[date] = None


class AttentionCaseItem(BaseModel):
    """Schema for case needing attention."""
    
    model_config = ConfigDict(from_attributes=True)
    
    case_id: UUID
    cnj_number: str
    client_id: UUID
    client_name: str
    last_movement_date: Optional[date] = None
    days_since_movement: int
    case_type: Optional[str] = None
    court: Optional[str] = None
    status: Optional[str] = None


class GoodNewsItem(BaseModel):
    """Schema for good news item."""
    
    model_config = ConfigDict(from_attributes=True)
    
    case_id: UUID
    cnj_number: str
    client_id: UUID
    client_name: str
    movement_id: UUID
    movement_date: date
    movement_type: Optional[str] = None
    description: str
    ai_summary: Optional[str] = None


class NoiseItem(BaseModel):
    """Schema for noise item."""
    
    model_config = ConfigDict(from_attributes=True)
    
    case_id: UUID
    cnj_number: str
    client_id: UUID
    client_name: str
    movement_id: UUID
    movement_date: date
    movement_type: Optional[str] = None
    description: str


class DashboardUrgentResponse(BaseModel):
    """Response schema for urgent cases endpoint."""
    
    items: list[UrgentCaseItem]
    total: int


class DashboardAttentionResponse(BaseModel):
    """Response schema for attention cases endpoint."""
    
    items: list[AttentionCaseItem]
    total: int


class DashboardGoodNewsResponse(BaseModel):
    """Response schema for good news endpoint."""
    
    items: list[GoodNewsItem]
    total: int


class DashboardNoiseResponse(BaseModel):
    """Response schema for noise endpoint."""
    
    items: list[NoiseItem]
    total: int


class OfficeMetrics(BaseModel):
    """Schema for office metrics."""
    
    conversion_rate: float = Field(..., description="Lead to client conversion rate (%)")
    conversion_rate_change: float = Field(..., description="Change from previous period (%)")
    
    avg_response_time_hours: float = Field(..., description="Average response time in hours")
    avg_response_time_change: float = Field(..., description="Change from previous period (%)")
    
    satisfaction_score: float = Field(..., description="Client satisfaction score (0-100)")
    satisfaction_score_change: float = Field(..., description="Change from previous period (%)")
    
    total_active_cases: int = Field(..., description="Total active cases")
    new_cases_this_period: int = Field(..., description="New cases in current period")
    
    total_active_clients: int = Field(..., description="Total active clients")
    new_clients_this_period: int = Field(..., description="New clients in current period")


class DashboardMetricsResponse(BaseModel):
    """Response schema for dashboard metrics endpoint."""
    
    metrics: OfficeMetrics
    period_start: date
    period_end: date
    comparison_period_start: date
    comparison_period_end: date


class DashboardFilters(BaseModel):
    """Schema for dashboard filters."""
    
    start_date: Optional[date] = Field(None, description="Filter start date")
    end_date: Optional[date] = Field(None, description="Filter end date")
    assigned_to: Optional[UUID] = Field(None, description="Filter by assigned lawyer")
    case_type: Optional[str] = Field(None, description="Filter by case type")
    limit: int = Field(default=20, ge=1, le=100, description="Number of items to return")

