"""Instagram webhook business logic ported from the Socialwise BullMQ worker."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.account import Account
from domains.socialwise.db.models.automacao import Automacao
from domains.socialwise.db.models.lead import Lead, LeadSource
from domains.socialwise.db.models.lead_automacao import LeadAutomacao
from domains.socialwise.db.models.lead_instagram_profile import LeadInstagramProfile
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+-]+@(gmail|outlook|icloud|aol|zoho|yahoo|gmx|protonmail|hotmail)\.com(\.br)?$", re.I)


async def _get_instagram_account(session: AsyncSession, ig_user_id: str) -> Account | None:
    stmt = (
        select(Account)
        .where(Account.provider == "instagram", Account.ig_user_id == ig_user_id)
        .order_by(Account.updated_at.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _get_instagram_user_token(session: AsyncSession, ig_user_id: str) -> str | None:
    account = await _get_instagram_account(session, ig_user_id)
    if account is None or not account.access_token:
        return None
    return account.access_token


async def _send_graph_request(
    endpoint: str,
    *,
    access_token: str,
    json_body: dict[str, Any] | None = None,
    form_body: dict[str, Any] | None = None,
) -> None:
    async with httpx.AsyncClient(timeout=20.0) as client:
        if form_body is not None:
            response = await client.post(
                endpoint,
                data={**form_body, "access_token": access_token},
            )
        else:
            response = await client.post(
                endpoint,
                params={"access_token": access_token},
                json=json_body,
            )
        response.raise_for_status()


def _pick_random_public_reply(public_reply: str | None) -> str:
    if public_reply:
        try:
            replies = json.loads(public_reply)
        except json.JSONDecodeError:
            replies = []
        if isinstance(replies, list) and replies:
            import random

            return random.choice([str(item) for item in replies])
    return "Olá! Eu te mandei uma mensagem privada, dá uma olhada! ✅"


async def _reply_public_comment(comment_id: str, access_token: str, message: str) -> None:
    await _send_graph_request(
        f"{settings.socialwise_instagram_graph_api_base}/{comment_id}/replies",
        access_token=access_token,
        form_body={"message": message},
    )


async def _send_private_reply_with_button(
    *,
    ig_user_id: str,
    access_token: str,
    comment_id: str,
    text: str,
    button_title: str,
    button_payload: str,
) -> None:
    await _send_graph_request(
        f"{settings.socialwise_instagram_graph_api_base}/{ig_user_id}/messages",
        access_token=access_token,
        json_body={
            "recipient": {"comment_id": comment_id},
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "button",
                        "text": text,
                        "buttons": [{"type": "postback", "title": button_title, "payload": button_payload}],
                    },
                },
            },
        },
    )


async def _send_follow_request_message(
    *,
    ig_user_id: str,
    access_token: str,
    recipient_id: str,
    follow_prompt: str,
    button_payload: str,
) -> None:
    await _send_graph_request(
        f"{settings.socialwise_instagram_graph_api_base}/{ig_user_id}/messages",
        access_token=access_token,
        json_body={
            "recipient": {"id": recipient_id},
            "message": {
                "text": follow_prompt,
                "quick_replies": [
                    {"content_type": "text", "title": "Estou seguindo", "payload": button_payload},
                ],
            },
        },
    )


async def _send_email_request_message(
    *,
    ig_user_id: str,
    access_token: str,
    recipient_id: str,
    email_prompt: str,
) -> None:
    await _send_graph_request(
        f"{settings.socialwise_instagram_graph_api_base}/{ig_user_id}/messages",
        access_token=access_token,
        json_body={"recipient": {"id": recipient_id}, "message": {"text": email_prompt}},
    )


async def _send_template_link(
    *,
    ig_user_id: str,
    access_token: str,
    recipient_id: str,
    title: str,
    url: str,
    url_button_title: str,
) -> None:
    await _send_graph_request(
        f"{settings.socialwise_instagram_graph_api_base}/{ig_user_id}/messages",
        access_token=access_token,
        json_body={
            "recipient": {"id": recipient_id},
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "generic",
                        "elements": [
                            {
                                "title": title,
                                "buttons": [{"type": "web_url", "url": url, "title": url_button_title}],
                            },
                        ],
                    },
                },
            },
        },
    )


async def _find_or_create_instagram_lead(
    session: AsyncSession,
    *,
    sender_id: str,
    ig_user_id: str,
) -> tuple[Lead, Account]:
    account = await _get_instagram_account(session, ig_user_id)
    if account is None:
        raise ValueError(f"Conta não encontrada para igUserId={ig_user_id}")

    stmt = (
        select(Lead)
        .where(
            Lead.source == LeadSource.INSTAGRAM.value,
            Lead.source_identifier == sender_id,
            Lead.account_id == account.id,
        )
        .limit(1)
    )
    lead = (await session.execute(stmt)).scalar_one_or_none()
    if lead is not None:
        return lead, account

    lead = Lead(
        source=LeadSource.INSTAGRAM.value,
        source_identifier=sender_id,
        account_id=account.id,
    )
    session.add(lead)
    await session.flush()
    return lead, account


async def _get_or_create_lead_automacao(
    session: AsyncSession,
    *,
    lead_id: str,
    automacao_id: str,
) -> LeadAutomacao:
    stmt = (
        select(LeadAutomacao)
        .where(LeadAutomacao.lead_id == lead_id, LeadAutomacao.automacao_id == automacao_id)
        .limit(1)
    )
    lead_automacao = (await session.execute(stmt)).scalar_one_or_none()
    if lead_automacao is not None:
        return lead_automacao

    lead_automacao = LeadAutomacao(
        lead_id=lead_id,
        automacao_id=automacao_id,
        link_sent=False,
        waiting_for_email=False,
    )
    session.add(lead_automacao)
    await session.flush()
    return lead_automacao


async def _mark_lead_as_follower(session: AsyncSession, lead_id: str) -> None:
    profile = await session.execute(
        select(LeadInstagramProfile).where(LeadInstagramProfile.lead_id == lead_id).limit(1)
    )
    existing = profile.scalar_one_or_none()
    if existing is not None:
        existing.is_follower = True
        return

    session.add(LeadInstagramProfile(lead_id=lead_id, is_follower=True, is_online=False))
    await session.flush()


async def _send_link_for_automacao(
    session: AsyncSession,
    *,
    lead: Lead,
    automacao: Automacao,
    access_token: str,
    ig_user_id: str,
) -> bool:
    stmt = (
        select(LeadAutomacao)
        .where(LeadAutomacao.lead_id == lead.id, LeadAutomacao.automacao_id == automacao.id)
        .limit(1)
    )
    lead_automacao = (await session.execute(stmt)).scalar_one_or_none()
    if lead_automacao is None:
        return False
    if lead_automacao.link_sent:
        return False

    lead_automacao.link_sent = True
    await _send_template_link(
        ig_user_id=ig_user_id,
        access_token=access_token,
        recipient_id=lead.source_identifier,
        title="Aqui está o que você pediu! 🎉",
        url=f"{settings.socialwise_automation_base_url}/automacao/{automacao.id}?lead={lead.id}",
        url_button_title="Acessar Agora",
    )
    return True


async def _handle_comment_change(
    session: AsyncSession,
    change_value: dict[str, Any],
    ig_user_id: str,
) -> dict[str, int]:
    comment_id = change_value.get("id")
    comment_text = str(change_value.get("text") or "")
    media = change_value.get("media") or {}
    sender = change_value.get("from") or {}
    effective_media_id = media.get("original_media_id") or media.get("id")

    if sender.get("id") == ig_user_id:
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    access_token = await _get_instagram_user_token(session, ig_user_id)
    if not access_token:
        logger.warning("instagram_webhook_missing_token", ig_user_id=ig_user_id)
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    stmt = (
        select(Automacao)
        .join(Account, Automacao.account_id == Account.id)
        .where(Account.provider == "instagram", Account.ig_user_id == ig_user_id, Automacao.live.is_(True))
    )
    automacoes = list((await session.execute(stmt)).scalars().all())
    if not automacoes:
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    def matches(automacao: Automacao) -> bool:
        if not automacao.any_media_selected and effective_media_id != automacao.selected_media_id:
            return False
        if not automacao.anyword:
            keyword = (automacao.palavras_chave or "").lower()
            if keyword not in comment_text.lower():
                return False
        return True

    automacao = next((item for item in automacoes if matches(item)), None)
    if automacao is None:
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    if automacao.public_reply and comment_id:
        await _reply_public_comment(comment_id, access_token, _pick_random_public_reply(automacao.public_reply))
    if automacao.frase_boas_vindas and automacao.button_payload and comment_id:
        await _send_private_reply_with_button(
            ig_user_id=ig_user_id,
            access_token=access_token,
            comment_id=comment_id,
            text=automacao.frase_boas_vindas,
            button_title=automacao.button_payload,
            button_payload=automacao.button_payload,
        )

    return {"commentsProcessed": 1, "messagesProcessed": 0}


async def _handle_message_event(
    session: AsyncSession,
    message_event: dict[str, Any],
    ig_user_id: str,
) -> dict[str, int]:
    if message_event.get("message", {}).get("is_echo"):
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    sender_id = message_event.get("sender", {}).get("id")
    if not sender_id or sender_id == ig_user_id:
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    access_token = await _get_instagram_user_token(session, ig_user_id)
    if not access_token:
        logger.warning("instagram_webhook_missing_token", ig_user_id=ig_user_id)
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    postback_payload = message_event.get("postback", {}).get("payload")
    if postback_payload:
        automacao_stmt = select(Automacao).where(Automacao.button_payload == postback_payload).limit(1)
        automacao = (await session.execute(automacao_stmt)).scalar_one_or_none()
        if automacao is None:
            return {"commentsProcessed": 0, "messagesProcessed": 0}

        lead, _account = await _find_or_create_instagram_lead(session, sender_id=sender_id, ig_user_id=ig_user_id)
        await _get_or_create_lead_automacao(session, lead_id=lead.id, automacao_id=automacao.id)

        if automacao.anyword and postback_payload == automacao.button_payload:
            await _mark_lead_as_follower(session, lead.id)

        if automacao.anyword and not lead.email:
            lead_link = await _get_or_create_lead_automacao(session, lead_id=lead.id, automacao_id=automacao.id)
            lead_link.waiting_for_email = True
            await _send_email_request_message(
                ig_user_id=ig_user_id,
                access_token=access_token,
                recipient_id=sender_id,
                email_prompt="Por favor, informe seu e-mail:",
            )
            return {"commentsProcessed": 0, "messagesProcessed": 1}

        await _send_link_for_automacao(
            session,
            lead=lead,
            automacao=automacao,
            access_token=access_token,
            ig_user_id=ig_user_id,
        )
        return {"commentsProcessed": 0, "messagesProcessed": 1}

    text = message_event.get("message", {}).get("text")
    if not text or not EMAIL_REGEX.match(str(text)):
        return {"commentsProcessed": 0, "messagesProcessed": 0}

    lead, _account = await _find_or_create_instagram_lead(session, sender_id=sender_id, ig_user_id=ig_user_id)
    lead.email = str(text)

    stmt = (
        select(LeadAutomacao)
        .where(LeadAutomacao.lead_id == lead.id, LeadAutomacao.waiting_for_email.is_(True))
        .options(selectinload(LeadAutomacao.automacao))
    )
    lead_automacoes = list((await session.execute(stmt)).scalars().all())
    for lead_automacao in lead_automacoes:
        lead_automacao.waiting_for_email = False

        profile_stmt = (
            select(LeadInstagramProfile)
            .where(LeadInstagramProfile.lead_id == lead.id)
            .limit(1)
        )
        profile = (await session.execute(profile_stmt)).scalar_one_or_none()
        if lead_automacao.automacao.anyword and not (profile and profile.is_follower):
            await _send_follow_request_message(
                ig_user_id=ig_user_id,
                access_token=access_token,
                recipient_id=sender_id,
                follow_prompt="Para continuar, siga nosso perfil:",
                button_payload=lead_automacao.automacao.button_payload,
            )
        else:
            await _send_link_for_automacao(
                session,
                lead=lead,
                automacao=lead_automacao.automacao,
                access_token=access_token,
                ig_user_id=ig_user_id,
            )

    return {"commentsProcessed": 0, "messagesProcessed": 1 if lead_automacoes else 0}


async def handle_instagram_webhook(
    session: AsyncSession,
    payload: dict[str, Any],
) -> dict[str, int]:
    if payload.get("object") != "instagram":
        logger.warning("instagram_webhook_unsupported_object", object=payload.get("object"))
        return {"entriesProcessed": 0, "commentsProcessed": 0, "messagesProcessed": 0}

    entries = payload.get("entry") or []
    comments_processed = 0
    messages_processed = 0

    for event in entries:
        ig_user_id = event.get("id")
        if not ig_user_id:
            continue

        for change in event.get("changes") or []:
            if change.get("field") == "comments":
                result = await _handle_comment_change(session, change.get("value") or {}, ig_user_id)
                comments_processed += result["commentsProcessed"]
                messages_processed += result["messagesProcessed"]

        for message_event in event.get("messaging") or []:
            result = await _handle_message_event(session, message_event, ig_user_id)
            comments_processed += result["commentsProcessed"]
            messages_processed += result["messagesProcessed"]

    return {
        "entriesProcessed": len(entries),
        "commentsProcessed": comments_processed,
        "messagesProcessed": messages_processed,
    }
