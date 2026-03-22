"""Schemas for global search endpoint."""

from uuid import UUID

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    """A single search result."""

    id: UUID
    type: str
    label: str
    subtitle: str | None = None


class GlobalSearchResponse(BaseModel):
    """Response for global search endpoint."""

    clients: list[SearchResultItem]
    legal_cases: list[SearchResultItem]
