"""Message persistence service for Socialwise webhook history."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.message import Message


@dataclass(slots=True)
class SaveMessageOptions:
    chat_id: str
    content: str
    is_from_lead: bool
    external_id: str | None = None
    message_type: str = "text"
    metadata: dict[str, Any] | None = None


class MessageService:
    async def save_message(
        self,
        session: AsyncSession,
        options: SaveMessageOptions,
    ) -> Message | None:
        if options.external_id:
            existing = (
                await session.execute(
                    select(Message).where(
                        Message.chat_id == options.chat_id,
                        Message.external_id == options.external_id,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if existing:
                return None

        message = Message(
            chat_id=options.chat_id,
            content=options.content,
            is_from_lead=options.is_from_lead,
            external_id=options.external_id,
            message_type=options.message_type,
            metadata_json=options.metadata,
        )

        nested = await session.begin_nested()
        try:
            session.add(message)
            await session.flush()
        except IntegrityError:
            await nested.rollback()
            if options.external_id:
                return None
            raise
        else:
            await nested.commit()
        return message


message_service = MessageService()
