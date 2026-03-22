"""Main API v1 router."""

from fastapi import APIRouter

from domains.jusmonitoria.api.v1.endpoints import (
    auth,
    certificados,
    clients,
    dashboard,
    financeiro,
    integrations,
    jarvis,
    leads,
    peticoes,
    pje,
    processos,
    search,
    storage,
    two_factor,
    webhooks,
)

# Create main API v1 router
api_router = APIRouter(prefix="/v1")

# Include endpoint routers
api_router.include_router(auth.router)
api_router.include_router(clients.router)
api_router.include_router(dashboard.router)
api_router.include_router(leads.router)
api_router.include_router(webhooks.router)
api_router.include_router(financeiro.router)
api_router.include_router(certificados.router)
api_router.include_router(peticoes.router)
api_router.include_router(processos.router)
api_router.include_router(pje.router)
api_router.include_router(storage.router)
api_router.include_router(jarvis.router)
api_router.include_router(two_factor.router)
api_router.include_router(integrations.router)
api_router.include_router(search.router)

__all__ = ["api_router"]
