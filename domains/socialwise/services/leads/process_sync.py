"""Process Chatwit lead sync — upsert lead + OAB data + files.

Port of: lib/leads-chatwit/process-chatwit-lead-sync.ts
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.base import generate_cuid
from domains.socialwise.db.models.account import Account
from domains.socialwise.db.models.arquivo_lead_oab import ArquivoLeadOab
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.models.user import User
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from domains.socialwise.services.leads.lead_service import (
    FindOrCreateLeadOptions,
    lead_service,
)
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

_PHONE_RE = re.compile(r"[^\d+]")


@dataclass(slots=True)
class ProcessChatwitLeadSyncResult:
    lead_created: bool
    lead_id: str
    arquivos: int


def _normalize_phone(phone: str) -> str:
    return _PHONE_RE.sub("", phone)


async def _resolve_app_user_id(session: AsyncSession, chatwit_account_id: str) -> str:
    """Resolve app User.id from a Chatwit account ID."""
    account_id = f"CHATWIT_{chatwit_account_id}"

    # Direct lookup
    result = await session.execute(
        select(Account.user_id).where(Account.id == account_id).limit(1)
    )
    user_id = result.scalar_one_or_none()
    if user_id:
        return user_id

    # Fallback: find via providerAccountId
    result = await session.execute(
        select(Account.user_id).where(Account.provider_account_id == chatwit_account_id).limit(1)
    )
    user_id = result.scalar_one_or_none()
    if user_id:
        return user_id

    raise ValueError(f"Usuário do app não encontrado para accountId: {chatwit_account_id}")


async def _upsert_usuario_chatwit(
    session: AsyncSession,
    payload: dict[str, Any],
) -> UsuarioChatwit:
    """Create or update UsuarioChatwit from webhook payload."""
    usuario = payload.get("usuario") or payload
    account = usuario.get("account") or {}
    chatwit_account_id = str(account.get("id", ""))
    token = str(usuario.get("CHATWIT_ACCESS_TOKEN", "")).strip() or None

    result = await session.execute(
        select(UsuarioChatwit).where(
            UsuarioChatwit.chatwit_account_id == chatwit_account_id
        ).limit(1)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.name = account.get("name", existing.name)
        existing.account_name = account.get("name", existing.account_name)
        existing.channel = usuario.get("channel", existing.channel)
        existing.chatwit_account_id = chatwit_account_id
        if token:
            existing.chatwit_access_token = token
        return existing

    app_user_id = await _resolve_app_user_id(session, chatwit_account_id)
    new_usuario = UsuarioChatwit(
        id=generate_cuid(),
        app_user_id=app_user_id,
        name=account.get("name", ""),
        account_name=account.get("name", ""),
        channel=usuario.get("channel", "whatsapp"),
        chatwit_account_id=chatwit_account_id,
        chatwit_access_token=token,
    )
    session.add(new_usuario)
    await session.flush()
    return new_usuario


async def _ensure_chatwit_account(
    session: AsyncSession,
    app_user_id: str,
    chatwit_account_id: str,
) -> str:
    """Ensure CHATWIT_<id> account exists, returning account_id."""
    account_id = f"CHATWIT_{chatwit_account_id}"

    result = await session.execute(
        select(Account).where(Account.id == account_id).limit(1)
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.user_id != app_user_id:
            existing.user_id = app_user_id
        return account_id

    new_account = Account(
        id=account_id,
        user_id=app_user_id,
        type="chatwit",
        provider="chatwit",
        provider_account_id=chatwit_account_id,
    )
    session.add(new_account)
    await session.flush()
    return account_id


def _build_lead_oab_create_data(
    lead_id: str,
    usuario_chatwit_id: str,
    lead_url: str | None = None,
) -> dict[str, Any]:
    return {
        "id": generate_cuid(),
        "lead_id": lead_id,
        "lead_url": lead_url,
        "usuario_chatwit_id": usuario_chatwit_id,
        "concluido": False,
        "fez_recurso": False,
        "manuscrito_processado": False,
        "aguardando_manuscrito": False,
        "espelho_processado": False,
        "aguardando_espelho": False,
        "analise_processada": False,
        "aguardando_analise": False,
        "analise_validada": False,
        "consultoria_fase2": False,
        "recurso_validado": False,
        "aguardando_recurso": False,
    }


async def process_chatwit_lead_sync(
    session: AsyncSession,
    payload: dict[str, Any],
) -> ProcessChatwitLeadSyncResult:
    """Process a Chatwit lead sync payload.

    Creates/updates Lead, LeadOabData, and ArquivoLeadOab records.

    Args:
        session: Active async database session.
        payload: Dict with 'usuario' and 'origem_lead' keys.
    """
    usuario_data = payload.get("usuario") or payload
    origem_lead = payload.get("origem_lead") or payload.get("origemLead") or {}

    chatwit_account_id = str((usuario_data.get("account") or {}).get("id", ""))
    lead_source_id = str(origem_lead.get("source_id", ""))
    phone_number = origem_lead.get("phone_number")
    normalized_phone = _normalize_phone(phone_number) if phone_number else None
    lead_url = (origem_lead.get("leadUrl") or origem_lead.get("lead_url") or "").strip() or None

    # 1. Upsert UsuarioChatwit
    usuario_db = await _upsert_usuario_chatwit(session, payload)

    # 2. Ensure Account exists
    chatwit_scoped_account_id = await _ensure_chatwit_account(
        session, usuario_db.app_user_id, chatwit_account_id
    )

    # 3. Find or create Lead
    lead_lookup = await lead_service.find_or_create_lead(
        session,
        FindOrCreateLeadOptions(
            chatwit_account_id=chatwit_account_id,
            chatwit_contact_id=lead_source_id,
            phone_number=phone_number or None,
            name=origem_lead.get("name") or "Lead sem nome",
            avatar_url=origem_lead.get("thumbnail") or None,
        ),
    )

    # 4. Update Lead with fresh data
    lead = lead_lookup.lead
    lead.name = origem_lead.get("name") or "Lead sem nome"
    lead.phone = normalized_phone
    lead.avatar_url = origem_lead.get("thumbnail") or None
    lead.user_id = usuario_db.app_user_id
    lead.account_id = chatwit_scoped_account_id
    lead.updated_at = datetime.now(timezone.utc)

    # 5. Upsert LeadOabData
    result = await session.execute(
        select(LeadOabData).where(LeadOabData.lead_id == lead.id).limit(1)
    )
    existing_oab = result.scalar_one_or_none()

    if existing_oab:
        existing_oab.usuario_chatwit_id = usuario_db.id
        if lead_url:
            existing_oab.lead_url = lead_url
        lead_oab_data = existing_oab
    else:
        data = _build_lead_oab_create_data(lead.id, usuario_db.id, lead_url)
        lead_oab_data = LeadOabData(**data)
        session.add(lead_oab_data)
        await session.flush()

    # 6. Create ArquivoLeadOab records
    raw_arquivos = origem_lead.get("arquivos", [])
    arquivos = [
        a for a in (raw_arquivos if isinstance(raw_arquivos, list) else [])
        if isinstance(a, dict) and a.get("data_url")
    ]

    if arquivos:
        for arq in arquivos:
            chatwit_file_id = arq.get("chatwitFileId")
            # Skip duplicates by chatwitFileId
            if chatwit_file_id:
                dup_check = await session.execute(
                    select(ArquivoLeadOab.id).where(
                        ArquivoLeadOab.chatwit_file_id == int(chatwit_file_id)
                    ).limit(1)
                )
                if dup_check.scalar_one_or_none():
                    continue

            new_arquivo = ArquivoLeadOab(
                id=generate_cuid(),
                lead_oab_data_id=lead_oab_data.id,
                file_type=arq.get("file_type", "file"),
                data_url=arq["data_url"],
                chatwit_file_id=int(chatwit_file_id) if chatwit_file_id else None,
            )
            session.add(new_arquivo)

        await session.flush()

    return ProcessChatwitLeadSyncResult(
        lead_created=lead_lookup.created,
        lead_id=lead_oab_data.id,
        arquivos=len(arquivos),
    )
