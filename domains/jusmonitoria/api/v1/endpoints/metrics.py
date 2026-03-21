"""Metrics endpoint for Prometheus scraping."""

from fastapi import APIRouter, Response

from domains.jusmonitoria.metrics import get_metrics

router = APIRouter(tags=["monitoring"])


@router.get("/metrics")
async def prometheus_metrics() -> Response:
    """
    Prometheus metrics endpoint.
    
    Returns metrics in Prometheus exposition format for scraping.
    This endpoint should be exposed to Prometheus but not to public internet.
    
    Returns:
        Response with metrics in text/plain format
    """
    metrics = get_metrics()
    return Response(content=metrics, media_type="text/plain; charset=utf-8")
