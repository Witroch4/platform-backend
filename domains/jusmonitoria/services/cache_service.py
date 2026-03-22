"""Redis caching service for frequently accessed queries."""

import json
import logging
from typing import Any, Callable, TypeVar
from uuid import UUID
from functools import wraps

import redis.asyncio as redis
from pydantic import BaseModel

from platform_core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CacheService:
    """
    Redis-based caching service for database queries.
    
    Provides:
    - Key-value caching with TTL
    - Automatic serialization/deserialization
    - Cache invalidation patterns
    - Decorator for easy caching
    
    Usage:
        cache = CacheService()
        
        # Manual caching
        await cache.set("key", {"data": "value"}, ttl=300)
        data = await cache.get("key")
        
        # Decorator caching
        @cache.cached(ttl=300, key_prefix="clients")
        async def get_client(client_id: UUID):
            return await db.get(client_id)
    """
    
    def __init__(self):
        """Initialize Redis connection."""
        self.redis: redis.Redis | None = None
        self._connected = False
    
    async def connect(self) -> None:
        """Connect to Redis."""
        if self._connected:
            return
        
        try:
            self.redis = redis.from_url(
                str(settings.redis_url),
                encoding="utf-8",
                decode_responses=True,
            )
            # Test connection
            await self.redis.ping()
            self._connected = True
            logger.info("Connected to Redis for caching")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.redis = None
            self._connected = False
    
    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.redis:
            await self.redis.close()
            self._connected = False
            logger.info("Disconnected from Redis")
    
    def _serialize(self, value: Any) -> str:
        """
        Serialize value to JSON string.
        
        Handles:
        - Pydantic models
        - UUIDs
        - Datetime objects
        - Standard Python types
        """
        if isinstance(value, BaseModel):
            return value.model_dump_json()
        
        def default(obj):
            if isinstance(obj, UUID):
                return str(obj)
            if hasattr(obj, "isoformat"):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
        
        return json.dumps(value, default=default)
    
    def _deserialize(self, value: str) -> Any:
        """Deserialize JSON string to Python object."""
        return json.loads(value)
    
    def _make_key(self, key: str, tenant_id: UUID | None = None) -> str:
        """
        Create cache key with optional tenant isolation.
        
        Args:
            key: Base cache key
            tenant_id: Optional tenant ID for isolation
            
        Returns:
            Full cache key with prefix
        """
        prefix = "jusmonitoria:cache"
        
        if tenant_id:
            return f"{prefix}:tenant:{tenant_id}:{key}"
        
        return f"{prefix}:{key}"
    
    async def get(
        self,
        key: str,
        tenant_id: UUID | None = None,
    ) -> Any | None:
        """
        Get value from cache.
        
        Args:
            key: Cache key
            tenant_id: Optional tenant ID for isolation
            
        Returns:
            Cached value or None if not found
        """
        if not self._connected or not self.redis:
            return None
        
        try:
            full_key = self._make_key(key, tenant_id)
            value = await self.redis.get(full_key)
            
            if value is None:
                logger.debug(f"Cache miss: {full_key}")
                return None
            
            logger.debug(f"Cache hit: {full_key}")
            return self._deserialize(value)
        
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: int = 300,
        tenant_id: UUID | None = None,
    ) -> bool:
        """
        Set value in cache with TTL.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (default: 5 minutes)
            tenant_id: Optional tenant ID for isolation
            
        Returns:
            True if successful, False otherwise
        """
        if not self._connected or not self.redis:
            return False
        
        try:
            full_key = self._make_key(key, tenant_id)
            serialized = self._serialize(value)
            
            await self.redis.setex(full_key, ttl, serialized)
            logger.debug(f"Cache set: {full_key} (TTL: {ttl}s)")
            return True
        
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    async def delete(
        self,
        key: str,
        tenant_id: UUID | None = None,
    ) -> bool:
        """
        Delete value from cache.
        
        Args:
            key: Cache key
            tenant_id: Optional tenant ID for isolation
            
        Returns:
            True if deleted, False otherwise
        """
        if not self._connected or not self.redis:
            return False
        
        try:
            full_key = self._make_key(key, tenant_id)
            deleted = await self.redis.delete(full_key)
            
            if deleted:
                logger.debug(f"Cache deleted: {full_key}")
            
            return bool(deleted)
        
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    async def delete_pattern(
        self,
        pattern: str,
        tenant_id: UUID | None = None,
    ) -> int:
        """
        Delete all keys matching pattern.
        
        Useful for cache invalidation (e.g., delete all client-related caches).
        
        Args:
            pattern: Key pattern (supports * wildcard)
            tenant_id: Optional tenant ID for isolation
            
        Returns:
            Number of keys deleted
        """
        if not self._connected or not self.redis:
            return 0
        
        try:
            full_pattern = self._make_key(pattern, tenant_id)
            
            # Find all matching keys
            keys = []
            async for key in self.redis.scan_iter(match=full_pattern):
                keys.append(key)
            
            if not keys:
                return 0
            
            # Delete all matching keys
            deleted = await self.redis.delete(*keys)
            logger.debug(f"Cache pattern deleted: {full_pattern} ({deleted} keys)")
            
            return deleted
        
        except Exception as e:
            logger.error(f"Cache delete pattern error: {e}")
            return 0
    
    async def clear_tenant(self, tenant_id: UUID) -> int:
        """
        Clear all cache entries for a tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Number of keys deleted
        """
        return await self.delete_pattern("*", tenant_id=tenant_id)
    
    def cached(
        self,
        ttl: int = 300,
        key_prefix: str = "",
        tenant_aware: bool = True,
    ) -> Callable:
        """
        Decorator for caching function results.
        
        Args:
            ttl: Time to live in seconds
            key_prefix: Prefix for cache key
            tenant_aware: If True, include tenant_id in cache key
            
        Usage:
            @cache_service.cached(ttl=300, key_prefix="clients")
            async def get_client(tenant_id: UUID, client_id: UUID):
                return await db.get(client_id)
        """
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            async def wrapper(*args, **kwargs):
                # Build cache key from function name and arguments
                func_name = func.__name__
                
                # Extract tenant_id if tenant_aware
                tenant_id = None
                if tenant_aware:
                    # Try to find tenant_id in args or kwargs
                    if "tenant_id" in kwargs:
                        tenant_id = kwargs["tenant_id"]
                    elif args and isinstance(args[0], UUID):
                        tenant_id = args[0]
                
                # Create cache key from arguments
                key_parts = [key_prefix, func_name] if key_prefix else [func_name]
                
                # Add non-tenant arguments to key
                for arg in args:
                    if arg != tenant_id:
                        key_parts.append(str(arg))
                
                for k, v in sorted(kwargs.items()):
                    if k != "tenant_id":
                        key_parts.append(f"{k}:{v}")
                
                cache_key = ":".join(key_parts)
                
                # Try to get from cache
                cached_value = await self.get(cache_key, tenant_id=tenant_id)
                if cached_value is not None:
                    return cached_value
                
                # Execute function
                result = await func(*args, **kwargs)
                
                # Cache result
                await self.set(cache_key, result, ttl=ttl, tenant_id=tenant_id)
                
                return result
            
            return wrapper
        
        return decorator


# Global cache service instance
cache_service = CacheService()


async def init_cache() -> None:
    """Initialize cache service on application startup."""
    await cache_service.connect()


async def close_cache() -> None:
    """Close cache service on application shutdown."""
    await cache_service.disconnect()
