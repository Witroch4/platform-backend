"""ChatwitConversationResolver — Find/create contact + conversation in Chatwit.

Port of services/flow-engine/chatwit-conversation-resolver.ts (axios → httpx).

Used by campaigns where there is no pre-existing conversation.
Ensures the template/message has a valid conversation before sending.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from platform_core.logging.config import get_logger

logger = get_logger(__name__)

REQUEST_TIMEOUT_S = 10.0


@dataclass(slots=True)
class ResolvedConversation:
    contact_id: int
    conversation_id: int
    display_id: int


class ChatwitConversationResolver:
    def __init__(self, base_url: str, token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token

    async def resolve(
        self,
        account_id: int,
        inbox_id: int,
        phone: str,
        contact_name: str | None = None,
    ) -> ResolvedConversation:
        """Resolve (find or create) contact + conversation for a phone number."""
        contact = await self._search_contact(account_id, phone)
        if not contact:
            contact = await self._create_contact(account_id, inbox_id, phone, contact_name)

        conversation = await self._create_conversation(account_id, inbox_id, contact["id"])

        logger.info(
            "chatwit_conversation_resolved",
            contact_id=contact["id"],
            conversation_id=conversation["id"],
            display_id=conversation["display_id"],
            phone=phone,
        )

        return ResolvedConversation(
            contact_id=contact["id"],
            conversation_id=conversation["id"],
            display_id=conversation["display_id"],
        )

    def _headers(self) -> dict[str, str]:
        return {
            "api_access_token": self._token,
            "Content-Type": "application/json",
        }

    async def _search_contact(self, account_id: int, phone: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                resp = await client.get(
                    f"{self._base_url}/api/v1/accounts/{account_id}/contacts/search",
                    params={"q": phone, "include_contacts": True},
                    headers=self._headers(),
                )
                resp.raise_for_status()
                contacts = resp.json().get("payload", [])
                if not contacts:
                    return None
                phone_clean = phone.lstrip("+")
                exact = next(
                    (c for c in contacts if c.get("phone_number") in (phone, phone_clean)),
                    None,
                )
                return exact or contacts[0]
        except Exception as exc:
            logger.warning("chatwit_contact_search_error", phone=phone, error=str(exc))
            return None

    async def _create_contact(
        self, account_id: int, inbox_id: int, phone: str, name: str | None = None,
    ) -> dict:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.post(
                f"{self._base_url}/api/v1/accounts/{account_id}/contacts",
                json={"name": name or phone, "phone_number": phone, "inbox_id": inbox_id},
                headers=self._headers(),
            )
            resp.raise_for_status()
            contact = resp.json().get("payload", {}).get("contact")
            if not contact:
                raise RuntimeError("Failed to create contact: unexpected Chatwit response")
            logger.info("chatwit_contact_created", contact_id=contact["id"], phone=phone)
            return contact

    async def _create_conversation(self, account_id: int, inbox_id: int, contact_id: int) -> dict:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.post(
                f"{self._base_url}/api/v1/accounts/{account_id}/conversations",
                json={"inbox_id": inbox_id, "contact_id": contact_id},
                headers=self._headers(),
            )
            resp.raise_for_status()
            conversation = resp.json()
            if not conversation or not conversation.get("id"):
                raise RuntimeError("Failed to create conversation: unexpected Chatwit response")
            return conversation
