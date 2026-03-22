"""Base repository with tenant isolation and common CRUD operations."""

import logging
from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.base import TenantBaseModel

logger = logging.getLogger(__name__)

# Generic type for model
ModelType = TypeVar("ModelType", bound=TenantBaseModel)


class BaseRepository(Generic[ModelType]):
    """
    Base repository with automatic tenant filtering.
    
    Provides common CRUD operations with built-in tenant isolation.
    All queries automatically filter by tenant_id to ensure data isolation.
    
    Usage:
        class ClientRepository(BaseRepository[Client]):
            def __init__(self, session: AsyncSession, tenant_id: UUID):
                super().__init__(Client, session, tenant_id)
    """
    
    def __init__(
        self,
        model: type[ModelType],
        session: AsyncSession,
        tenant_id: UUID,
    ):
        """
        Initialize repository.
        
        Args:
            model: SQLAlchemy model class
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        self.model = model
        self.session = session
        self.tenant_id = tenant_id
    
    def _apply_tenant_filter(self, query: Select) -> Select:
        """
        Apply tenant_id filter to query.
        
        Args:
            query: SQLAlchemy select query
            
        Returns:
            Query with tenant_id filter applied
        """
        return query.where(self.model.tenant_id == self.tenant_id)
    
    async def get(self, id: UUID) -> ModelType | None:
        """
        Get a single record by ID within tenant.
        
        Args:
            id: Record UUID
            
        Returns:
            Model instance or None if not found
        """
        query = select(self.model).where(self.model.id == id)
        query = self._apply_tenant_filter(query)
        
        result = await self.session.execute(query)
        instance = result.scalar_one_or_none()
        
        if instance:
            logger.debug(
                f"Retrieved {self.model.__name__}",
                extra={"id": str(id), "tenant_id": str(self.tenant_id)},
            )
        
        return instance
    
    async def list(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        order_by: str | None = None,
        filters: dict[str, Any] | None = None,
    ) -> list[ModelType]:
        """
        List records with pagination and filtering within tenant.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            order_by: Column name to order by (prefix with - for descending)
            filters: Dictionary of column:value filters
            
        Returns:
            List of model instances
        """
        query = select(self.model)
        query = self._apply_tenant_filter(query)
        
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
