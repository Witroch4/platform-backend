"""Business logic for the Socialwise Templates admin routes.

Ports the WhatsApp Business API template management (Meta Graph API),
local DB CRUD and media handling from the Next.js route handlers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.interactive_content import WhatsAppOfficialInfo
from domains.socialwise.db.models.mapeamento_intencao import MapeamentoIntencao
from domains.socialwise.db.models.template import Template
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from domains.socialwise.db.models.whatsapp_global_config import WhatsAppGlobalConfig
from platform_core.config import settings

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Error type
# ---------------------------------------------------------------------------

@dataclass
class TemplateServiceError(Exception):
    message: str
    status_code: int = 500
    payload: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# WhatsApp API config resolution
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class WhatsAppApiConfig:
    fb_graph_api_base: str
    whatsapp_business_account_id: str
    whatsapp_token: str


async def get_whatsapp_api_config(
    session: AsyncSession,
    user_id: str,
) -> WhatsAppApiConfig:
    """Resolve WhatsApp API config from DB (UsuarioChatwit → WhatsAppGlobalConfig) or ENV."""
    try:
        stmt = (
            select(UsuarioChatwit)
            .options(selectinload(UsuarioChatwit.whatsapp_global_config))
            .where(UsuarioChatwit.app_user_id == user_id)
        )
        result = await session.execute(stmt)
        usuario = result.scalar_one_or_none()

        if usuario and usuario.whatsapp_global_config:
            cfg = usuario.whatsapp_global_config
            return WhatsAppApiConfig(
                fb_graph_api_base=cfg.graph_api_base_url,
                whatsapp_business_account_id=cfg.whatsapp_business_account_id,
                whatsapp_token=cfg.whatsapp_api_key,
            )
    except Exception:
        logger.warning("whatsapp_config_db_lookup_failed", user_id=user_id, exc_info=True)

    return WhatsAppApiConfig(
        fb_graph_api_base=settings.fb_graph_api_base or "https://graph.facebook.com/v22.0",
        whatsapp_business_account_id=settings.whatsapp_business_id,
        whatsapp_token=settings.whatsapp_token,
    )


def _require_credentials(config: WhatsAppApiConfig) -> None:
    if not config.whatsapp_business_account_id or not config.whatsapp_token:
        raise TemplateServiceError(
            "Credenciais da API do WhatsApp não configuradas.",
            status_code=400,
        )


# ---------------------------------------------------------------------------
# Mock templates (fallback when Meta API is unavailable)
# ---------------------------------------------------------------------------

MOCK_TEMPLATES: list[dict[str, Any]] = [
    {"id": "mock_consulta", "name": "consulta", "status": "APPROVED", "category": "MARKETING", "language": "pt_BR", "components": []},
    {"id": "mock_analise_paga", "name": "analise_paga", "status": "APPROVED", "category": "MARKETING", "language": "pt_BR", "components": []},
    {"id": "mock_satisfacao_oab", "name": "satisfacao_oab", "status": "APPROVED", "category": "MARKETING", "language": "pt_BR", "components": []},
    {"id": "mock_menu_novo", "name": "menu_novo", "status": "APPROVED", "category": "MARKETING", "language": "pt_BR", "components": []},
    {"id": "mock_hello_world", "name": "hello_world", "status": "APPROVED", "category": "UTILITY", "language": "en_US", "components": []},
]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

async def _sync_template_with_db(
    session: AsyncSession,
    template_data: dict[str, Any],
    user_id: str,
) -> None:
    """Create or update a Template + WhatsAppOfficialInfo row from Meta API data."""
    stmt = select(Template).where(
        Template.name == template_data["name"],
        Template.created_by_id == user_id,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    meta_id = str(template_data["id"])
    status_val = template_data.get("status", "APPROVED")
    category = template_data.get("category", "UTILITY")
    components = template_data.get("components") or {}

    if existing:
        existing.status = status_val
        existing.language = template_data.get("language", "pt_BR")
        existing.tags = [category]

        if existing.whatsapp_official_info:
            existing.whatsapp_official_info.meta_template_id = meta_id
            existing.whatsapp_official_info.status = status_val
            existing.whatsapp_official_info.category = category
            existing.whatsapp_official_info.components = components
        else:
            info = WhatsAppOfficialInfo(
                template_id=existing.id,
                meta_template_id=meta_id,
                status=status_val,
                category=category,
                components=components,
            )
            session.add(info)
    else:
        tpl = Template(
            name=template_data["name"],
            type="WHATSAPP_OFFICIAL",
            scope="PRIVATE",
            status=status_val,
            language=template_data.get("language", "pt_BR"),
            tags=[category],
            created_by_id=user_id,
        )
        session.add(tpl)
        await session.flush()

        info = WhatsAppOfficialInfo(
            template_id=tpl.id,
            meta_template_id=meta_id,
            status=status_val,
            category=category,
            components=components,
        )
        session.add(info)

    await session.flush()


# ---------------------------------------------------------------------------
# Meta API helpers
# ---------------------------------------------------------------------------

async def _fetch_templates_from_meta(
    config: WhatsAppApiConfig,
) -> tuple[list[dict[str, Any]], bool]:
    """Fetch templates from Meta Graph API with pagination (max 5 pages)."""
    _require_credentials(config)

    url = (
        f"{config.fb_graph_api_base}/{config.whatsapp_business_account_id}/message_templates"
        "?fields=name,status,category,language,components,sub_category,quality_score,"
        "correct_category,cta_url_link_tracking_opted_out,library_template_name,"
        "message_send_ttl_seconds,parameter_format,previous_category&limit=1000"
    )
    headers = {
        "Authorization": f"Bearer {config.whatsapp_token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

            if not data.get("data"):
                if data.get("error"):
                    raise TemplateServiceError(
                        f"Erro na API do WhatsApp: {data['error'].get('message', '')}",
                        status_code=502,
                    )
                return MOCK_TEMPLATES, False

            templates = data["data"]
            next_page = data.get("paging", {}).get("next")
            page_count = 1

            while next_page and page_count < 5:
                page_resp = await client.get(next_page, headers=headers)
                page_data = page_resp.json()
                if page_data.get("data"):
                    templates.extend(page_data["data"])
                    next_page = page_data.get("paging", {}).get("next")
                    page_count += 1
                else:
                    break

        processed = [
            {
                "id": t["id"],
                "name": t["name"],
                "status": t.get("status", "APPROVED"),
                "category": t.get("category", "UTILITY"),
                "language": t.get("language", "pt_BR"),
                "components": t.get("components") or {},
                "sub_category": t.get("sub_category"),
                "quality_score": t.get("quality_score"),
                "correct_category": t.get("correct_category"),
                "cta_url_link_tracking_opted_out": t.get("cta_url_link_tracking_opted_out"),
                "library_template_name": t.get("library_template_name"),
                "message_send_ttl_seconds": t.get("message_send_ttl_seconds"),
                "parameter_format": t.get("parameter_format"),
                "previous_category": t.get("previous_category"),
            }
            for t in templates
        ]

        if not processed:
            return MOCK_TEMPLATES, False

        return processed, True

    except httpx.HTTPStatusError as exc:
        logger.warning("meta_api_error", status=exc.response.status_code, exc_info=True)
        return MOCK_TEMPLATES, False
    except TemplateServiceError:
        raise
    except Exception:
        logger.warning("meta_api_unexpected_error", exc_info=True)
        return MOCK_TEMPLATES, False


async def _create_template_on_meta(
    config: WhatsAppApiConfig,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """POST a new template to Meta Graph API."""
    _require_credentials(config)

    url = f"{config.fb_graph_api_base}/{config.whatsapp_business_account_id}/message_templates"
    headers = {
        "Authorization": f"Bearer {config.whatsapp_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code >= 400:
            data = resp.json()
            if data.get("error"):
                meta_err = data["error"]
                raise TemplateServiceError(
                    f"Erro API Meta: [{meta_err.get('code', '')}] {meta_err.get('message', '')}",
                    status_code=resp.status_code,
                )
            resp.raise_for_status()

        data = resp.json()
        if not data.get("id"):
            raise TemplateServiceError("Resposta da API não contém ID do template", status_code=502)

        return {"id": data["id"], "status": data.get("status", "PENDING")}


async def _delete_template_on_meta(
    config: WhatsAppApiConfig,
    *,
    name: str | None = None,
    hsm_id: str | None = None,
) -> dict[str, Any]:
    """DELETE a template from Meta Graph API."""
    _require_credentials(config)

    url = f"{config.fb_graph_api_base}/{config.whatsapp_business_account_id}/message_templates"
    if hsm_id:
        url += f"?hsm_id={hsm_id}"

    headers = {
        "Authorization": f"Bearer {config.whatsapp_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Meta expects DELETE with optional JSON body for name
        req = client.build_request("DELETE", url, json={"name": name} if name else None, headers=headers)
        resp = await client.send(req)

        if resp.status_code >= 400:
            data = resp.json()
            if data.get("error"):
                meta_err = data["error"]
                raise TemplateServiceError(
                    f"Erro API Meta: [{meta_err.get('code', '')}] {meta_err.get('message', '')}",
                    status_code=resp.status_code,
                )
            resp.raise_for_status()

        return resp.json() if resp.text else {"success": True}


async def _edit_template_on_meta(
    config: WhatsAppApiConfig,
    meta_template_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """POST to /{meta_template_id} to edit an existing template."""
    _require_credentials(config)

    url = f"{config.fb_graph_api_base}/{meta_template_id}"
    headers = {
        "Authorization": f"Bearer {config.whatsapp_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code >= 400:
            data = resp.json()
            if data.get("error"):
                meta_err = data["error"]
                raise TemplateServiceError(
                    f"Erro API Meta: [{meta_err.get('code', '')}] {meta_err.get('message', '')}",
                    status_code=resp.status_code,
                )
            resp.raise_for_status()

        return resp.json()


async def _get_template_status_from_meta(
    config: WhatsAppApiConfig,
    meta_template_id: str,
) -> dict[str, Any]:
    """GET template status/details from Meta Graph API."""
    _require_credentials(config)

    url = (
        f"{config.fb_graph_api_base}/{meta_template_id}"
        "?fields=id,name,status,category,language,quality_score,rejected_reason,components"
    )
    headers = {
        "Authorization": f"Bearer {config.whatsapp_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)

        if resp.status_code == 404:
            raise TemplateServiceError("Template não encontrado na Meta.", status_code=404)

        if resp.status_code >= 400:
            data = resp.json()
            if data.get("error"):
                meta_err = data["error"]
                raise TemplateServiceError(
                    f"Erro da Meta API: {meta_err.get('message', '')}",
                    status_code=resp.status_code,
                    payload={"code": meta_err.get("code")},
                )
            resp.raise_for_status()

        return resp.json()


# ---------------------------------------------------------------------------
# Button sort helper (Meta requires grouped by type)
# ---------------------------------------------------------------------------

_BUTTON_ORDER: dict[str, int] = {
    "COPY_CODE": 0,
    "VOICE_CALL": 1,
    "PHONE_NUMBER": 2,
    "URL": 3,
    "QUICK_REPLY": 4,
}


def _sort_button_components(components: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Auto-sort buttons inside BUTTONS component by Meta-required order."""
    result = []
    for comp in components:
        if comp.get("type") == "BUTTONS" and isinstance(comp.get("buttons"), list):
            sorted_buttons = sorted(
                comp["buttons"],
                key=lambda b: _BUTTON_ORDER.get(b.get("type", ""), 99),
            )
            result.append({**comp, "buttons": sorted_buttons})
        else:
            result.append(comp)
    return result


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def list_templates(
    session: AsyncSession,
    user_id: str,
    *,
    category: str | None = None,
    language: str | None = None,
    refresh: bool = False,
    mock: bool = False,
) -> dict[str, Any]:
    """GET /templates — list templates from DB or refresh from Meta."""
    if mock:
        return {"success": True, "templates": MOCK_TEMPLATES, "isRealData": False}

    # Verify UsuarioChatwit exists
    stmt = select(UsuarioChatwit).where(UsuarioChatwit.app_user_id == user_id)
    result = await session.execute(stmt)
    usuario = result.scalar_one_or_none()
    if not usuario:
        raise TemplateServiceError(
            "Usuário Chatwit não encontrado. Configure seu token primeiro.",
            status_code=404,
        )

    if refresh:
        config = await get_whatsapp_api_config(session, user_id)
        templates, real = await _fetch_templates_from_meta(config)

        # Sync to DB
        if real:
            for t in templates:
                await _sync_template_with_db(session, t, user_id)
            await session.commit()

        # Filter
        filtered = _filter_templates(templates, category, language)
        formatted = [
            {
                "id": t["id"],
                "name": t["name"],
                "status": t.get("status"),
                "category": t.get("category"),
                "language": t.get("language"),
                "components": t.get("components") or [],
            }
            for t in filtered
        ]

        return {"success": True, "templates": formatted, "isRealData": real, "fromApi": True}

    # Load from DB
    filters: list[Any] = [Template.created_by_id == user_id]
    if category and category != "all":
        filters.append(Template.tags.contains([category]))
    if language and language != "all":
        filters.append(Template.language == language)

    stmt = (
        select(Template)
        .options(selectinload(Template.whatsapp_official_info))
        .where(*filters)
        .order_by(Template.name)
    )
    result = await session.execute(stmt)
    db_templates = list(result.scalars().all())

    # If DB is empty and no filters, try initial load from Meta
    if not db_templates and not category and not language:
        count_stmt = select(func.count()).select_from(Template).where(
            Template.created_by_id == user_id,
        )
        total = (await session.execute(count_stmt)).scalar() or 0

        if total == 0:
            config = await get_whatsapp_api_config(session, user_id)
            templates, real = await _fetch_templates_from_meta(config)
            if real:
                for t in templates:
                    await _sync_template_with_db(session, t, user_id)
                await session.commit()

            formatted = [
                {
                    "id": t["id"],
                    "name": t["name"],
                    "status": t.get("status"),
                    "category": t.get("category"),
                    "language": t.get("language"),
                    "components": t.get("components") or [],
                }
                for t in templates
            ]
            return {
                "success": True,
                "templates": formatted,
                "isRealData": real,
                "fromApi": True,
                "firstLoad": True,
            }

    formatted = [
        {
            "id": (t.whatsapp_official_info.meta_template_id if t.whatsapp_official_info else t.id),
            "name": t.name,
            "status": t.status,
            "category": t.tags[0] if t.tags else "UTILITY",
            "language": t.language,
            "components": (t.whatsapp_official_info.components if t.whatsapp_official_info else []),
        }
        for t in db_templates
    ]

    return {"success": True, "templates": formatted, "isRealData": True, "fromDatabase": True}


async def create_template(
    session: AsyncSession,
    user_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    """POST /templates — create a new template on Meta and save to DB."""
    config = await get_whatsapp_api_config(session, user_id)
    _require_credentials(config)

    name = body.get("name")
    category_val = body.get("category")
    language = body.get("language")
    components = body.get("components")

    if not name or not category_val or not language or not components:
        raise TemplateServiceError(
            "Dados incompletos. Necessário: name, category, language, components.",
            status_code=400,
        )

    # Validate HEADER variable count
    for comp in components:
        if comp.get("type") == "HEADER" and comp.get("text"):
            header_vars = re.findall(r"\{\{[^}]+\}\}", comp["text"])
            if len(header_vars) > 1:
                raise TemplateServiceError(
                    "O cabeçalho de texto suporta no máximo 1 variável.",
                    status_code=400,
                )

    # Validate PHONE_NUMBER / VOICE_CALL mutual exclusion
    buttons_comp = next((c for c in components if c.get("type") == "BUTTONS"), None)
    if buttons_comp and isinstance(buttons_comp.get("buttons"), list):
        has_phone = any(b.get("type") == "PHONE_NUMBER" for b in buttons_comp["buttons"])
        has_voice = any(b.get("type") == "VOICE_CALL" for b in buttons_comp["buttons"])
        if has_phone and has_voice:
            raise TemplateServiceError(
                "Não é permitido ter botões PHONE_NUMBER e VOICE_CALL no mesmo template.",
                status_code=400,
            )

    # Extract _minioUrl from media headers (frontend uploads media separately)
    public_media_url = None
    for comp in components:
        if comp.get("type") == "HEADER" and comp.get("format") in ("IMAGE", "VIDEO"):
            example = comp.get("example") or {}
            if example.get("_minioUrl"):
                public_media_url = example.pop("_minioUrl")
            elif example.get("header_url"):
                public_media_url = example.pop("header_url")

    # Sort buttons
    sorted_components = _sort_button_components(components)

    payload = {
        "name": name,
        "category": category_val,
        "language": language,
        "components": sorted_components,
        "parameter_format": "NAMED",
    }

    # Create on Meta
    meta_result = await _create_template_on_meta(config, payload)

    # Save to DB
    try:
        tpl = Template(
            name=name,
            type="WHATSAPP_OFFICIAL",
            scope="PRIVATE",
            status=meta_result.get("status", "PENDING"),
            language=language,
            tags=[category_val],
            created_by_id=user_id,
        )
        session.add(tpl)
        await session.flush()

        info_components = components  # store original components
        if public_media_url:
            info_components = {**(info_components if isinstance(info_components, dict) else {}), "publicMediaUrl": public_media_url}
            if isinstance(components, list):
                info_components = {"items": components, "publicMediaUrl": public_media_url}

        info = WhatsAppOfficialInfo(
            template_id=tpl.id,
            meta_template_id=meta_result["id"],
            status=meta_result.get("status", "PENDING"),
            category=category_val,
            components=info_components if isinstance(info_components, dict) else {"items": info_components},
        )
        session.add(info)
        await session.commit()
    except Exception:
        logger.warning("template_db_save_failed", name=name, exc_info=True)

    return {
        "success": True,
        "result": meta_result,
        "template": {"id": meta_result["id"], "name": name, "status": "PENDING"},
    }


async def delete_template_meta(
    session: AsyncSession,
    user_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    """DELETE /templates — delete template from Meta."""
    config = await get_whatsapp_api_config(session, user_id)
    name = body.get("name")
    hsm_id = body.get("hsm_id")

    if not name and not hsm_id:
        raise TemplateServiceError(
            'É necessário informar o "name" ou "hsm_id" do template para deletar.',
            status_code=400,
        )

    result = await _delete_template_on_meta(config, name=name, hsm_id=hsm_id)
    return {"success": True, "result": result or "Template deletado com sucesso"}


async def list_inbox_templates(
    session: AsyncSession,
    inbox_id: str,
) -> list[dict[str, str]]:
    """GET /templates/{inbox_id} — list templates for a specific inbox."""
    stmt = (
        select(Template.id, Template.name)
        .where(Template.inbox_id == inbox_id)
        .order_by(Template.name)
    )
    result = await session.execute(stmt)
    return [{"id": row.id, "name": row.name} for row in result.all()]


async def upsert_inbox_template(
    session: AsyncSession,
    user_id: str,
    inbox_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    """POST /templates/{inbox_id} — create or update a template for an inbox."""
    name = body.get("name")
    text = body.get("text")
    raw_type = body.get("type", "AUTOMATION_REPLY")
    language = body.get("language", "pt_BR")
    template_id = body.get("id")

    if not name or not text:
        raise TemplateServiceError("Nome e texto são obrigatórios", status_code=400)

    # Map frontend type names
    type_map = {
        "template": "WHATSAPP_OFFICIAL",
        "interactive_message": "INTERACTIVE_MESSAGE",
    }
    tpl_type = type_map.get(raw_type, raw_type)

    if template_id:
        stmt = select(Template).where(Template.id == template_id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.name = name
            existing.type = tpl_type
            existing.simple_reply_text = text
            existing.language = language
            await session.commit()
            await session.refresh(existing)
            return _template_to_dict(existing)

    # Create new
    tpl = Template(
        name=name,
        type=tpl_type,
        simple_reply_text=text,
        language=language,
        inbox_id=inbox_id,
        created_by_id=user_id,
        status="APPROVED",
    )
    session.add(tpl)
    await session.commit()
    await session.refresh(tpl)
    return _template_to_dict(tpl)


async def delete_inbox_template(
    session: AsyncSession,
    template_id: str,
) -> dict[str, str]:
    """DELETE /templates/{inbox_id}/{template_id}."""
    # Check if template is used in a mapping
    stmt = select(MapeamentoIntencao).where(MapeamentoIntencao.template_id == template_id)
    result = await session.execute(stmt)
    mapping = result.scalar_one_or_none()

    if mapping:
        raise TemplateServiceError(
            "Este template está em uso por um mapeamento e não pode ser excluído.",
            status_code=409,
        )

    stmt = select(Template).where(Template.id == template_id)
    result = await session.execute(stmt)
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise TemplateServiceError("Template não encontrado", status_code=404)

    await session.delete(tpl)
    await session.commit()
    return {"message": "Template excluído com sucesso"}


async def get_template_details(
    session: AsyncSession,
    template_id: str,
) -> dict[str, Any]:
    """GET /templates/details/{id}."""
    stmt = select(Template).where(Template.id == template_id)
    result = await session.execute(stmt)
    tpl = result.scalar_one_or_none()

    if not tpl:
        raise TemplateServiceError("Template não encontrado", status_code=404)

    return {
        "id": tpl.id,
        "name": tpl.name,
        "language": tpl.language,
        "status": tpl.status,
        "tags": list(tpl.tags) if tpl.tags else [],
        "text": tpl.simple_reply_text,
    }


async def check_template_status(
    session: AsyncSession,
    user_id: str,
    meta_template_id: str,
) -> dict[str, Any]:
    """GET /templates/{inbox_id}/{template_id}/status — sync status from Meta."""
    config = await get_whatsapp_api_config(session, user_id)

    if not config.whatsapp_token:
        raise TemplateServiceError("Credenciais do WhatsApp não configuradas.", status_code=400)

    # Find template in DB
    stmt = (
        select(Template)
        .options(selectinload(Template.whatsapp_official_info))
        .where(
            Template.created_by_id == user_id,
        )
        .join(WhatsAppOfficialInfo, Template.id == WhatsAppOfficialInfo.template_id)
        .where(WhatsAppOfficialInfo.meta_template_id == meta_template_id)
    )
    result = await session.execute(stmt)
    db_template = result.scalar_one_or_none()

    previous_status = (
        db_template.whatsapp_official_info.status
        if db_template and db_template.whatsapp_official_info
        else "UNKNOWN"
    )

    # Query Meta
    meta_data = await _get_template_status_from_meta(config, meta_template_id)

    new_status = meta_data.get("status", "UNKNOWN")
    status_changed = previous_status != new_status

    # Update DB if changed
    if status_changed and db_template and db_template.whatsapp_official_info:
        db_template.whatsapp_official_info.status = new_status
        qs = meta_data.get("quality_score")
        if isinstance(qs, dict):
            db_template.whatsapp_official_info.quality_score = qs.get("score")
        elif qs:
            db_template.whatsapp_official_info.quality_score = str(qs)
        if meta_data.get("components"):
            db_template.whatsapp_official_info.components = meta_data["components"]
        db_template.status = new_status
        await session.commit()

    quality_score = meta_data.get("quality_score")
    if isinstance(quality_score, dict):
        quality_score = quality_score.get("score")

    return {
        "success": True,
        "templateId": meta_data.get("id"),
        "name": meta_data.get("name"),
        "status": new_status,
        "category": meta_data.get("category"),
        "language": meta_data.get("language"),
        "qualityScore": quality_score,
        "rejectionReason": meta_data.get("rejected_reason"),
        "previousStatus": previous_status,
        "statusChanged": status_changed,
    }


async def edit_template(
    session: AsyncSession,
    user_id: str,
    meta_template_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    """PUT /templates/edit/{meta_template_id} — edit on Meta and update DB."""
    config = await get_whatsapp_api_config(session, user_id)
    _require_credentials(config)

    components = body.get("components")
    if not components or not isinstance(components, list):
        raise TemplateServiceError("Componentes do template são obrigatórios.", status_code=400)

    edit_payload: dict[str, Any] = {"components": components}
    if body.get("category"):
        edit_payload["category"] = body["category"]

    result = await _edit_template_on_meta(config, meta_template_id, edit_payload)

    # Update local DB
    try:
        stmt = select(WhatsAppOfficialInfo).where(
            WhatsAppOfficialInfo.meta_template_id == meta_template_id,
        )
        db_result = await session.execute(stmt)
        info = db_result.scalar_one_or_none()
        if info:
            info.status = "PENDING"
            info.components = components
            await session.commit()
    except Exception:
        logger.warning("template_edit_db_update_failed", meta_id=meta_template_id, exc_info=True)

    return {
        "success": True,
        "result": result,
        "message": "Template atualizado e reenviado para validação",
    }


async def ensure_media(
    session: AsyncSession,
    user_id: str,
    meta_template_id: str,
) -> dict[str, Any]:
    """POST /templates/ensure-media — ensure template has public media URL.

    Note: The actual Meta media download + MinIO upload pipeline stays in
    the Next.js side for now (it depends on the MinIO uploadToMinIO() helper
    and WhatsApp Bearer token download). This endpoint checks DB state and
    returns existing publicMediaUrl if available.
    """
    stmt = (
        select(Template)
        .options(selectinload(Template.whatsapp_official_info))
        .where(Template.created_by_id == user_id)
        .join(WhatsAppOfficialInfo, Template.id == WhatsAppOfficialInfo.template_id)
        .where(WhatsAppOfficialInfo.meta_template_id == meta_template_id)
    )
    result = await session.execute(stmt)
    tpl = result.scalar_one_or_none()

    if not tpl or not tpl.whatsapp_official_info:
        raise TemplateServiceError(
            "Template oficial não encontrado para este usuário.",
            status_code=404,
        )

    components = tpl.whatsapp_official_info.components or {}
    existing_url = components.get("publicMediaUrl") if isinstance(components, dict) else None

    if existing_url and not _is_meta_media_url(existing_url):
        return {"success": True, "publicMediaUrl": existing_url}

    # No MinIO pipeline available in Python backend yet — return 422
    raise TemplateServiceError(
        "Não foi possível obter URL pública para o HEADER. Use a rota Next.js ensure-media.",
        status_code=422,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _filter_templates(
    templates: list[dict[str, Any]],
    category: str | None,
    language: str | None,
) -> list[dict[str, Any]]:
    result = templates
    if category and category != "all":
        result = [t for t in result if (t.get("category") or "").upper() == category.upper()]
    if language and language != "all":
        result = [t for t in result if (t.get("language") or "").lower() == language.lower()]
    return result


def _is_meta_media_url(url: str | None) -> bool:
    if not url or not isinstance(url, str):
        return False
    return "whatsapp.net" in url or "fbcdn.net" in url or "facebook.com" in url


def _template_to_dict(tpl: Template) -> dict[str, Any]:
    return {
        "id": tpl.id,
        "name": tpl.name,
        "description": tpl.description,
        "type": tpl.type,
        "scope": tpl.scope,
        "status": tpl.status,
        "language": tpl.language,
        "tags": list(tpl.tags) if tpl.tags else [],
        "isActive": tpl.is_active,
        "usageCount": tpl.usage_count,
        "simpleReplyText": tpl.simple_reply_text,
        "createdById": tpl.created_by_id,
        "inboxId": tpl.inbox_id,
        "createdAt": tpl.created_at.isoformat() if tpl.created_at else None,
        "updatedAt": tpl.updated_at.isoformat() if tpl.updated_at else None,
    }
