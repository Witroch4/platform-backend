"""JusMonitorIA domain plugin."""

from fastapi import APIRouter, FastAPI

from platform_core.domain import DomainPlugin
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

PREFIX = "/api/v1/jusmonitoria"


class JusMonitorIAPlugin(DomainPlugin):
    def get_name(self) -> str:
        return "jusmonitoria"

    def get_route_prefix(self) -> str:
        return PREFIX

    def register_routes(self, app: FastAPI) -> None:
        from domains.jusmonitoria.api.v1.endpoints import (
            admin,
            audit,
            auth,
            casos_oab,
            certificados,
            clients,
            contratos,
            dashboard,
            financeiro,
            health,
            integrations,
            jarvis,
            leads,
            metrics as metrics_ep,
            pdf_converter,
            peticoes,
            pje,
            processos,
            processos_monitorados,
            profile,
            search,
            storage,
            tpu,
            tribunais,
            two_factor,
            webhooks,
        )
        from domains.jusmonitoria.api.v1.notifications import router as notifications_router

        # All endpoint routers get the domain prefix
        for ep_router in [
            auth.router,
            leads.router,
            clients.router,
            dashboard.router,
            audit.router,
            profile.router,
            integrations.router,
            admin.router,
            certificados.router,
            peticoes.router,
            pje.router,
            tribunais.router,
            processos.router,
            processos_monitorados.router,
            tpu.router,
            casos_oab.router,
            contratos.router,
            financeiro.router,
            storage.router,
            jarvis.router,
            two_factor.router,
            search.router,
            pdf_converter.router,
            notifications_router,
        ]:
            app.include_router(ep_router, prefix=PREFIX)

        # Webhooks at root (no domain prefix — Chatwit sends to fixed path)
        app.include_router(webhooks.router, tags=["jusmonitoria-webhooks"])

        # Health and metrics at domain level
        app.include_router(health.router, prefix=PREFIX)
        app.include_router(metrics_ep.router, prefix=PREFIX)

        # WebSocket
        from domains.jusmonitoria.api.v1.websocket import websocket_endpoint

        app.websocket(f"{PREFIX}/ws")(websocket_endpoint)

        logger.info("jusmonitoria_routes_registered", prefix=PREFIX)

    async def on_startup(self) -> None:
        from platform_core.config import settings

        # Start scheduler if enabled
        if settings.scheduler_enabled:
            try:
                from domains.jusmonitoria.tasks.scheduler import start_scheduler

                await start_scheduler()
                logger.info("jusmonitoria_scheduler_started")
            except Exception as e:
                logger.error("jusmonitoria_scheduler_start_failed", error=str(e))

        # Ensure TPU tables populated
        try:
            from domains.jusmonitoria.tasks.tpu_sync import ensure_tpu_populated

            await ensure_tpu_populated()
        except Exception as e:
            logger.error("tpu_populate_check_failed", error=str(e))

        logger.info("jusmonitoria_domain_started")

    async def on_shutdown(self) -> None:
        try:
            from platform_core.config import settings

            if settings.scheduler_enabled:
                from domains.jusmonitoria.tasks.scheduler import stop_scheduler

                await stop_scheduler()
                logger.info("jusmonitoria_scheduler_stopped")
        except Exception as e:
            logger.error("jusmonitoria_scheduler_stop_failed", error=str(e))

        logger.info("jusmonitoria_domain_stopped")


# Required by platform plugin loader
plugin_class = JusMonitorIAPlugin
