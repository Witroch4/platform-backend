"""Taskiq workers for AI-powered tasks — morning briefing, async analysis."""

import logging
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.session_compat import AsyncSessionLocal, session_ctx
from domains.jusmonitoria.db.models.ai_conversation import AIConversation
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.user import User

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# MORNING BRIEFING — Cron Task (scheduler-compatible: zero args)
# ═══════════════════════════════════════════════════════════════════


async def generate_morning_briefings() -> dict:
    """
    Generate morning briefings for ALL active tenants.

    Called by the scheduler cron job (default: every day at 7:00 UTC).
    For each tenant:
      1. Query movements from the last 24 hours
      2. Classify each movement (urgente/atenção/boa notícia/ruído)
      3. Generate executive summary via RedatorAgent
      4. Persist as AIConversation (type=briefing_matinal)
      5. Notify all users of the tenant via NotificationService + WebSocket

    Returns:
        Dict with stats: tenants_processed, total_movements, errors
    """
    logger.info("morning_briefing_cron_started")

    stats = {
        "tenants_processed": 0,
        "tenants_skipped": 0,
        "total_movements": 0,
        "errors": [],
    }

    async with AsyncSessionLocal() as session:
        from domains.jusmonitoria.db.repositories.tenant import TenantRepository

        tenant_repo = TenantRepository(session)
        tenants = await tenant_repo.get_active_tenants()

        logger.info("morning_briefing_tenants_found", extra={"count": len(tenants)})

        for tenant in tenants:
            try:
                result = await _generate_briefing_for_tenant(
                    session=session,
                    tenant_id=tenant.id,
                )
                if result["skipped"]:
                    stats["tenants_skipped"] += 1
                else:
                    stats["tenants_processed"] += 1
                    stats["total_movements"] += result["total_movements"]
            except Exception as e:
                logger.error(
                    "morning_briefing_tenant_error",
                    extra={"tenant_id": str(tenant.id), "error": str(e)},
                )
                stats["errors"].append(
                    {"tenant_id": str(tenant.id), "error": str(e)}
                )

    logger.info(
        "morning_briefing_cron_completed",
        extra={
            "tenants_processed": stats["tenants_processed"],
            "tenants_skipped": stats["tenants_skipped"],
            "total_movements": stats["total_movements"],
            "error_count": len(stats["errors"]),
        },
    )

    return stats


# ═══════════════════════════════════════════════════════════════════
# INTERNAL — Per-tenant briefing generation
# ═══════════════════════════════════════════════════════════════════


async def _generate_briefing_for_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    hours_back: int = 24,
) -> dict:
    """
    Generate morning briefing for a single tenant.

    Returns:
        Dict with: skipped (bool), total_movements (int)
    """
    since = datetime.utcnow() - timedelta(hours=hours_back)

    # ── 1. Fetch new movements ────────────────────────────────────
    stmt = (
        select(CaseMovement, LegalCase, Client)
        .join(LegalCase, CaseMovement.legal_case_id == LegalCase.id)
        .join(Client, LegalCase.client_id == Client.id)
        .where(
            and_(
                CaseMovement.tenant_id == tenant_id,
                CaseMovement.created_at >= since,
            )
        )
        .order_by(CaseMovement.movement_date.desc())
    )
    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        logger.debug(
            "morning_briefing_no_movements",
            extra={"tenant_id": str(tenant_id)},
        )
        return {"skipped": True, "total_movements": 0}

    # ── 2. Count monitored cases ──────────────────────────────────
    total_cases = (
        await session.execute(
            select(func.count()).where(
                and_(
                    LegalCase.tenant_id == tenant_id,
                    LegalCase.monitoring_enabled == True,
                )
            )
        )
    ).scalar_one()

    # ── 3. Classify movements (deterministic — no LLM cost) ──────
    seen_case_ids: set[UUID] = set()
    classified: dict[str, list[dict]] = {
        "urgente": [],
        "atencao": [],
        "boas_noticias": [],
        "ruido": [],
    }

    good_news_keywords = [
        "deferido", "procedente", "favorável", "ganho",
        "homologado", "aprovado", "êxito",
    ]
    urgent_keywords = [
        "sentença", "intimação", "recurso", "prazo",
        "citação", "embargo", "mandado",
    ]

    for movement, case, client in rows:
        seen_case_ids.add(case.id)
        item = {
            "movement_id": str(movement.id),
            "case_id": str(case.id),
            "cnj_number": case.cnj_number,
            "client_name": client.full_name,
            "movement_date": str(movement.movement_date),
            "movement_type": movement.movement_type,
            "description": movement.description,
            "is_important": movement.is_important,
            "requires_action": movement.requires_action,
        }

        desc_lower = movement.description.lower()

        if movement.requires_action:
            classified["urgente"].append(item)
        elif movement.is_important:
            if any(kw in desc_lower for kw in good_news_keywords):
                classified["boas_noticias"].append(item)
            else:
                classified["atencao"].append(item)
        elif any(kw in desc_lower for kw in urgent_keywords):
            classified["atencao"].append(item)
        else:
            classified["ruido"].append(item)

    cases_with_news = len(seen_case_ids)
    total_movements = len(rows)

    # ── 4. Generate AI executive summary ──────────────────────────
    summary = await _generate_summary_for_cron(
        session=session,
        tenant_id=tenant_id,
        classified=classified,
        total_movements=total_movements,
        total_cases=total_cases,
        cases_with_news=cases_with_news,
    )

    # ── 5. Persist as AIConversation ──────────────────────────────
    conversation = AIConversation(
        tenant_id=tenant_id,
        conversation_type="briefing_matinal",
        agent_name="JARVIS",
        messages=[
            {"role": "system", "content": "Briefing matinal automático (cron)"},
            {"role": "assistant", "content": summary},
        ],
        result={
            "total_movements": total_movements,
            "urgente": len(classified["urgente"]),
            "atencao": len(classified["atencao"]),
            "boas_noticias": len(classified["boas_noticias"]),
            "ruido": len(classified["ruido"]),
            "generated_by": "cron",
        },
        conversation_metadata={
            "hours_back": hours_back,
            "generated_by": "morning_briefing_cron",
        },
    )
    session.add(conversation)
    await session.flush()

    # ── 6. Notify all users of the tenant ─────────────────────────
    await _notify_tenant_users(
        session=session,
        tenant_id=tenant_id,
        classified=classified,
    )

    # ── 7. WebSocket broadcast: briefing_ready ────────────────────
    await _broadcast_briefing_ready(
        tenant_id=tenant_id,
        classified=classified,
        total_movements=total_movements,
    )

    await session.commit()

    logger.info(
        "morning_briefing_tenant_completed",
        extra={
            "tenant_id": str(tenant_id),
            "total_movements": total_movements,
            "urgente": len(classified["urgente"]),
            "atencao": len(classified["atencao"]),
            "boas_noticias": len(classified["boas_noticias"]),
        },
    )

    return {"skipped": False, "total_movements": total_movements}


async def _generate_summary_for_cron(
    session: AsyncSession,
    tenant_id: UUID,
    classified: dict[str, list[dict]],
    total_movements: int,
    total_cases: int,
    cases_with_news: int,
) -> str:
    """Generate executive summary via RedatorAgent, with deterministic fallback."""
    urgente_count = len(classified["urgente"])
    atencao_count = len(classified["atencao"])
    boas_count = len(classified["boas_noticias"])
    ruido_count = len(classified["ruido"])

    context_parts = [
        f"Data: {date.today().strftime('%d/%m/%Y')}",
        f"Total processos monitorados: {total_cases}",
        f"Processos com novidades: {cases_with_news}",
        f"Total movimentações novas: {total_movements}",
        f"- Urgentes: {urgente_count}",
        f"- Atenção: {atencao_count}",
        f"- Boas Notícias: {boas_count}",
        f"- Ruído: {ruido_count}",
    ]

    if classified["urgente"]:
        context_parts.append("\nMovimentações URGENTES:")
        for mov in classified["urgente"][:5]:
            context_parts.append(
                f"- [{mov['cnj_number']}] {mov['client_name']}: {mov['description'][:120]}"
            )

    if classified["boas_noticias"]:
        context_parts.append("\nBoas Notícias:")
        for mov in classified["boas_noticias"][:3]:
            context_parts.append(
                f"- [{mov['cnj_number']}] {mov['client_name']}: {mov['description'][:120]}"
            )

    if classified["atencao"]:
        context_parts.append("\nAtenção:")
        for mov in classified["atencao"][:3]:
            context_parts.append(
                f"- [{mov['cnj_number']}] {mov['client_name']}: {mov['description'][:120]}"
            )

    context_text = "\n".join(context_parts)

    prompt = f"""Você é JARVIS, assistente jurídico inteligente. Gere o briefing matinal:

{context_text}

O briefing deve:
- Começar com "Bom dia! Aqui é o JARVIS com seu briefing de hoje."
- Ser conciso (máximo 250 palavras)
- Destacar pontos críticos primeiro (urgentes)
- Mencionar boas notícias para equilibrar
- Indicar ações necessárias
- Tom profissional mas acessível
- Terminar com uma frase motivacional curta
"""

    try:
        from domains.jusmonitoria.ai.agents.writer import RedatorAgent

        redator = RedatorAgent(session, tenant_id)
        summary = await redator.execute(
            user_message=prompt,
            temperature=0.6,
            max_tokens=400,
            use_case="daily",
        )
        return summary.strip()

    except Exception as e:
        logger.error(
            "morning_briefing_summary_fallback",
            extra={"tenant_id": str(tenant_id), "error": str(e)},
        )
        # Deterministic fallback — no LLM needed
        parts = [
            f"Bom dia! Aqui é o JARVIS com seu briefing de {date.today().strftime('%d/%m/%Y')}."
        ]
        parts.append(
            f"\n{total_movements} movimentações novas em {cases_with_news} processos."
        )
        if urgente_count:
            parts.append(
                f"\n⚠️ {urgente_count} movimentações URGENTES requerem ação imediata."
            )
        if boas_count:
            parts.append(f"\n✅ {boas_count} boas notícias!")
        if atencao_count:
            parts.append(f"\n📋 {atencao_count} itens requerem atenção.")
        parts.append(f"\n{total_cases - cases_with_news} processos sem alterações.")
        return " ".join(parts)


async def _notify_tenant_users(
    session: AsyncSession,
    tenant_id: UUID,
    classified: dict[str, list[dict]],
) -> None:
    """Create a briefing notification for every active user of the tenant."""
    try:
        from domains.jusmonitoria.services.notification_service import NotificationService

        # Get all active users of this tenant
        stmt = select(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.is_active == True,
            )
        )
        result = await session.execute(stmt)
        users = result.scalars().all()

        notification_svc = NotificationService(session)

        for user in users:
            try:
                await notification_svc.create_briefing_available_notification(
                    tenant_id=tenant_id,
                    user_id=user.id,
                    briefing_date=date.today().isoformat(),
                    urgent_count=len(classified["urgente"]),
                    attention_count=len(classified["atencao"]),
                )
            except Exception as e:
                logger.warning(
                    "morning_briefing_user_notification_failed",
                    extra={
                        "tenant_id": str(tenant_id),
                        "user_id": str(user.id),
                        "error": str(e),
                    },
                )

    except Exception as e:
        logger.error(
            "morning_briefing_notification_failed",
            extra={"tenant_id": str(tenant_id), "error": str(e)},
        )


async def _broadcast_briefing_ready(
    tenant_id: UUID,
    classified: dict[str, list[dict]],
    total_movements: int,
) -> None:
    """Broadcast briefing_ready event via WebSocket to all connected clients of the tenant."""
    try:
        from domains.jusmonitoria.api.v1.websocket import manager

        await manager.broadcast_to_tenant(
            message={
                "type": "briefing_ready",
                "data": {
                    "date": date.today().isoformat(),
                    "total_movements": total_movements,
                    "urgente": len(classified["urgente"]),
                    "atencao": len(classified["atencao"]),
                    "boas_noticias": len(classified["boas_noticias"]),
                    "ruido": len(classified["ruido"]),
                },
            },
            tenant_id=tenant_id,
        )

        logger.info(
            "morning_briefing_ws_broadcast",
            extra={"tenant_id": str(tenant_id)},
        )

    except Exception as e:
        logger.warning(
            "morning_briefing_ws_broadcast_failed",
            extra={"tenant_id": str(tenant_id), "error": str(e)},
        )
