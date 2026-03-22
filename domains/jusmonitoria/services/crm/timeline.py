"""Timeline service for aggregating client events."""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.timeline_event import TimelineEvent

logger = logging.getLogger(__name__)


class TimelineService:
    """
    Service for managing client timeline events.
    
    Aggregates events from multiple sources:
    - Case movements
    - Messages (Chatwit)
    - Internal notes
    - Automations
    - Status changes
    """
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize service.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        self.session = session
        self.tenant_id = tenant_id
    
    async def get_client_timeline(
        self,
        client_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
        event_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> dict:
        """
        Get timeline events for a client.
        
        Args:
            client_id: Client UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            event_type: Filter by event type
            date_from: Filter by date from
            date_to: Filter by date to
            
        Returns:
            Dictionary with events and pagination info
        """
        # Build query
        query = select(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
            )
        )
        
        # Apply filters
        filters = []
        
        if event_type:
            filters.append(TimelineEvent.event_type == event_type)
        
        if date_from:
            filters.append(TimelineEvent.created_at >= date_from)
        
        if date_to:
            filters.append(TimelineEvent.created_at <= date_to)
        
        if filters:
            query = query.where(and_(*filters))
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar_one()
        
        # Order by date descending (most recent first)
        query = query.order_by(TimelineEvent.created_at.desc())
        
        # Apply pagination
        query = query.offset(skip).limit(limit)
        
        # Execute query
        result = await self.session.execute(query)
        events = result.scalars().all()
        
        # Format events
        formatted_events = [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "title": event.title,
                "description": event.description,
                "source": event.source,
                "metadata": event.metadata,
                "created_at": event.created_at.isoformat(),
                "created_by": str(event.created_by) if event.created_by else None,
            }
            for event in events
        ]
        
        logger.debug(
            "Retrieved client timeline",
            extra={
                "client_id": str(client_id),
                "tenant_id": str(self.tenant_id),
                "count": len(events),
                "total": total,
            },
        )
        
        return {
            "events": formatted_events,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": (skip + len(events)) < total,
        }
    
    async def get_available_event_types(
        self,
        client_id: UUID,
    ) -> list[str]:
        """
        Get list of available event types for a client.
        
        Useful for building filter UI.
        
        Args:
            client_id: Client UUID
            
        Returns:
            List of unique event types
        """
        query = (
            select(TimelineEvent.event_type)
            .where(
                and_(
                    TimelineEvent.tenant_id == self.tenant_id,
                    TimelineEvent.entity_type == "client",
                    TimelineEvent.entity_id == client_id,
                )
            )
            .distinct()
        )
        
        result = await self.session.execute(query)
        event_types = [row[0] for row in result.all()]
        
        return event_types
    
    async def create_event(
        self,
        entity_type: str,
        entity_id: UUID,
        event_type: str,
        title: str,
        description: Optional[str] = None,
        metadata: Optional[dict] = None,
        source: str = "system",
        created_by: Optional[UUID] = None,
    ) -> TimelineEvent:
        """
        Create a new timeline event.
        
        Args:
            entity_type: Type of entity (client, lead, legal_case)
            entity_id: Entity UUID
            event_type: Type of event
            title: Event title
            description: Event description
            metadata: Additional event data
            source: Event source (system, user, chatwit, datajud, ai)
            created_by: User who created the event
            
        Returns:
            Created timeline event
        """
        event = TimelineEvent(
            tenant_id=self.tenant_id,
            entity_type=entity_type,
            entity_id=entity_id,
            event_type=event_type,
            title=title,
            description=description,
            metadata=metadata or {},
            source=source,
            created_by=created_by,
        )
        
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        
        logger.info(
            "Created timeline event",
            extra={
                "event_id": str(event.id),
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "event_type": event_type,
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return event
    
    async def get_recent_activity(
        self,
        *,
        limit: int = 10,
        entity_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Get recent activity across all entities in tenant.
        
        Useful for dashboard "Recent Activities" widget.
        
        Args:
            limit: Maximum number of events to return
            entity_type: Filter by entity type
            
        Returns:
            List of recent events
        """
        query = select(TimelineEvent).where(
            TimelineEvent.tenant_id == self.tenant_id
        )
        
        if entity_type:
            query = query.where(TimelineEvent.entity_type == entity_type)
        
        query = query.order_by(TimelineEvent.created_at.desc()).limit(limit)
        
        result = await self.session.execute(query)
        events = result.scalars().all()
        
        return [
            {
                "id": str(event.id),
                "entity_type": event.entity_type,
                "entity_id": str(event.entity_id),
                "event_type": event.event_type,
                "title": event.title,
                "description": event.description,
                "source": event.source,
                "created_at": event.created_at.isoformat(),
            }
            for event in events
        ]
    
    async def aggregate_events_by_type(
        self,
        client_id: UUID,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> dict[str, int]:
        """
        Aggregate events by type for a client.
        
        Useful for analytics and visualization.
        
        Args:
            client_id: Client UUID
            date_from: Filter by date from
            date_to: Filter by date to
            
        Returns:
            Dictionary mapping event type to count
        """
        query = (
            select(
                TimelineEvent.event_type,
                func.count(TimelineEvent.id).label("count"),
            )
            .where(
                and_(
                    TimelineEvent.tenant_id == self.tenant_id,
                    TimelineEvent.entity_type == "client",
                    TimelineEvent.entity_id == client_id,
                )
            )
            .group_by(TimelineEvent.event_type)
        )
        
        # Apply date filters
        if date_from:
            query = query.where(TimelineEvent.created_at >= date_from)
        
        if date_to:
            query = query.where(TimelineEvent.created_at <= date_to)
        
        result = await self.session.execute(query)
        rows = result.all()
        
        return {row.event_type: row.count for row in rows}
