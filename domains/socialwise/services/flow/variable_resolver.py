"""VariableResolver — Resolve ``{{variables}}`` in text templates.

Port of services/flow-engine/variable-resolver.ts.

Substitutes placeholders ``{{varName}}`` with the corresponding value
from the flow execution context (session vars + contact + system).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from platform_core.logging.config import get_logger

logger = get_logger(__name__)

VARIABLE_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

# Brazil timezone for system date/time
try:
    from zoneinfo import ZoneInfo
    _BR_TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    _BR_TZ = None


class VariableResolver:
    """Resolve ``{{var}}`` placeholders in text strings."""

    def __init__(
        self,
        context: Any,
        session_variables: dict[str, Any] | None = None,
    ) -> None:
        self._ctx = context
        self._session_vars: dict[str, Any] = dict(session_variables or {})

    # -------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------

    def resolve(self, template: str) -> str:
        """Resolve all ``{{variables}}`` in a string. Unknown vars stay unchanged."""
        if not template or "{{" not in template:
            return template

        def _replacer(match: re.Match) -> str:
            var_name = match.group(1)
            value = self._lookup(var_name)
            if value is None:
                return f"{{{{{var_name}}}}}"
            return str(value)

        return VARIABLE_PATTERN.sub(_replacer, template)

    def resolve_object(self, obj: dict[str, Any]) -> dict[str, Any]:
        """Resolve variables in all string values of a dict (shallow)."""
        resolved = dict(obj)
        for key, value in resolved.items():
            if isinstance(value, str):
                resolved[key] = self.resolve(value)
        return resolved

    def set_variable(self, name: str, value: Any) -> None:
        self._session_vars[name] = value

    def get_variable(self, name: str) -> Any:
        return self._session_vars.get(name)

    def get_session_variables(self) -> dict[str, Any]:
        return dict(self._session_vars)

    def get_available_variables(self) -> list[dict[str, str]]:
        """Return all available variables (for UI autocomplete)."""
        now = _now_br()
        variables: list[dict[str, str]] = [
            {"name": "system_timestamp", "value": now.isoformat(), "source": "system"},
            {"name": "system_date", "value": now.strftime("%d/%m/%Y"), "source": "system"},
            {"name": "system_time", "value": now.strftime("%H:%M:%S"), "source": "system"},
            {"name": "contact_name", "value": str(self._ctx_get("contact_name", "")), "source": "contact"},
            {"name": "contact_phone", "value": str(self._ctx_get("contact_phone", "")), "source": "contact"},
            {"name": "contact_id", "value": str(self._ctx_get("contact_id", "")), "source": "contact"},
            {"name": "conversation_id", "value": str(self._ctx_get("conversation_id", "")), "source": "conversation"},
            {"name": "conversation_channel", "value": str(self._ctx_get("channel_type", "")), "source": "conversation"},
            {"name": "conversation_inbox_id", "value": str(self._ctx_get("inbox_id", "")), "source": "conversation"},
        ]
        for key, value in self._session_vars.items():
            variables.append({
                "name": key,
                "value": str(value) if value is not None else "",
                "source": "session",
            })
        return variables

    # -------------------------------------------------------------------
    # Lookup chain
    # -------------------------------------------------------------------

    def _lookup(self, var_name: str) -> Any:
        # 1. Session variables (highest priority)
        if var_name in self._session_vars:
            return self._session_vars[var_name]

        # Normalize: accept both dot notation and underscore
        normalized = var_name
        if "_" in var_name and "." not in var_name:
            for prefix in ("contact", "conversation", "system"):
                if var_name.startswith(f"{prefix}_"):
                    normalized = var_name.replace(f"{prefix}_", f"{prefix}.", 1)
                    break

        # 2. Contact variables
        if normalized.startswith("contact."):
            return self._lookup_contact(normalized[len("contact."):])

        # 3. Conversation variables
        if normalized.startswith("conversation."):
            return self._lookup_conversation(normalized[len("conversation."):])

        # 4. System variables
        if normalized.startswith("system."):
            return self._lookup_system(normalized[len("system."):])

        # 5. Fallback: nested dot notation in session vars
        return self._lookup_nested(self._session_vars, var_name)

    def _lookup_contact(self, field: str) -> Any:
        contact_map = {
            "name": self._ctx_get("contact_name"),
            "phone": self._ctx_get("contact_phone"),
            "id": self._ctx_get("contact_id"),
        }
        return contact_map.get(field)

    def _lookup_conversation(self, field: str) -> Any:
        conv_map = {
            "id": self._ctx_get("conversation_id"),
            "channel": self._ctx_get("channel_type"),
            "inbox_id": self._ctx_get("inbox_id"),
            "account_id": self._ctx_get("account_id"),
        }
        return conv_map.get(field)

    def _lookup_system(self, field: str) -> Any:
        now = _now_br()
        system_map: dict[str, Any] = {
            "timestamp": now.isoformat(),
            "date": now.strftime("%d/%m/%Y"),
            "time": now.strftime("%H:%M:%S"),
            "epoch": int(now.timestamp() * 1000),
        }
        return system_map.get(field)

    @staticmethod
    def _lookup_nested(obj: dict[str, Any], path: str) -> Any:
        """Resolve dot notation in nested dicts."""
        parts = path.split(".")
        current: Any = obj
        for part in parts:
            if current is None or not isinstance(current, dict):
                return None
            current = current.get(part)
        return current

    def _ctx_get(self, key: str, default: Any = None) -> Any:
        if isinstance(self._ctx, dict):
            return self._ctx.get(key, default)
        if hasattr(self._ctx, key):
            return getattr(self._ctx, key, default)
        return default


def _now_br() -> datetime:
    """Return current time in Brazil timezone."""
    if _BR_TZ:
        return datetime.now(_BR_TZ)
    return datetime.utcnow()
