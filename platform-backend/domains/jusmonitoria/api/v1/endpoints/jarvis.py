"""JARVIS AI assistant endpoints — briefing matinal and chat."""

import asyncio
import json
import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import CurrentUser
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.ai_conversation import AIConversation
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.schemas.jarvis import (
    BriefingMovementItem,
    BriefingRequest,
    BriefingResponse,
    ChatRequest,
    ChatResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jarvis", tags=["jarvis"])

STREAM_CHUNK_SIZE = 4


def _to_sse_event(payload: dict[str, Any]) -> str:
    """Encode a payload as a Server-Sent Event message."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _find_chat_conversation(
    db: AsyncSession,
    tenant_id: UUID,
    conversation_id: UUID | None,
    chat_id: str | None,
) -> AIConversation | None:
    """Load a tenant-scoped chat conversation by explicit id or frontend chat id."""
    if conversation_id:
        conversation = await db.get(AIConversation, conversation_id)
        if conversation and conversation.tenant_id == tenant_id:
            return conversation

    if not chat_id:
        return None

    stmt = (
        select(AIConversation)
        .where(
            and_(
                AIConversation.tenant_id == tenant_id,
                AIConversation.conversation_type == "chat",
                AIConversation.conversation_metadata["chat_id"].astext == chat_id,
            )
        )
        .order_by(AIConversation.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def _run_jarvis_chat(
    db: AsyncSession,
    tenant_id: UUID,
    message: str,
) -> tuple[str, str | None]:
    """Execute the JARVIS workflow and return the final text response."""
    try:
        from domains.jusmonitoria.ai.agents.maestro import MaestroAgent

        maestro = MaestroAgent(db, tenant_id)
        context = await _build_chat_context(db, tenant_id)

        result = await maestro.execute_workflow(
            task_type="chat_jarvis",
            initial_message=message,
            context=context,
        )

        if isinstance(result, dict):
            response_text = (
                result.get("briefing")
                or result.get("summary")
                or result.get("translated")
                or result.get("document")
                or str(result)
            )
        else:
            response_text = str(result) if result else "Não consegui processar sua solicitação."

        return response_text, "Maestro"

    except Exception as e:
        logger.error(
            "jarvis_chat_error",
            extra={"tenant_id": str(tenant_id), "error": str(e)},
        )
        return (
            "Desculpe, encontrei um problema ao processar sua mensagem. "
            "Por favor, tente novamente em alguns instantes.",
            None,
        )


async def _persist_chat_conversation(
    db: AsyncSession,
    conversation: AIConversation | None,
    tenant_id: UUID,
    user_id: UUID,
    message: str,
    response_text: str,
    agent_used: str | None,
    chat_id: str | None,
) -> AIConversation:
    """Persist the updated chat history and metadata."""
    previous_messages = list(conversation.messages or []) if conversation else []

    previous_messages.append({
        "role": "user",
        "content": message,
        "timestamp": datetime.now(UTC).isoformat(),
    })
    previous_messages.append({
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.now(UTC).isoformat(),
    })

    metadata = {
        "user_id": str(user_id),
        "last_agent": agent_used,
    }
    if chat_id:
        metadata["chat_id"] = chat_id

    if conversation:
        conversation.messages = previous_messages
        conversation.conversation_metadata = {
            **(conversation.conversation_metadata or {}),
            **metadata,
        }
    else:
        conversation = AIConversation(
            tenant_id=tenant_id,
            conversation_type="chat",
            agent_name="JARVIS",
            messages=previous_messages,
            conversation_metadata=metadata,
        )
        db.add(conversation)

    await db.flush()
    await db.refresh(conversation)
    await db.commit()
    return conversation


async def _stream_ai_sdk_chat_response(
    response_text: str,
    conversation_id: UUID,
    agent_used: str | None,
) -> Any:
    """Yield Vercel AI SDK-compatible UI message chunks over SSE."""
    text_part_id = f"text-{conversation_id}"

    yield _to_sse_event({"type": "start", "messageId": str(conversation_id)})
    yield _to_sse_event({"type": "text-start", "id": text_part_id})

    for index in range(0, len(response_text), STREAM_CHUNK_SIZE):
        chunk = response_text[index:index + STREAM_CHUNK_SIZE]
        yield _to_sse_event({"type": "text-delta", "id": text_part_id, "delta": chunk})
        await asyncio.sleep(0)

    yield _to_sse_event({"type": "text-end", "id": text_part_id})
    yield _to_sse_event(
        {
            "type": "finish",
            "finishReason": "stop",
            "messageMetadata": {
                "conversation_id": str(conversation_id),
                "agent_used": agent_used,
                "timestamp": datetime.now(UTC).isoformat(),
            },
        }
    )
    yield "data: [DONE]\n\n"


# ═══════════════════════════════════════════════════════════════════
# BRIEFING MATINAL
# ═══════════════════════════════════════════════════════════════════


@router.post("/briefing", response_model=BriefingResponse)
async def generate_briefing(
    body: BriefingRequest = BriefingRequest(),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Generate JARVIS morning briefing.

    Analyses only processes with **new** movements in the last N hours.
    Classifies each movement by urgency and generates an executive summary
    using the AI agents (Investigador for classification, Redator for summary).
    """
    tenant_id = current_user.tenant_id
    hours_back = body.hours_back
    since = datetime.now(UTC) - timedelta(hours=hours_back)

    logger.info(
        "jarvis_briefing_requested",
        extra={
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "hours_back": hours_back,
        },
    )

    # ── 1. Fetch movements created since cutoff ─────────────────
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

    result = await db.execute(stmt)
    rows = result.all()

    # ── 2. Count total monitored cases (to report "no news") ────
    total_cases_stmt = select(func.count()).where(
        and_(
            LegalCase.tenant_id == tenant_id,
            LegalCase.monitoring_enabled,
        )
    )
    total_cases = (await db.execute(total_cases_stmt)).scalar_one()

    # Fast path: nothing new
    if not rows:
        return BriefingResponse(
            date=date.today().isoformat(),
            summary=(
                f"Bom dia! Nenhuma movimentação nova nas últimas {hours_back} horas. "
                f"Todos os {total_cases} processos monitorados estão sem alterações."
            ),
            total_cases_analyzed=total_cases,
            cases_with_no_news=total_cases,
        )

    # ── 3. Build movement items & quick-classify ────────────────
    seen_case_ids: set[UUID] = set()
    classified: dict[str, list[BriefingMovementItem]] = {
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
        item = BriefingMovementItem(
            movement_id=movement.id,
            case_id=case.id,
            cnj_number=case.cnj_number,
            client_name=client.full_name,
            movement_date=movement.movement_date,
            movement_type=movement.movement_type,
            description=movement.description,
            ai_summary=movement.ai_summary,
            is_important=movement.is_important,
            requires_action=movement.requires_action,
        )

        # Deterministic fast classification (no LLM cost)
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
    cases_with_no_news = max(total_cases - cases_with_news, 0)
    total_movements = len(rows)

    # ── 4. Generate executive summary with AI ───────────────────
    summary = await _generate_jarvis_summary(
        db=db,
        tenant_id=tenant_id,
        classified=classified,
        total_movements=total_movements,
        total_cases=total_cases,
        cases_with_news=cases_with_news,
    )

    # ── 5. Persist conversation for history ─────────────────────
    conversation = AIConversation(
        tenant_id=tenant_id,
        conversation_type="briefing_matinal",
        agent_name="JARVIS",
        messages=[
            {"role": "system", "content": "Briefing matinal gerado"},
            {"role": "assistant", "content": summary},
        ],
        result={
            "total_movements": total_movements,
            "urgente": len(classified["urgente"]),
            "atencao": len(classified["atencao"]),
            "boas_noticias": len(classified["boas_noticias"]),
            "ruido": len(classified["ruido"]),
        },
        conversation_metadata={
            "hours_back": hours_back,
            "user_id": str(current_user.id),
        },
    )
    db.add(conversation)
    await db.commit()

    # ── 6. Send real-time notification via WebSocket ──────────
    try:
        from domains.jusmonitoria.services.notification_service import NotificationService
        notification_svc = NotificationService(db)
        await notification_svc.create_briefing_available_notification(
            tenant_id=tenant_id,
            user_id=current_user.id,
            briefing_date=date.today().isoformat(),
            urgent_count=len(classified["urgente"]),
            attention_count=len(classified["atencao"]),
        )
    except Exception as e:
        logger.warning("briefing_notification_failed", extra={"error": str(e)})

    # ── 6b. Broadcast briefing_ready event via WebSocket ─────
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
    except Exception as e:
        logger.warning("briefing_ws_broadcast_failed", extra={"error": str(e)})

    return BriefingResponse(
        date=date.today().isoformat(),
        summary=summary,
        urgente=classified["urgente"],
        atencao=classified["atencao"],
        boas_noticias=classified["boas_noticias"],
        ruido=classified["ruido"],
        total_movements=total_movements,
        total_cases_analyzed=total_cases,
        cases_with_no_news=cases_with_no_news,
    )


# ═══════════════════════════════════════════════════════════════════
# CHAT (general-purpose JARVIS interaction)
# ═══════════════════════════════════════════════════════════════════


@router.post("/chat", response_model=ChatResponse)
async def jarvis_chat(
    body: ChatRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Chat with JARVIS.

    Routes the user's message through the Maestro orchestrator which
    delegates to the appropriate agent (Triagem, Investigador, Redator).
    """
    tenant_id = current_user.tenant_id

    logger.info(
        "jarvis_chat_message",
        extra={
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "message_length": len(body.message),
        },
    )

    conversation = await _find_chat_conversation(
        db,
        tenant_id,
        body.conversation_id,
        body.chat_id,
    )
    response_text, agent_used = await _run_jarvis_chat(db, tenant_id, body.message)
    conversation = await _persist_chat_conversation(
        db=db,
        conversation=conversation,
        tenant_id=tenant_id,
        user_id=current_user.id,
        message=body.message,
        response_text=response_text,
        agent_used=agent_used,
        chat_id=body.chat_id,
    )

    return ChatResponse(
        message=response_text,
        conversation_id=conversation.id,
        agent_used=agent_used,
    )


@router.post("/chat/stream")
async def jarvis_chat_stream(
    body: ChatRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Stream a JARVIS chat response as AI SDK-compatible Server-Sent Events."""
    tenant_id = current_user.tenant_id

    logger.info(
        "jarvis_chat_stream_message",
        extra={
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "message_length": len(body.message),
        },
    )

    conversation = await _find_chat_conversation(
        db,
        tenant_id,
        body.conversation_id,
        body.chat_id,
    )
    response_text, agent_used = await _run_jarvis_chat(db, tenant_id, body.message)
    conversation = await _persist_chat_conversation(
        db=db,
        conversation=conversation,
        tenant_id=tenant_id,
        user_id=current_user.id,
        message=body.message,
        response_text=response_text,
        agent_used=agent_used,
        chat_id=body.chat_id,
    )

    return StreamingResponse(
        _stream_ai_sdk_chat_response(
            response_text=response_text,
            conversation_id=conversation.id,
            agent_used=agent_used,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "x-vercel-ai-ui-message-stream": "v1",
        },
    )


# ═══════════════════════════════════════════════════════════════════
# BRIEFING HISTORY
# ═══════════════════════════════════════════════════════════════════


@router.get("/briefings")
async def list_briefings(
    current_user: CurrentUser,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """List previous JARVIS briefings for current tenant."""
    stmt = (
        select(AIConversation)
        .where(
            and_(
                AIConversation.tenant_id == current_user.tenant_id,
                AIConversation.conversation_type == "briefing_matinal",
            )
        )
        .order_by(AIConversation.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    conversations = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "summary": (c.messages[-1]["content"] if c.messages else ""),
            "stats": c.result or {},
        }
        for c in conversations
    ]


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════


async def _generate_jarvis_summary(
    db: AsyncSession,
    tenant_id: UUID,
    classified: dict[str, list[BriefingMovementItem]],
    total_movements: int,
    total_cases: int,
    cases_with_news: int,
) -> str:
    """Generate executive summary via RedatorAgent, with fallback."""
    urgente_count = len(classified["urgente"])
    atencao_count = len(classified["atencao"])
    boas_count = len(classified["boas_noticias"])
    ruido_count = len(classified["ruido"])

    # Build context text for the AI
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
                f"- [{mov.cnj_number}] {mov.client_name}: {mov.description[:120]}"
            )

    if classified["boas_noticias"]:
        context_parts.append("\nBoas Notícias:")
        for mov in classified["boas_noticias"][:3]:
            context_parts.append(
                f"- [{mov.cnj_number}] {mov.client_name}: {mov.description[:120]}"
            )

    if classified["atencao"]:
        context_parts.append("\nAtenção:")
        for mov in classified["atencao"][:3]:
            context_parts.append(
                f"- [{mov.cnj_number}] {mov.client_name}: {mov.description[:120]}"
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

        redator = RedatorAgent(db, tenant_id)
        summary = await redator.execute(
            user_message=prompt,
            temperature=0.6,
            max_tokens=400,
            use_case="daily",
        )
        return summary.strip()

    except Exception as e:
        logger.error(
            "jarvis_summary_fallback",
            extra={"tenant_id": str(tenant_id), "error": str(e)},
        )
        # Deterministic fallback — no LLM needed
        parts = [f"Bom dia! Aqui é o JARVIS com seu briefing de {date.today().strftime('%d/%m/%Y')}."]
        parts.append(f"\n{total_movements} movimentações novas em {cases_with_news} processos.")

        if urgente_count:
            parts.append(f"\n⚠️ {urgente_count} movimentações URGENTES requerem ação imediata.")
        if boas_count:
            parts.append(f"\n✅ {boas_count} boas notícias!")
        if atencao_count:
            parts.append(f"\n📋 {atencao_count} itens requerem atenção.")

        parts.append(f"\n{total_cases - cases_with_news} processos sem alterações.")
        return " ".join(parts)


async def _build_chat_context(
    db: AsyncSession,
    tenant_id: UUID,
) -> dict[str, Any]:
    """Build context dict with recent case data for JARVIS chat."""
    # Recent important movements (last 7 days)
    since = datetime.now(UTC) - timedelta(days=7)
    stmt = (
        select(CaseMovement, LegalCase)
        .join(LegalCase, CaseMovement.legal_case_id == LegalCase.id)
        .where(
            and_(
                CaseMovement.tenant_id == tenant_id,
                CaseMovement.created_at >= since,
                CaseMovement.is_important,
            )
        )
        .order_by(CaseMovement.movement_date.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    rows = result.all()

    recent_events = []
    for movement, case in rows:
        recent_events.append(
            f"[{case.cnj_number}] {movement.movement_date}: {movement.description[:150]}"
        )

    # Active case count
    case_count = (await db.execute(
        select(func.count()).where(
            and_(LegalCase.tenant_id == tenant_id, LegalCase.monitoring_enabled)
        )
    )).scalar_one()

    return {
        "recent_events": "\n".join(recent_events) if recent_events else "Sem movimentações recentes.",
        "total_cases": f"{case_count} processos monitorados",
    }
