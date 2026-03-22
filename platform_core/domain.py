"""Domain plugin interface. Each business domain implements this contract."""

from abc import ABC, abstractmethod

from fastapi import FastAPI


class DomainPlugin(ABC):
    """Contract every domain must implement to register with the platform."""

    @abstractmethod
    def get_name(self) -> str:
        """Domain identifier (e.g. 'jusmonitoria', 'socialwise')."""
        ...

    @abstractmethod
    def get_route_prefix(self) -> str:
        """API route prefix (e.g. '/api/v1/jusmonitoria')."""
        ...

    @abstractmethod
    def register_routes(self, app: FastAPI) -> None:
        """Register FastAPI routers on the app."""
        ...

    @abstractmethod
    async def on_startup(self) -> None:
        """Called during app startup. Initialize domain-specific resources."""
        ...

    @abstractmethod
    async def on_shutdown(self) -> None:
        """Called during app shutdown. Cleanup domain-specific resources."""
        ...
