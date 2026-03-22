"""Pydantic schemas for User Preferences API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserPreferenceBase(BaseModel):
    """Base user preference schema."""
    
    preference_key: str = Field(..., min_length=1, max_length=100, description="Preference key")
    preference_value: dict = Field(..., description="Preference value as JSON")


class UserPreferenceCreate(UserPreferenceBase):
    """Schema for creating a user preference."""
    pass


class UserPreferenceUpdate(BaseModel):
    """Schema for updating a user preference."""
    
    preference_value: dict = Field(..., description="Updated preference value")


class UserPreferenceResponse(UserPreferenceBase):
    """Schema for user preference response."""
    
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class DashboardPreferences(BaseModel):
    """Schema for dashboard-specific preferences."""
    
    default_period_days: int = Field(default=30, ge=7, le=90, description="Default period for metrics")
    default_limit: int = Field(default=20, ge=10, le=100, description="Default items per section")
    show_urgent: bool = Field(default=True, description="Show urgent cases section")
    show_attention: bool = Field(default=True, description="Show attention cases section")
    show_good_news: bool = Field(default=True, description="Show good news section")
    show_noise: bool = Field(default=False, description="Show noise section")
    auto_refresh_enabled: bool = Field(default=True, description="Enable auto-refresh")
    auto_refresh_interval_seconds: int = Field(default=300, ge=60, le=3600, description="Auto-refresh interval")
    filter_assigned_to: str | None = Field(None, description="Default filter by assigned lawyer")
    filter_case_type: str | None = Field(None, description="Default filter by case type")


class DashboardPreferencesUpdate(BaseModel):
    """Schema for updating dashboard preferences."""
    
    default_period_days: int | None = Field(None, ge=7, le=90)
    default_limit: int | None = Field(None, ge=10, le=100)
    show_urgent: bool | None = None
    show_attention: bool | None = None
    show_good_news: bool | None = None
    show_noise: bool | None = None
    auto_refresh_enabled: bool | None = None
    auto_refresh_interval_seconds: int | None = Field(None, ge=60, le=3600)
    filter_assigned_to: str | None = None
    filter_case_type: str | None = None

