"""Optimized base repository with eager loading and caching support."""

import logging
from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from domains.jusmonitoria.db.base import TenantBaseModel

logger = logging.getLogger(__name__)

# Generic type for model
ModelType = TypeVar("ModelType", bound=TenantBaseModel)


class OptimizedBaseRepository(Generic[ModelType]):
    """
    Optimized base repository with eager loading and performance enhancements.
    
    Extends BaseRepository with:
    - Configurable eager loading to prevent N+1 queries
    - Batch operations for bulk inserts/updates
    - Query result caching hints
    - Performance logging
    
    Usage:
        class ClientRepository(OptimizedBaseRepository[Client]):
            def __init__(self, session: AsyncSession, tenant_id: UUID):
                super().__init__(
                    Client,
                    session,
                    tenant_id,
                    eager_load=['tenant', 'assigned_user']  # Relationships to eager load
                )
    """
    
    def __init__(
        self,
        model: type[ModelType],
        session: AsyncSession,
        tenant_id: UUID,
        eager_load: list[str] | None = None,
        use_joined_load: bool = False,
    ):
        """
        Initialize optimized repository.
        
        Args:
            model: SQLAlchemy model class
            session: Async database session
            tenant_id: Tenant ID for isolation
            eager_load: List of relationship names to eager load
            use_joined_load: If True, use joinedload instead of selectinload
        """
        self.model = model
        self.session = session
        self.tenant_id = tenant_id
        self.eager_load = eager_load or []
        self.use_joined_load = use_joined_load
    
    def _apply_tenant_filter(self, query: Select) -> Select:
        """Apply tenant_id filter to query."""
        return query.where(self.model.tenant_id == self.tenant_id)
    
    def _apply_eager_loading(self, query: Select) -> Select:
        """
        Apply eager loading to query to prevent N+1 queries.
        
        Args:
            query: SQLAlchemy select query
            
        Returns:
            Query with eager loading applied
        """
        if not self.eager_load:
            return query
        
        load_strategy = joinedload if self.use_joined_load else selectinload
        
        for relationship in self.eager_load:
            if hasattr(self.model, relationship):
                query = query.options(load_strategy(getattr(self.model, relationship)))
        
        return query
    
    async def get(self, id: UUID, *, with_relationships: bool = True) -> ModelType | None:
        """
        Get a single record by ID within tenant with eager loading.
        
        Args:
            id: Record UUID
            with_relationships: If True, eager load configured relationships
            
        Returns:
            Model instance or None if not found
        """
        query = select(self.model).where(self.model.id == id)
        query = self._apply_tenant_filter(query)
        
        if with_relationships:
            query = self._apply_eager_loading(query)
        
        result = await self.session.execute(query)
        instance = result.scalar_one_or_none()
        
        if instance:
            logger.debug(
                f"Retrieved {self.model.__name__}",
                extra={
                    "id": str(id),
                    "tenant_id": str(self.tenant_id),
                    "eager_loaded": with_relationships,
                },
            )
        
        return instance
    
    async def list(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        order_by: str | None = None,
        filters: dict[str, Any] | None = None,
        with_relationships: bool = True,
    ) -> list[ModelType]:
        """
        List records with pagination, filtering, and eager loading.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            order_by: Column name to order by (prefix with - for descending)
            filters: Dictionary of column:value filters
            with_relationships: If True, eager load configured relationships
            
        Returns:
            List of model instances
        """
        query = select(self.model)
        query = self._apply_tenant_filter(query)
        
        if with_relationships:
            query = self._apply_eager_loading(query)
        
        # Apply additional filters
        if filters:
            for column, value in filters.items():
                if hasattr(self.model, column):
                    query = query.where(getattr(self.model, column) == value)
        
        # Apply ordering
        if order_by:
            descending = order_by.startswith("-")
            column_name = order_by.lstrip("-")
            
            if hasattr(self.model, column_name):
                column = getattr(self.model, column_name)
                query = query.order_by(column.desc() if descending else column)
        
        # Apply pagination
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        instances = result.scalars().all()
        
        logger.debug(
            f"Listed {self.model.__name__}",
            extra={
                "count": len(instances),
                "tenant_id": str(self.tenant_id),
                "skip": skip,
                "limit": limit,
                "eager_loaded": with_relationships,
            },
        )
        
        return list(instances)
    
    async def get_many(
        self,
        ids: list[UUID],
        *,
        with_relationships: bool = True,
    ) -> list[ModelType]:
        """
        Get multiple records by IDs within tenant with eager loading.
        
        More efficient than calling get() multiple times.
        
        Args:
            ids: List of record UUIDs
            with_relationships: If True, eager load configured relationships
            
        Returns:
            List of model instances (may be fewer than requested if some not found)
        """
        if not ids:
            return []
        
        query = select(self.model).where(self.model.id.in_(ids))
        query = self._apply_tenant_filter(query)
        
        if with_relationships:
            query = self._apply_eager_loading(query)
        
        result = await self.session.execute(query)
        instances = result.scalars().all()
        
        logger.debug(
            f"Retrieved multiple {self.model.__name__}",
            extra={
                "requested": len(ids),
                "found": len(instances),
                "tenant_id": str(self.tenant_id),
                "eager_loaded": with_relationships,
            },
        )
        
        return list(instances)
    
    async def count(self, filters: dict[str, Any] | None = None) -> int:
        """
        Count records within tenant.
        
        Args:
            filters: Dictionary of column:value filters
            
        Returns:
            Number of records
        """
        query = select(func.count()).select_from(self.model)
        query = self._apply_tenant_filter(query)
        
        # Apply additional filters
        if filters:
            for column, value in filters.items():
                if hasattr(self.model, column):
                    query = query.where(getattr(self.model, column) == value)
        
        result = await self.session.execute(query)
        count = result.scalar_one()
        
        return count
    
    async def create(self, **data: Any) -> ModelType:
        """
        Create a new record within tenant.
        
        Automatically injects tenant_id into the data.
        
        Args:
            **data: Model field values
            
        Returns:
            Created model instance
        """
        # Ensure tenant_id is set
        data["tenant_id"] = self.tenant_id
        
        instance = self.model(**data)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        
        logger.info(
            f"Created {self.model.__name__}",
            extra={
                "id": str(instance.id),
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return instance
    
    async def create_many(self, items: list[dict[str, Any]]) -> list[ModelType]:
        """
        Create multiple records in a single batch within tenant.
        
        More efficient than calling create() multiple times.
        
        Args:
            items: List of dictionaries with model field values
            
        Returns:
            List of created model instances
        """
        if not items:
            return []
        
        # Ensure tenant_id is set for all items
        for item in items:
            item["tenant_id"] = self.tenant_id
        
        instances = [self.model(**item) for item in items]
        self.session.add_all(instances)
        await self.session.flush()
        
        # Refresh all instances to get generated IDs and defaults
        for instance in instances:
            await self.session.refresh(instance)
        
        logger.info(
            f"Created {len(instances)} {self.model.__name__} records",
            extra={
                "count": len(instances),
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return instances
    
    async def update(
        self,
        id: UUID,
        **data: Any,
    ) -> ModelType | None:
        """
        Update a record by ID within tenant.
        
        Args:
            id: Record UUID
            **data: Fields to update
            
        Returns:
            Updated model instance or None if not found
        """
        # Remove tenant_id from data to prevent modification
        data.pop("tenant_id", None)
        
        query = (
            update(self.model)
            .where(self.model.id == id)
            .where(self.model.tenant_id == self.tenant_id)
            .values(**data)
            .returning(self.model)
        )
        
        result = await self.session.execute(query)
        instance = result.scalar_one_or_none()
        
        if instance:
            await self.session.refresh(instance)
            logger.info(
                f"Updated {self.model.__name__}",
                extra={
                    "id": str(id),
                    "tenant_id": str(self.tenant_id),
                    "fields": list(data.keys()),
                },
            )
        
        return instance
    
    async def delete(
        self,
        id: UUID,
        *,
        soft: bool = False,
    ) -> bool:
        """
        Delete a record by ID within tenant.
        
        Args:
            id: Record UUID
            soft: If True, perform soft delete (set deleted_at)
            
        Returns:
            True if deleted, False if not found
        """
        if soft and hasattr(self.model, "deleted_at"):
            # Soft delete: set deleted_at timestamp
            query = (
                update(self.model)
                .where(self.model.id == id)
                .where(self.model.tenant_id == self.tenant_id)
                .values(deleted_at=func.now())
            )
        else:
            # Hard delete: remove from database
            query = (
                delete(self.model)
                .where(self.model.id == id)
                .where(self.model.tenant_id == self.tenant_id)
            )
        
        result = await self.session.execute(query)
        deleted = result.rowcount > 0
        
        if deleted:
            logger.info(
                f"{'Soft' if soft else 'Hard'} deleted {self.model.__name__}",
                extra={
                    "id": str(id),
                    "tenant_id": str(self.tenant_id),
                },
            )
        
        return deleted
    
    async def exists(self, id: UUID) -> bool:
        """
        Check if a record exists by ID within tenant.
        
        Args:
            id: Record UUID
            
        Returns:
            True if exists, False otherwise
        """
        query = select(func.count()).select_from(self.model)
        query = query.where(self.model.id == id)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        count = result.scalar_one()
        
        return count > 0
