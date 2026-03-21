"""Socialwise domain plugin. Registers routes and tasks for the Socialwise product."""

from fastapi import APIRouter, FastAPI

from platform_core.domain import DomainPlugin
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class SocialwisePlugin(DomainPlugin):
    def get_name(self) -> str:
        return "socialwise"

    def get_route_prefix(self) -> str:
        return "/api/v1/socialwise"

    def register_routes(self, app: FastAPI) -> None:
        from domains.socialwise.api.v1.endpoints import admin_flows, admin_mtf, webhook, webhook_init

        router = APIRouter(prefix=self.get_route_prefix(), tags=["socialwise"])

        @router.get("/health")
        async def socialwise_health():
            return {"domain": "socialwise", "status": "healthy"}

        app.include_router(router)
        app.include_router(admin_flows.router)
        app.include_router(admin_mtf.router)
        app.include_router(webhook.router)
        app.include_router(webhook_init.router)

    async def on_startup(self) -> None:
        logger.info("socialwise_domain_started")

    async def on_shutdown(self) -> None:
        logger.info("socialwise_domain_stopped")


# Required by platform plugin loader
plugin_class = SocialwisePlugin
