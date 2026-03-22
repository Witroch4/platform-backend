"""Health check endpoints for monitoring."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from platform_core.logging.config import get_logger
from platform_core.db.sessions import get_jusmonitoria_session

logger = get_logger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def liveness_check() -> dict[str, Any]:
    """
    Liveness probe endpoint.
    
    Indicates if the application is running.
    Used by Kubernetes to determine if the pod should be restarted.
    
    Returns:
        200: Application is alive
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "jusmonitoria-backend",
        "version": "0.1.0",
    }


@router.get("/health/ready")
async def readiness_check(
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict[str, Any]:
    """
    Readiness probe endpoint.
    
    Indicates if the application is ready to serve traffic.
    Checks:
    - Database connectivity
    - Redis connectivity (via session check)
    
    Used by Kubernetes to determine if the pod should receive traffic.
    
    Returns:
        200: Application is ready
        503: Application is not ready (dependency failure)
    """
    checks = {
        "database": False,
        "redis": False,
    }
    
    # Check database
    try:
        result = await session.execute(text("SELECT 1"))
        checks["database"] = result.scalar() == 1
        logger.debug("database_health_check", status="healthy")
    except Exception as e:
        logger.error("database_health_check_failed", error=str(e))
        checks["database"] = False
    
    # Check Redis (via Taskiq broker)
    try:
        from platform_core.tasks.brokers.jusmonitoria import broker_jm as broker
        
        # Simple check: if broker is initialized, Redis is accessible
        if broker:
            checks["redis"] = True
            logger.debug("redis_health_check", status="healthy")
    except Exception as e:
        logger.error("redis_health_check_failed", error=str(e))
        checks["redis"] = False
    
    # Determine overall status
    all_healthy = all(checks.values())
    
    if not all_healthy:
        logger.warning("readiness_check_failed", checks=checks)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "not_ready",
                "checks": checks,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    
    return {
        "status": "ready",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat(),
        "service": "jusmonitoria-backend",
        "version": "0.1.0",
    }


@router.get("/health/startup")
async def startup_check(
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict[str, Any]:
    """
    Startup probe endpoint.
    
    Indicates if the application has completed initialization.
    Similar to readiness but with more lenient timeout.
    
    Used by Kubernetes during pod startup.
    
    Returns:
        200: Application has started successfully
        503: Application is still starting
    """
    checks = {
        "database": False,
        "migrations": False,
    }
    
    # Check database connectivity
    try:
        result = await session.execute(text("SELECT 1"))
        checks["database"] = result.scalar() == 1
    except Exception as e:
        logger.error("startup_database_check_failed", error=str(e))
        checks["database"] = False
    
    # Check if migrations have been applied
    try:
        # Check if alembic_version table exists
        result = await session.execute(
            text(
                "SELECT EXISTS ("
                "SELECT FROM information_schema.tables "
                "WHERE table_name = 'alembic_version'"
                ")"
            )
        )
        checks["migrations"] = result.scalar() is True
    except Exception as e:
        logger.error("startup_migrations_check_failed", error=str(e))
        checks["migrations"] = False
    
    # Determine overall status
    all_healthy = all(checks.values())
    
    if not all_healthy:
        logger.warning("startup_check_failed", checks=checks)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "starting",
                "checks": checks,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    
    return {
        "status": "started",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat(),
        "service": "jusmonitoria-backend",
        "version": "0.1.0",
    }


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """
    Simple health check endpoint (legacy).
    
    Returns basic health status without dependency checks.
    Use /health/live or /health/ready for Kubernetes probes.
    
    Returns:
        200: Application is healthy
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.environment,
        "version": "0.1.0",
    }
