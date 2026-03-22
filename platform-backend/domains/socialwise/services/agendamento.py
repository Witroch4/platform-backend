"""Shared scheduling helpers for Socialwise Agendamento tasks."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.agendamento import Agendamento
from domains.socialwise.db.models.midia import Midia


@dataclass(slots=True)
class PreparedAgendamento:
    """Bundle used by the worker after loading the scheduling context."""

    agendamento: Agendamento
    payload: dict[str, Any]


def _correct_minio_url(url: str) -> str:
    return url.replace("objstore.witdev.com.br", "objstoreapi.witdev.com.br")


def _build_media_payload(midias: list[Midia]) -> list[dict[str, Any]]:
    return [
        {
            "url": _correct_minio_url(midia.url),
            "mime_type": midia.mime_type,
            "thumbnail_url": _correct_minio_url(midia.thumbnail_url) if midia.thumbnail_url else None,
        }
        for midia in midias
    ]


async def get_agendamento_with_context(
    session: AsyncSession,
    agendamento_id: str,
) -> Agendamento | None:
    stmt = (
        select(Agendamento)
        .where(Agendamento.id == agendamento_id)
        .options(
            selectinload(Agendamento.midias),
            selectinload(Agendamento.user),
            selectinload(Agendamento.account),
        )
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def select_midia_for_sending(
    session: AsyncSession,
    agendamento: Agendamento,
) -> Midia | None:
    midias = list(agendamento.midias)
    if not midias:
        return None

    if agendamento.tratar_como_postagens_individuais:
        min_contador = min(midia.contador for midia in midias)
        candidatas = [midia for midia in midias if midia.contador == min_contador]
        selected = random.choice(candidatas)
        selected.contador += 1
        await session.flush()
        return selected

    if agendamento.randomizar:
        return random.choice(midias)

    return midias[0]


async def prepare_webhook_data(
    session: AsyncSession,
    agendamento_id: str,
) -> PreparedAgendamento:
    agendamento = await get_agendamento_with_context(session, agendamento_id)
    if agendamento is None:
        raise ValueError(f"Agendamento não encontrado: {agendamento_id}")
    if agendamento.account is None:
        raise ValueError(f"Conta do agendamento não encontrada: {agendamento_id}")
    if agendamento.user is None:
        raise ValueError(f"Usuário do agendamento não encontrado: {agendamento_id}")

    token_expired = False
    if agendamento.account.expires_at is not None:
        token_expired = (agendamento.account.expires_at * 1000) < int(datetime.now(timezone.utc).timestamp() * 1000)

    payload: dict[str, Any] = {
        "id": agendamento.id,
        "userId": agendamento.user_id,
        "userName": agendamento.user.name,
        "userEmail": agendamento.user.email,
        "descricao": agendamento.descricao,
        "data": agendamento.data.isoformat(),
        "instagram": agendamento.instagram,
        "facebook": agendamento.facebook,
        "linkedin": agendamento.linkedin,
        "x": agendamento.x,
        "stories": agendamento.stories,
        "reels": agendamento.reels,
        "postNormal": agendamento.post_normal,
        "diario": agendamento.diario,
        "semanal": agendamento.semanal,
        "randomizar": agendamento.randomizar,
        "tratarComoPostagensIndividuais": agendamento.tratar_como_postagens_individuais,
        "tokenExpired": token_expired,
        "instagramAccountId": agendamento.account.provider_account_id,
        "instagramAccessToken": agendamento.account.access_token,
        "igUserId": agendamento.account.ig_user_id,
        "igUsername": agendamento.account.ig_username,
    }

    if agendamento.tratar_como_postagens_individuais:
        midia = await select_midia_for_sending(session, agendamento)
        if midia is None:
            raise ValueError(f"Nenhuma mídia disponível para o agendamento: {agendamento_id}")

        payload["midiaUrl"] = _correct_minio_url(midia.url)
        payload["midiaMimeType"] = midia.mime_type
        payload["midiaThumbnailUrl"] = _correct_minio_url(midia.thumbnail_url) if midia.thumbnail_url else None
    elif agendamento.midias:
        payload["midias"] = _build_media_payload(list(agendamento.midias))
        payload["midiaUrl"] = payload["midias"][0]["url"]
        payload["midiaMimeType"] = payload["midias"][0]["mime_type"]
        payload["midiaThumbnailUrl"] = payload["midias"][0]["thumbnail_url"]

    return PreparedAgendamento(agendamento=agendamento, payload=payload)
