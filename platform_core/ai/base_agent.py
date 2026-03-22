"""Base agent class for LLM-powered agents.

Extracted from domains/jusmonitoria/ai/agents/base_agent.py into shared
platform_core so both Socialwise and JusMonitorIA can build agents on the
same foundation.

Domains subclass ``BaseAgent`` to add:
- Tenant-aware provider management
- Domain-specific execution logging (e.g. AgentExecutionLog table)
- Custom context formatting
"""

from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from typing import Any

from platform_core.ai.litellm_config import LLMResponse
from platform_core.ai.provider_manager import ProviderManager, provider_manager as _default_pm
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class BaseAgent(ABC):
    """Abstract base for all AI agents across domains.

    Subclasses must implement ``get_agent_name()`` and ``get_system_prompt()``.
    Override ``_log_execution()`` to persist execution logs to a domain-specific table.
    """

    def __init__(
        self,
        provider_manager: ProviderManager | None = None,
    ) -> None:
        self.provider_manager = provider_manager or _default_pm
        self._last_llm_response: LLMResponse | None = None

    # ── Abstract interface ───────────────────────────────────────────────

    @abstractmethod
    def get_agent_name(self) -> str:
        """Return agent name (used for logging and metrics)."""

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the system prompt for this agent."""

    # ── Core execution ───────────────────────────────────────────────────

    async def execute(
        self,
        user_message: str,
        *,
        context: dict[str, Any] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        use_case: str = "default",
    ) -> str:
        """Execute the agent with provider fallback.

        Args:
            user_message: The user's message/query.
            context: Optional context dict injected as a second system message.
            temperature: Override temperature.
            max_tokens: Override max tokens.
            use_case: Provider chain — "default", "document", or "daily".

        Returns:
            Agent's text response.
        """
        logger.info(
            "agent_executing",
            agent=self.get_agent_name(),
            message_length=len(user_message),
        )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.get_system_prompt()},
        ]

        if context:
            context_str = self._format_context(context)
            messages.append({"role": "system", "content": context_str})

        messages.append({"role": "user", "content": user_message})

        start_time = time.monotonic()
        execution_status = "success"
        error_msg: str | None = None

        try:
            llm_response = await self.provider_manager.call_with_fallback(
                messages=messages,
                use_case=use_case,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            self._last_llm_response = llm_response

            logger.info(
                "agent_completed",
                agent=self.get_agent_name(),
                response_length=len(llm_response.content),
                provider=llm_response.provider,
                model=llm_response.model,
            )
            return llm_response.content

        except Exception as e:
            execution_status = "error"
            error_msg = str(e)
            logger.error(
                "agent_failed",
                agent=self.get_agent_name(),
                error=error_msg,
            )
            raise

        finally:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            await self._log_execution(
                status=execution_status,
                duration_ms=duration_ms,
                error_message=error_msg,
            )

    # ── Hooks (override in subclasses) ───────────────────────────────────

    async def _log_execution(
        self,
        status: str,
        duration_ms: int,
        error_message: str | None = None,
    ) -> None:
        """Log agent execution. Override in domain subclass to persist to DB.

        Default implementation logs to structlog only.
        """
        llm = self._last_llm_response
        logger.info(
            "agent_execution_logged",
            agent=self.get_agent_name(),
            status=status,
            duration_ms=duration_ms,
            provider=llm.provider if llm else "unknown",
            model=llm.model if llm else "unknown",
            input_tokens=llm.input_tokens if llm else 0,
            output_tokens=llm.output_tokens if llm else 0,
            error=error_message,
        )

    # ── Utilities ────────────────────────────────────────────────────────

    def _format_context(self, context: dict[str, Any]) -> str:
        """Format context dict into a string for the LLM.

        Override in subclass for domain-specific formatting.
        """
        parts: list[str] = []
        for key, value in context.items():
            parts.append(f"{key}: {value}")
        return "\n\n".join(parts)

    @staticmethod
    def parse_json_response(response: str) -> dict[str, Any]:
        """Parse JSON from LLM response, handling markdown code blocks.

        Raises:
            ValueError: If response is not valid JSON.
        """
        text = response.strip()

        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]

        if text.endswith("```"):
            text = text[:-3]

        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(
                "json_parse_failed",
                response_preview=text[:200],
                error=str(e),
            )
            raise ValueError(f"Invalid JSON response: {e}") from e
