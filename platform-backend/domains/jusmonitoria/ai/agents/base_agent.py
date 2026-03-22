"""JusMonitorIA base agent — extends platform_core.ai.BaseAgent.

Adds tenant-scoped provider management and execution logging to the
AgentExecutionLog table. Original generic implementation lives in
platform_core/ai/base_agent.py.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.ai.base_agent import BaseAgent as _BaseAgent
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class BaseAgent(_BaseAgent):
    """JusMonitorIA-specific agent base with tenant isolation and DB logging.

    Subclasses must implement ``get_agent_name()`` and ``get_system_prompt()``.
    """

    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ) -> None:
        from domains.jusmonitoria.ai.providers.provider_manager import ProviderManager
        pm = ProviderManager(session, tenant_id)
        super().__init__(provider_manager=pm)
        self.session = session
        self.tenant_id = tenant_id

    @abstractmethod
    def get_agent_name(self) -> str:
        pass

    @abstractmethod
    def get_system_prompt(self) -> str:
        pass

    async def _log_execution(
        self,
        status: str,
        duration_ms: int,
        error_message: str | None = None,
    ) -> None:
        """Log agent execution to AgentExecutionLog table."""
        try:
            from domains.jusmonitoria.db.models.agent_execution_log import AgentExecutionLog

            llm_resp = self._last_llm_response

            log_entry = AgentExecutionLog(
                tenant_id=self.tenant_id,
                agent_name=self.get_agent_name(),
                status=status,
                input_tokens=llm_resp.input_tokens if llm_resp else 0,
                output_tokens=llm_resp.output_tokens if llm_resp else 0,
                total_tokens=llm_resp.total_tokens if llm_resp else 0,
                provider_used=llm_resp.provider if llm_resp else "unknown",
                model_used=llm_resp.model if llm_resp else "unknown",
                duration_ms=duration_ms,
                error_message=error_message,
            )
            self.session.add(log_entry)
            await self.session.flush()
        except Exception as log_err:
            logger.warning(
                "agent_execution_log_failed",
                error=str(log_err),
            )

    def _format_context(self, context: dict[str, Any]) -> str:
        """Format context for JusMonitorIA agents (legal domain-specific keys)."""
        parts: list[str] = []

        # Known keys with friendly labels
        key_labels = {
            "client": "Cliente",
            "contact": "Contato",
            "processes": "Processos",
            "recent_events": "Eventos recentes",
            "movements": "Movimentações",
        }

        for key, label in key_labels.items():
            if key in context:
                parts.append(f"{label}: {context[key]}")

        # Remaining keys
        for key, value in context.items():
            if key not in key_labels:
                parts.append(f"{key}: {value}")

        return "\n\n".join(parts)
