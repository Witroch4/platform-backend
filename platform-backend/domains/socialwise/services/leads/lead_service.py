"""LeadService — unified lead creation and lookup with cross-source dedup.

Port of: lib/services/lead-service.ts
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.account import Account
from domains.socialwise.db.models.chat import Chat
from domains.socialwise.db.models.lead import Lead, LeadSource
from domains.socialwise.db.base import generate_cuid
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

_PHONE_RE = re.compile(r"[^\d+]")


@dataclass(slots=True)
class FindOrCreateLeadOptions:
    chatwit_account_id: str
    phone_number: str | None = None
    chatwit_contact_id: str | None = None
    inbox_id: str | None = None
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


@dataclass(slots=True)
class LeadWithChat:
    lead: Lead
    chat: Chat
    created: bool


class LeadService:
    """Stateless service — receives session per call."""

    @staticmethod
    def normalize_phone(phone: str) -> str:
        return _PHONE_RE.sub("", phone)

    async def find_or_create_lead(
        self,
        session: AsyncSession,
        options: FindOrCreateLeadOptions,
    ) -> LeadWithChat:
        account_id = f"CHATWIT_{options.chatwit_account_id}"

        # Strategy 1: find by phone (cross-source)
        if options.phone_number:
            normalized = self.normalize_phone(options.phone_number)
            result = await session.execute(
                select(Lead).where(Lead.phone == normalized, Lead.account_id == account_id).limit(1)
            )
            existing = result.scalar_one_or_none()
            if existing:
                chat = await self._find_or_create_chat(session, existing.id, account_id)
                return LeadWithChat(lead=existing, chat=chat, created=False)

        # Strategy 2: find by Chatwit contact ID
        if options.chatwit_contact_id:
            result = await session.execute(
                select(Lead).where(
                    Lead.source_identifier == options.chatwit_contact_id,
                    Lead.account_id == account_id,
                ).limit(1)
            )
            existing = result.scalar_one_or_none()
            if existing:
                chat = await self._find_or_create_chat(session, existing.id, account_id)
                return LeadWithChat(lead=existing, chat=chat, created=False)

        # Validate Account exists before FK write
        account_exists = await session.execute(
            select(Account.id).where(Account.id == account_id).limit(1)
        )
        if not account_exists.scalar_one_or_none():
            raise ValueError(
                f"Account {account_id} não existe. Impossível criar Lead. "
                "Configure a Account primeiro ou vincule a inbox a uma Account válida."
            )

        source = LeadSource.WHATSAPP_SOCIAL_FLOW if options.inbox_id else LeadSource.CHATWIT_OAB
        source_identifier = (
            options.chatwit_contact_id
            or options.phone_number
            or f"auto_{generate_cuid()}"
        )

        new_lead = Lead(
            id=generate_cuid(),
            name=options.name or "Lead sem nome",
            phone=self.normalize_phone(options.phone_number) if options.phone_number else None,
            email=options.email,
            avatar_url=options.avatar_url,
            source=source.value,
            source_identifier=str(source_identifier),
            account_id=account_id,
            tags=[],
        )
        session.add(new_lead)
        await session.flush()

        chat = await self._find_or_create_chat(session, new_lead.id, account_id)
        return LeadWithChat(lead=new_lead, chat=chat, created=True)

    async def find_lead_by_phone(
        self, session: AsyncSession, phone_number: str, account_id: str,
    ) -> Lead | None:
        normalized = self.normalize_phone(phone_number)
        result = await session.execute(
            select(Lead).where(Lead.phone == normalized, Lead.account_id == account_id).limit(1)
        )
        return result.scalar_one_or_none()

    async def find_lead_by_source_identifier(
        self, session: AsyncSession, source_identifier: str, account_id: str,
    ) -> Lead | None:
        result = await session.execute(
            select(Lead).where(
                Lead.source_identifier == source_identifier,
                Lead.account_id == account_id,
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def touch_lead(self, session: AsyncSession, lead_id: str) -> None:
        from datetime import datetime, timezone

        result = await session.execute(select(Lead).where(Lead.id == lead_id).limit(1))
        lead = result.scalar_one_or_none()
        if lead:
            lead.updated_at = datetime.now(timezone.utc)

    async def _find_or_create_chat(
        self, session: AsyncSession, lead_id: str, account_id: str,
    ) -> Chat:
        result = await session.execute(
            select(Chat).where(Chat.lead_id == lead_id, Chat.account_id == account_id).limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        chat = Chat(id=generate_cuid(), lead_id=lead_id, account_id=account_id)
        session.add(chat)
        await session.flush()
        return chat


lead_service = LeadService()
