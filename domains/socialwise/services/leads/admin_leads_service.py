"""Business logic for the Leads admin group (B.7.5a — Core).

Port of:
- app/api/admin/leads-chatwit/leads/route.ts (GET list, POST update, DELETE)
- app/api/admin/leads-chatwit/lead-status/route.ts (GET)
- app/api/admin/leads-chatwit/stats/route.ts (GET)
- app/api/admin/leads-chatwit/usuarios/route.ts (GET, DELETE)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.arquivo_lead_oab import ArquivoLeadOab
from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.models.lead_payment import LeadPayment
from domains.socialwise.db.models.user import User
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYSTEM_BOT_NAMES = [
    "socialwise bot",
    "socialwisebot",
    "chatwit bot",
    "chatwitbot",
    "bot socialwise",
    "bot chatwit",
]


class LeadsServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# Role helpers
# ---------------------------------------------------------------------------

async def _get_user_role(session: AsyncSession, user_id: str) -> str:
    row = await session.execute(select(User.role).where(User.id == user_id))
    role = row.scalar_one_or_none()
    return role or "USER"


async def _get_usuario_chatwit_token(session: AsyncSession, user_id: str) -> str | None:
    row = await session.execute(
        select(UsuarioChatwit.chatwit_access_token)
        .where(UsuarioChatwit.app_user_id == user_id)
    )
    return row.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Lead listing
# ---------------------------------------------------------------------------

async def list_leads(
    session: AsyncSession,
    user_id: str,
    *,
    lead_id: str | None = None,
    usuario_id: str | None = None,
    search: str | None = None,
    visibility: str = "all",
    marketing_mode: bool = False,
    fez_recurso: bool = False,
    sem_recurso: bool = False,
    concluido: bool = False,
    updated_after: str | None = None,
    updated_before: str | None = None,
    only_with_phone: bool = False,
    page: int = 1,
    limit: int = 10,
) -> dict[str, Any]:
    role = await _get_user_role(session, user_id)
    token = await _get_usuario_chatwit_token(session, user_id)

    # Single lead lookup
    if lead_id:
        stmt = (
            select(LeadOabData)
            .join(Lead, Lead.id == LeadOabData.lead_id)
            .where(LeadOabData.id == lead_id)
        )
        result = await session.execute(stmt)
        lead_oab = result.scalar_one_or_none()
        if not lead_oab or not lead_oab.lead or not lead_oab.lead.name:
            return None  # type: ignore[return-value]
        return await _serialize_lead(session, lead_oab, marketing_mode)

    # Non-SUPERADMIN without token: return empty
    if role != "SUPERADMIN" and not token:
        return {"leads": [], "pagination": {"total": 0, "page": page, "limit": limit, "totalPages": 0}}

    skip = (page - 1) * limit

    # Build WHERE conditions
    conditions: list = []

    # Bot exclusion
    bot_conditions = [
        func.lower(Lead.name).contains(n) for n in SYSTEM_BOT_NAMES
    ]
    conditions.append(~or_(*bot_conditions))

    # Role-based ownership
    if role != "SUPERADMIN":
        conditions.append(UsuarioChatwit.app_user_id == user_id)

    # Phone filter
    if marketing_mode or only_with_phone:
        conditions.append(Lead.phone.isnot(None))
        conditions.append(Lead.phone != "")

    if fez_recurso:
        conditions.append(LeadOabData.fez_recurso.is_(True))
    if sem_recurso:
        conditions.append(LeadOabData.fez_recurso.is_(False))
    if concluido:
        conditions.append(LeadOabData.concluido.is_(True))

    if updated_after:
        try:
            dt = datetime.fromisoformat(updated_after)
            conditions.append(Lead.updated_at >= dt)
        except ValueError:
            pass

    if updated_before:
        try:
            dt = datetime.fromisoformat(updated_before)
            conditions.append(Lead.updated_at <= dt)
        except ValueError:
            pass

    if usuario_id:
        conditions.append(LeadOabData.usuario_chatwit_id == usuario_id)

    if search:
        clean = "".join(c for c in search if c.isalnum() or c in "@.-")
        search_conds = [
            func.lower(Lead.name).contains(search.lower()),
            func.lower(cast(LeadOabData.nome_real, String)).contains(search.lower()),
            func.lower(Lead.phone).contains(search.lower()),
            func.lower(Lead.email).contains(search.lower()),
            func.lower(LeadOabData.id).contains(search.lower()),
            func.lower(LeadOabData.lead_id).contains(search.lower()),
        ]
        if clean != search:
            search_conds.append(func.lower(Lead.phone).contains(clean.lower()))
        conditions.append(or_(*search_conds))

    if visibility == "visible":
        # has arquivos or alwaysShowInLeadList
        has_arq = select(ArquivoLeadOab.id).where(
            ArquivoLeadOab.lead_oab_data_id == LeadOabData.id
        ).exists()
        conditions.append(or_(LeadOabData.always_show_in_lead_list.is_(True), has_arq))
    elif visibility == "hidden":
        no_arq = ~select(ArquivoLeadOab.id).where(
            ArquivoLeadOab.lead_oab_data_id == LeadOabData.id
        ).exists()
        conditions.append(LeadOabData.always_show_in_lead_list.is_(False))
        conditions.append(no_arq)

    # Base stmt with joins
    stmt = (
        select(LeadOabData)
        .join(Lead, Lead.id == LeadOabData.lead_id)
        .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
        .where(*conditions)
        .order_by(Lead.updated_at.desc())
    )

    count_stmt = (
        select(func.count())
        .select_from(LeadOabData)
        .join(Lead, Lead.id == LeadOabData.lead_id)
        .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
        .where(*conditions)
    )

    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    paginated = await session.execute(stmt.offset(skip).limit(limit))
    leads_oab = list(paginated.scalars())

    # Load arquivos in batch
    lead_ids = [l.id for l in leads_oab]
    arquivos_map: dict[str, list] = {}
    if lead_ids:
        arq_result = await session.execute(
            select(ArquivoLeadOab).where(ArquivoLeadOab.lead_oab_data_id.in_(lead_ids))
        )
        for arq in arq_result.scalars():
            arquivos_map.setdefault(arq.lead_oab_data_id, []).append(arq)

    # Load payments in batch
    lead_base_ids = [l.lead_id for l in leads_oab]
    payments_map: dict[str, list] = {}
    if lead_base_ids:
        pay_result = await session.execute(
            select(LeadPayment)
            .where(LeadPayment.lead_id.in_(lead_base_ids))
            .where(LeadPayment.status == "CONFIRMED")
            .order_by(LeadPayment.confirmed_at.desc())
        )
        for p in pay_result.scalars():
            payments_map.setdefault(p.lead_id, []).append(p)

    serialized = []
    for lo in leads_oab:
        if not lo.lead or not lo.lead.name:
            continue
        s = await _serialize_lead(
            session, lo, marketing_mode,
            arquivos=arquivos_map.get(lo.id, []),
            payments=payments_map.get(lo.lead_id, []),
        )
        serialized.append(s)

    return {
        "leads": serialized,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": max(1, -(-total // limit)),
        },
        **({"success": True} if marketing_mode else {}),
    }


async def _serialize_lead(
    session: AsyncSession,
    lo: LeadOabData,
    marketing_mode: bool,
    arquivos: list | None = None,
    payments: list | None = None,
) -> dict[str, Any]:
    ld = lo.lead

    nome_real = lo.nome_real
    if not nome_real or nome_real == "undefined":
        nome_real = ld.name if ld else "Nome não informado"

    usuario = None
    if lo.usuario_chatwit:
        usuario = {
            "id": lo.usuario_chatwit_id,
            "name": lo.usuario_chatwit.name,
            "email": lo.usuario_chatwit.name,
            "channel": lo.usuario_chatwit.channel,
        }

    base = {
        "id": lo.id,
        "sourceId": lo.lead_id,
        "name": ld.name if ld else None,
        "nomeReal": nome_real,
        "phoneNumber": ld.phone if ld else None,
        "email": ld.email if ld else None,
        "thumbnail": ld.avatar_url if ld else None,
        "concluido": lo.concluido,
        "alwaysShowInLeadList": lo.always_show_in_lead_list,
        "fezRecurso": lo.fez_recurso,
        "createdAt": ld.created_at.isoformat() if ld and ld.created_at else None,
        "updatedAt": ld.updated_at.isoformat() if ld and ld.updated_at else None,
        "usuarioId": lo.usuario_chatwit_id,
        "usuario": usuario,
    }

    if marketing_mode:
        base["leadData"] = {
            "id": ld.id if ld else lo.lead_id,
            "name": ld.name if ld else "Nome não informado",
            "email": ld.email if ld else None,
            "phone": ld.phone if ld else None,
        }
        return base

    arq_list = [
        {
            "id": a.id,
            "fileType": a.file_type,
            "dataUrl": a.data_url,
            "pdfConvertido": a.pdf_convertido,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in (arquivos or [])
    ]

    pay_list = [
        {
            "id": p.id,
            "amountCents": p.amount_cents,
            "paidAmountCents": p.paid_amount_cents,
            "captureMethod": p.capture_method,
            "serviceType": p.service_type,
            "description": p.description,
            "receiptUrl": p.receipt_url,
            "confirmedAt": p.confirmed_at.isoformat() if p.confirmed_at else None,
        }
        for p in (payments or [])
    ]

    return {
        **base,
        "anotacoes": lo.anotacoes,
        "pdfUnificado": lo.pdf_unificado,
        "imagensConvertidas": lo.imagens_convertidas,
        "leadUrl": lo.lead_url,
        "datasRecurso": lo.datas_recurso,
        "provaManuscrita": lo.prova_manuscrita,
        "manuscritoProcessado": lo.manuscrito_processado,
        "aguardandoManuscrito": lo.aguardando_manuscrito,
        "espelhoCorrecao": lo.espelho_correcao,
        "textoDOEspelho": lo.texto_do_espelho,
        "analiseUrl": lo.analise_url,
        "argumentacaoUrl": lo.argumentacao_url,
        "analiseProcessada": lo.analise_processada,
        "aguardandoAnalise": lo.aguardando_analise,
        "analisePreliminar": lo.analise_preliminar,
        "analiseValidada": lo.analise_validada,
        "consultoriaFase2": lo.consultoria_fase2,
        "seccional": lo.seccional,
        "areaJuridica": lo.area_juridica,
        "notaFinal": lo.nota_final,
        "situacao": lo.situacao,
        "inscricao": lo.inscricao,
        "examesParticipados": lo.exames_participados,
        "recursoUrl": lo.recurso_url,
        "recursoPreliminar": lo.recurso_preliminar,
        "aguardandoRecurso": lo.aguardando_recurso,
        "recursoValidado": lo.recurso_validado,
        "recursoArgumentacaoUrl": lo.recurso_argumentacao_url,
        "espelhoProcessado": lo.espelho_processado,
        "aguardandoEspelho": lo.aguardando_espelho,
        "especialidade": lo.especialidade,
        "espelhoPadraoId": lo.espelho_padrao_id,
        "arquivos": arq_list,
        "payments": pay_list,
    }


# ---------------------------------------------------------------------------
# Lead CRUD
# ---------------------------------------------------------------------------

async def update_lead(
    session: AsyncSession,
    user_id: str,
    lead_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    role = await _get_user_role(session, user_id)

    stmt = select(LeadOabData).where(LeadOabData.id == lead_id)
    if role != "SUPERADMIN":
        stmt = stmt.join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id).where(
            UsuarioChatwit.app_user_id == user_id
        )

    result = await session.execute(stmt)
    lo = result.scalar_one_or_none()
    if not lo:
        raise LeadsServiceError("Lead não encontrado ou acesso negado")

    # Map of JSON field → model attr
    field_map = {
        "nomeReal": "nome_real", "anotacoes": "anotacoes", "concluido": "concluido",
        "fezRecurso": "fez_recurso", "datasRecurso": "datas_recurso",
        "textoDOEspelho": "texto_do_espelho", "espelhoCorrecao": "espelho_correcao",
        "pdfUnificado": "pdf_unificado", "imagensConvertidas": "imagens_convertidas",
        "analiseUrl": "analise_url", "analiseProcessada": "analise_processada",
        "aguardandoAnalise": "aguardando_analise", "analisePreliminar": "analise_preliminar",
        "analiseValidada": "analise_validada", "consultoriaFase2": "consultoria_fase2",
        "alwaysShowInLeadList": "always_show_in_lead_list",
        "recursoPreliminar": "recurso_preliminar",
        "aguardandoManuscrito": "aguardando_manuscrito",
        "manuscritoProcessado": "manuscrito_processado", "provaManuscrita": "prova_manuscrita",
        "aguardandoEspelho": "aguardando_espelho", "espelhoProcessado": "espelho_processado",
    }
    for json_key, attr in field_map.items():
        if json_key in data:
            setattr(lo, attr, data[json_key])

    # Update Lead.email if provided
    if "email" in data and data["email"] is not None:
        lead_row = await session.get(Lead, lo.lead_id)
        if lead_row:
            lead_row.email = data["email"]

    await session.commit()
    await session.refresh(lo)
    return {"success": True, "lead": {"id": lo.id}}


async def delete_lead(session: AsyncSession, user_id: str, lead_id: str) -> None:
    role = await _get_user_role(session, user_id)

    stmt = select(LeadOabData).where(LeadOabData.id == lead_id)
    if role != "SUPERADMIN":
        stmt = stmt.join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id).where(
            UsuarioChatwit.app_user_id == user_id
        )
    result = await session.execute(stmt)
    lo = result.scalar_one_or_none()
    if not lo:
        raise LeadsServiceError("Lead não encontrado ou acesso negado")

    await session.delete(lo)
    await session.commit()


# ---------------------------------------------------------------------------
# Lead status
# ---------------------------------------------------------------------------

async def get_lead_status(session: AsyncSession, lead_id: str) -> dict[str, Any] | None:
    result = await session.execute(
        select(
            LeadOabData.id,
            LeadOabData.aguardando_manuscrito,
            LeadOabData.manuscrito_processado,
            LeadOabData.prova_manuscrita,
        ).where(LeadOabData.id == lead_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    return {
        "id": row[0],
        "aguardandoManuscrito": row[1],
        "manuscritoProcessado": row[2],
        "provaManuscrita": row[3],
    }


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

async def get_stats(session: AsyncSession, user_id: str) -> dict[str, Any]:
    role = await _get_user_role(session, user_id)
    token = await _get_usuario_chatwit_token(session, user_id)

    if role != "SUPERADMIN" and not token:
        return {"stats": {"totalLeads": 0, "totalArquivos": 0, "pendentes": 0}, "charts": {"leadsPorMes": [], "leadsPorCanal": []}}

    # Ownership filter
    lead_filter = []
    arq_filter = []
    if role != "SUPERADMIN":
        lead_filter.append(UsuarioChatwit.app_user_id == user_id)
        arq_filter.append(UsuarioChatwit.app_user_id == user_id)

    # Base queries
    base_stmt = (
        select(func.count(LeadOabData.id))
        .select_from(LeadOabData)
        .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
    )
    if lead_filter:
        base_stmt = base_stmt.where(*lead_filter)

    total_leads = (await session.execute(base_stmt)).scalar_one()

    pendentes_stmt = base_stmt.where(LeadOabData.concluido.is_(False))
    if lead_filter:
        pendentes_stmt = (
            select(func.count(LeadOabData.id))
            .select_from(LeadOabData)
            .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
            .where(*lead_filter)
            .where(LeadOabData.concluido.is_(False))
        )
    pendentes = (await session.execute(pendentes_stmt)).scalar_one()

    aguardando_stmt = (
        select(func.count(LeadOabData.id))
        .select_from(LeadOabData)
        .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
        .where(
            *(lead_filter or []),
            or_(
                LeadOabData.aguardando_manuscrito.is_(True),
                LeadOabData.aguardando_espelho.is_(True),
                LeadOabData.aguardando_analise.is_(True),
            )
        )
    )
    aguardando = (await session.execute(aguardando_stmt)).scalar_one()

    # Total arquivos
    arq_stmt = (
        select(func.count(ArquivoLeadOab.id))
        .select_from(ArquivoLeadOab)
        .join(LeadOabData, LeadOabData.id == ArquivoLeadOab.lead_oab_data_id)
        .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
    )
    if arq_filter:
        arq_stmt = arq_stmt.where(*arq_filter)
    total_arquivos = (await session.execute(arq_stmt)).scalar_one()

    stats: dict[str, Any] = {
        "totalLeads": total_leads,
        "totalArquivos": total_arquivos,
        "pendentes": pendentes,
        "aguardandoProcessamento": aguardando,
    }
    if role == "SUPERADMIN":
        stats["totalUsuarios"] = (await session.execute(select(func.count(UsuarioChatwit.id)))).scalar_one()

    # Chart: leads per month (last 6 months)
    now = datetime.now(timezone.utc)
    months_data = []
    for i in range(5, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

        month_base = (
            select(func.count(LeadOabData.id))
            .select_from(LeadOabData)
            .join(Lead, Lead.id == LeadOabData.lead_id)
            .join(UsuarioChatwit, UsuarioChatwit.id == LeadOabData.usuario_chatwit_id)
            .where(*(lead_filter or []), Lead.created_at >= start, Lead.created_at < end)
        )
        total_m = (await session.execute(month_base)).scalar_one()
        done_m = (await session.execute(month_base.where(LeadOabData.concluido.is_(True)))).scalar_one()

        months_data.append({
            "month": start.strftime("%B").lower(),
            "leadsTotal": total_m,
            "leadsConcluidos": done_m,
        })

    # Chart: leads per channel
    canal_filter = []
    if role != "SUPERADMIN":
        canal_filter.append(UsuarioChatwit.app_user_id == user_id)

    canal_stmt = (
        select(UsuarioChatwit.channel, func.count(LeadOabData.id).label("leads"))
        .join(LeadOabData, LeadOabData.usuario_chatwit_id == UsuarioChatwit.id)
        .group_by(UsuarioChatwit.channel)
        .order_by(func.count(LeadOabData.id).desc())
    )
    if canal_filter:
        canal_stmt = canal_stmt.where(*canal_filter)

    canal_result = await session.execute(canal_stmt)
    leads_por_canal = [{"channel": row[0], "leads": row[1]} for row in canal_result]

    return {"stats": stats, "charts": {"leadsPorMes": months_data, "leadsPorCanal": leads_por_canal}}


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------

async def list_usuarios(
    session: AsyncSession,
    user_id: str,
    search: str | None = None,
    page: int = 1,
    limit: int = 10,
) -> dict[str, Any]:
    role = await _get_user_role(session, user_id)
    token = await _get_usuario_chatwit_token(session, user_id)

    if role != "SUPERADMIN" and not token:
        return {"usuarios": [], "pagination": {"total": 0, "page": page, "limit": limit, "totalPages": 0}}

    skip = (page - 1) * limit

    conditions = []
    if role != "SUPERADMIN":
        conditions.append(UsuarioChatwit.app_user_id == user_id)

    if search:
        s = search.lower()
        conditions.append(
            or_(
                func.lower(UsuarioChatwit.name).contains(s),
                func.lower(UsuarioChatwit.available_name).contains(s),
                func.lower(UsuarioChatwit.account_name).contains(s),
                func.lower(UsuarioChatwit.channel).contains(s),
            )
        )

    count_stmt = select(func.count(UsuarioChatwit.id)).where(*conditions)
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = (
        select(UsuarioChatwit)
        .where(*conditions)
        .order_by(UsuarioChatwit.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    usuarios = list(result.scalars())

    # Leads count per usuario
    user_ids = [u.id for u in usuarios]
    counts: dict[str, int] = {}
    if user_ids:
        count_q = (
            select(LeadOabData.usuario_chatwit_id, func.count(LeadOabData.id).label("c"))
            .where(LeadOabData.usuario_chatwit_id.in_(user_ids))
            .group_by(LeadOabData.usuario_chatwit_id)
        )
        for row in (await session.execute(count_q)):
            counts[row[0]] = row[1]

    serialized = []
    for u in usuarios:
        serialized.append({
            "id": u.id,
            "name": u.name,
            "availableName": u.available_name,
            "accountName": u.account_name,
            "channel": u.channel,
            "appUserId": u.app_user_id,
            "chatwitAccountId": u.chatwit_account_id,
            "createdAt": u.created_at.isoformat() if u.created_at else None,
            "updatedAt": u.updated_at.isoformat() if u.updated_at else None,
            "leadsCount": counts.get(u.id, 0),
        })

    return {
        "usuarios": serialized,
        "pagination": {"total": total, "page": page, "limit": limit, "totalPages": max(1, -(-total // limit))},
    }


async def delete_usuario(session: AsyncSession, user_id: str, target_id: str) -> None:
    role = await _get_user_role(session, user_id)
    if role != "SUPERADMIN":
        raise LeadsServiceError("Acesso negado. Apenas SUPERADMIN pode remover usuários.")

    usuario = await session.get(UsuarioChatwit, target_id)
    if not usuario:
        raise LeadsServiceError("Usuário não encontrado")

    await session.delete(usuario)
    await session.commit()
