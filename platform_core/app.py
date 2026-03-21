"""FastAPI application factory with domain plugin registration."""

import logging
from contextlib import asynccontextmanager
from importlib import import_module

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from platform_core.config import settings
from platform_core.db.engines import close_all_engines
from platform_core.domain import DomainPlugin
from platform_core.logging.config import configure_logging, get_logger
from platform_core.shutdown.handler import setup_graceful_shutdown

configure_logging(settings.log_level)
logger = get_logger(__name__)

# Suppress noisy health-check lines
class _HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        return "GET /health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_HealthCheckFilter())


# Domain plugin registry
_DOMAIN_PLUGINS: dict[str, str] = {
    "jusmonitoria": "domains.jusmonitoria.plugin",
    "socialwise": "domains.socialwise.plugin",
}


def _load_domain_plugins() -> list[DomainPlugin]:
    """Load and instantiate active domain plugins."""
    plugins: list[DomainPlugin] = []
    for domain_name in settings.active_domain_list:
        module_path = _DOMAIN_PLUGINS.get(domain_name)
        if module_path is None:
            logger.warning("unknown_domain_skipped", domain=domain_name)
            continue
        try:
            module = import_module(module_path)
            plugin_cls = getattr(module, "plugin_class")
            plugin = plugin_cls()
            plugins.append(plugin)
            logger.info("domain_plugin_loaded", domain=domain_name)
        except Exception as e:
            logger.error("domain_plugin_load_failed", domain=domain_name, error=str(e))
    return plugins


def create_app() -> FastAPI:
    """Application factory. Creates and configures the FastAPI app."""

    plugins = _load_domain_plugins()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(
            "platform_startup",
            environment=settings.environment,
            domains=[p.get_name() for p in plugins],
        )

        shutdown_handler = setup_graceful_shutdown()
        shutdown_handler.setup_signal_handlers()

        # Start all domain brokers (non-worker process)
        from platform_core.tasks.brokers import broker_jm, broker_platform, broker_sw

        for broker in (broker_jm, broker_sw, broker_platform):
            if not broker.is_worker_process:
                await broker.startup()
        shutdown_handler.register_shutdown_callback(broker_jm.shutdown)
        shutdown_handler.register_shutdown_callback(broker_sw.shutdown)
        shutdown_handler.register_shutdown_callback(broker_platform.shutdown)
        logger.info("taskiq_brokers_started")

        # Domain startup
        for plugin in plugins:
            await plugin.on_startup()

        # DB cleanup on shutdown
        shutdown_handler.register_shutdown_callback(close_all_engines)

        yield

        # Shutdown
        logger.info("platform_shutdown_initiated")
        for plugin in plugins:
            try:
                await plugin.on_shutdown()
            except Exception as e:
                logger.error("domain_shutdown_error", domain=plugin.get_name(), error=str(e))

        if not shutdown_handler.is_shutting_down:
            for broker in (broker_jm, broker_sw, broker_platform):
                if not broker.is_worker_process:
                    try:
                        await broker.shutdown()
                    except Exception:
                        pass
            await close_all_engines()

        logger.info("platform_shutdown_complete")

    app = FastAPI(
        title="Platform Backend",
        description="Unified backend serving Socialwise and JusMonitorIA",
        version="0.1.0",
        lifespan=lifespan,
        debug=settings.debug,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # --- Middleware (reverse order = first to execute) ---
    if settings.compression_enabled:
        app.add_middleware(
            GZipMiddleware,
            minimum_size=settings.compression_minimum_size,
            compresslevel=settings.compression_level,
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-Tenant-ID",
            "X-Internal-API-Key",
        ],
        expose_headers=["Content-Length", "X-Request-ID"],
    )

    # --- Platform routes ---
    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "environment": settings.environment,
            "domains": settings.active_domain_list,
        }

    @app.get("/")
    async def root():
        return {
            "service": "Platform Backend",
            "version": "0.1.0",
            "domains": settings.active_domain_list,
            "docs": "/docs",
        }

    # --- Register domain routes ---
    for plugin in plugins:
        plugin.register_routes(app)
        logger.info(
            "domain_routes_registered",
            domain=plugin.get_name(),
            prefix=plugin.get_route_prefix(),
        )

    return app
