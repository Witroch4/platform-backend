"""Graceful shutdown handler with signal handling and callback system."""

import asyncio
import signal
from typing import Callable, Coroutine

import structlog

logger = structlog.get_logger(__name__)


class GracefulShutdown:
    """Manages graceful shutdown with timeout and callbacks."""

    def __init__(self, shutdown_timeout: float = 30.0, force_timeout: float = 60.0):
        self.shutdown_timeout = shutdown_timeout
        self.force_timeout = force_timeout
        self.is_shutting_down = False
        self._callbacks: list[Callable[[], Coroutine]] = []
        self._in_flight = 0

    def increment_requests(self) -> None:
        self._in_flight += 1

    def decrement_requests(self) -> None:
        self._in_flight = max(0, self._in_flight - 1)

    def register_shutdown_callback(self, callback: Callable[[], Coroutine]) -> None:
        self._callbacks.append(callback)

    def setup_signal_handlers(self) -> None:
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(self._handle(s)))

    async def _handle(self, sig: signal.Signals) -> None:
        if self.is_shutting_down:
            return
        self.is_shutting_down = True
        logger.info("shutdown_signal_received", signal=sig.name)

        for callback in self._callbacks:
            try:
                await asyncio.wait_for(callback(), timeout=self.shutdown_timeout)
            except asyncio.TimeoutError:
                logger.warning("shutdown_callback_timeout", callback=str(callback))
            except Exception as e:
                logger.error("shutdown_callback_error", error=str(e))

        logger.info("graceful_shutdown_complete")


_instance: GracefulShutdown | None = None


def get_shutdown_handler() -> GracefulShutdown:
    """Get or create the singleton shutdown handler."""
    global _instance
    if _instance is None:
        _instance = GracefulShutdown()
    return _instance


def setup_graceful_shutdown(
    shutdown_timeout: float = 30.0,
    force_shutdown_timeout: float = 60.0,
) -> GracefulShutdown:
    global _instance
    _instance = GracefulShutdown(shutdown_timeout, force_shutdown_timeout)
    return _instance
