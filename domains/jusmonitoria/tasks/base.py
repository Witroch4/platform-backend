"""Base task infrastructure with decorators for retry, timeout, and rate limiting."""

import asyncio
import functools
from datetime import datetime
from typing import Any, Callable, ParamSpec, TypeVar

import structlog
from redis.asyncio import Redis

from platform_core.config import settings

logger = structlog.get_logger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


class BaseTask:
    """
    Base class for all async tasks.
    
    Provides:
    - Structured logging with context
    - Error handling and reporting
    - Task metadata tracking
    """

    def __init__(self, task_name: str):
        """
        Initialize base task.
        
        Args:
            task_name: Name of the task for logging
        """
        self.task_name = task_name
        self.logger = logger.bind(task_name=task_name)

    async def execute(self, *args: Any, **kwargs: Any) -> Any:
        """
        Execute the task.
        
        Override this method in subclasses.
        
        Args:
            *args: Positional arguments
            **kwargs: Keyword arguments
            
        Returns:
            Task result
        """
        raise NotImplementedError("Subclasses must implement execute()")

    async def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """
        Call the task with automatic logging and error handling.
        
        Args:
            *args: Positional arguments
            **kwargs: Keyword arguments
            
        Returns:
            Task result
        """
        start_time = datetime.utcnow()
        
        try:
            self.logger.info("task_started", args=args, kwargs=kwargs)
            
            result = await self.execute(*args, **kwargs)
            
            duration = (datetime.utcnow() - start_time).total_seconds()
            self.logger.info("task_completed", duration_seconds=duration)
            
            return result
            
        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds()
            self.logger.error(
                "task_failed",
                error=str(e),
                error_type=type(e).__name__,
                duration_seconds=duration,
            )
            raise


def with_retry(
    max_retries: int = 3,
    backoff_factor: float = 2.0,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
):
    """
    Decorator to add retry logic with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        backoff_factor: Multiplier for delay between retries
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        
    Example:
        @with_retry(max_retries=3, backoff_factor=2.0)
        async def my_task():
            # Task implementation
            pass
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_exception = None
            delay = initial_delay
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                    
                except Exception as e:
                    last_exception = e
                    
                    if attempt < max_retries:
                        logger.warning(
                            "task_retry",
                            function=func.__name__,
                            attempt=attempt + 1,
                            max_retries=max_retries,
                            delay_seconds=delay,
                            error=str(e),
                        )
                        
                        await asyncio.sleep(delay)
                        
                        # Exponential backoff with max delay
                        delay = min(delay * backoff_factor, max_delay)
                    else:
                        logger.error(
                            "task_retry_exhausted",
                            function=func.__name__,
                            max_retries=max_retries,
                            error=str(e),
                        )
            
            # Re-raise the last exception after all retries
            if last_exception:
                raise last_exception
            
            # This should never happen, but satisfy type checker
            raise RuntimeError("Unexpected retry logic error")
        
        return wrapper
    
    return decorator


def with_timeout(timeout_seconds: float):
    """
    Decorator to add timeout to async tasks.
    
    Args:
        timeout_seconds: Maximum execution time in seconds
        
    Example:
        @with_timeout(30.0)
        async def my_task():
            # Task implementation
            pass
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            try:
                return await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                logger.error(
                    "task_timeout",
                    function=func.__name__,
                    timeout_seconds=timeout_seconds,
                )
                raise
        
        return wrapper
    
    return decorator


def with_rate_limit(
    max_calls: int,
    period_seconds: int,
    key_prefix: str | None = None,
):
    """
    Decorator to add rate limiting to async tasks.
    
    Uses Redis to track call counts across workers.
    
    Args:
        max_calls: Maximum number of calls allowed
        period_seconds: Time period in seconds
        key_prefix: Optional prefix for Redis key (defaults to function name)
        
    Example:
        @with_rate_limit(max_calls=100, period_seconds=60)
        async def my_task():
            # Task implementation
            pass
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            redis = Redis.from_url(str(settings.redis_url))
            
            try:
                # Generate rate limit key
                prefix = key_prefix or func.__name__
                rate_limit_key = f"jusmonitoria:ratelimit:{prefix}"
                
                # Check current count
                current_count = await redis.get(rate_limit_key)
                
                if current_count is not None and int(current_count) >= max_calls:
                    # Rate limit exceeded
                    ttl = await redis.ttl(rate_limit_key)
                    
                    logger.warning(
                        "rate_limit_exceeded",
                        function=func.__name__,
                        max_calls=max_calls,
                        period_seconds=period_seconds,
                        retry_after_seconds=ttl,
                    )
                    
                    raise RateLimitExceeded(
                        f"Rate limit exceeded: {max_calls} calls per {period_seconds}s. "
                        f"Retry after {ttl}s"
                    )
                
                # Increment counter
                pipe = redis.pipeline()
                pipe.incr(rate_limit_key)
                pipe.expire(rate_limit_key, period_seconds)
                await pipe.execute()
                
                # Execute function
                return await func(*args, **kwargs)
                
            finally:
                await redis.close()
        
        return wrapper
    
    return decorator


class RateLimitExceeded(Exception):
    """Exception raised when rate limit is exceeded."""

    pass


class TaskConcurrencyLimiter:
    """
    Limit concurrent execution of tasks.
    
    Uses Redis to coordinate across multiple workers.
    """

    def __init__(
        self,
        max_concurrent: int,
        key_prefix: str,
        timeout_seconds: float = 300.0,
    ):
        """
        Initialize concurrency limiter.
        
        Args:
            max_concurrent: Maximum number of concurrent executions
            key_prefix: Prefix for Redis keys
            timeout_seconds: Timeout for acquiring lock
        """
        self.max_concurrent = max_concurrent
        self.key_prefix = key_prefix
        self.timeout_seconds = timeout_seconds
        self.redis: Redis | None = None

    async def __aenter__(self):
        """Acquire concurrency slot."""
        self.redis = Redis.from_url(str(settings.redis_url))
        
        start_time = datetime.utcnow()
        semaphore_key = f"jusmonitoria:concurrency:{self.key_prefix}"
        
        while True:
            # Try to acquire slot
            current = await self.redis.incr(semaphore_key)
            
            if current <= self.max_concurrent:
                # Set expiry to prevent leaks
                await self.redis.expire(semaphore_key, 300)
                logger.info(
                    "concurrency_slot_acquired",
                    key=self.key_prefix,
                    current=current,
                    max=self.max_concurrent,
                )
                return self
            
            # Release the increment
            await self.redis.decr(semaphore_key)
            
            # Check timeout
            elapsed = (datetime.utcnow() - start_time).total_seconds()
            if elapsed >= self.timeout_seconds:
                raise TimeoutError(
                    f"Failed to acquire concurrency slot within {self.timeout_seconds}s"
                )
            
            # Wait before retry
            await asyncio.sleep(0.5)

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Release concurrency slot."""
        if self.redis:
            semaphore_key = f"jusmonitoria:concurrency:{self.key_prefix}"
            await self.redis.decr(semaphore_key)
            
            logger.info(
                "concurrency_slot_released",
                key=self.key_prefix,
            )
            
            await self.redis.close()
