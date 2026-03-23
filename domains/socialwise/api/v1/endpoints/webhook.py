"""Socialwise Flow webhook entry-point on FastAPI."""

from __future__ import annotations
import json
import time
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.chatwit_config import (
    get_chatwit_system_config,
    save_chatwit_system_config,
)
from domains.socialwise.services.flow.delivery_service import DeliveryContext
from domains.socialwise.services.flow.orchestrator import FlowOrchestrator
from domains.socialwise.services.flow.payment_handler import handle_payment_confirmed
from domains.socialwise.services.intent.button_processor import detect_button_click, is_flow_button
from domains.socialwise.services.intent.intent_mapping import resolve_intent_mapping
from domains.socialwise.services.intent.payload_builder import (
    build_channel_response,
    build_fallback_response,
    normalize_channel_type,
)
from domains.socialwise.services.intent.processor import process_socialwise_intent
from domains.socialwise.services.leads.webhook_history import (
    WebhookHistoryPayload,
    persist_webhook_history,
)
from domains.socialwise.services.intent.session_state import (
    ConversationMessage,
    InteractiveButtonContext,
    InteractiveMessageContext,
    SessionTtlConfig,
    append_to_history,
    clear_interactive_message_context,
    clear_session_history,
    get_interactive_message_context,
    get_session_history,
    store_interactive_message_context,
)
from domains.socialwise.services.intent.types import ProcessorContext
from domains.socialwise.services.webhook_guards import SocialwiseWebhookGuards
from domains.socialwise.services.webhook_metrics import observe_webhook_result
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/integrations/webhooks/socialwiseflow", tags=["socialwise-webhooks"])

MAX_PAYLOAD_SIZE_KB = 256
FLOW_BUTTON_DEDUP_TTL_SECONDS = 30


@router.get("")
async def socialwiseflow_health() -> dict[str, str]:
    return {"status": "healthy", "route": "socialwiseflow"}


@router.post("")
async def socialwiseflow_webhook(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    trace_id = f"sw-{int(time.time() * 1000)}-{uuid4().hex[:8]}"
    started_at = time.perf_counter()
    route_outcome = "unhandled"
    response_status = status.HTTP_500_INTERNAL_SERVER_ERROR
    dedup_kind: str | None = None
    guards = SocialwiseWebhookGuards()

    try:
        raw_body = await request.body()
        if len(raw_body) > MAX_PAYLOAD_SIZE_KB * 1024:
            route_outcome = "payload_too_large"
            response_status = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Payload too large")

        expected_bearer = settings.socialwiseflow_access_token
        if expected_bearer:
            authz = request.headers.get("authorization", "")
            if not authz.lower().startswith("bearer ") or authz[7:].strip() != expected_bearer:
                route_outcome = "unauthorized"
                response_status = status.HTTP_401_UNAUTHORIZED
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

            nonce = guards.extract_nonce_from_request(request)
            if nonce:
                allowed, error = await guards.check_and_mark_nonce(nonce)
                if not allowed:
                    route_outcome = "replay_blocked"
                    response_status = status.HTTP_400_BAD_REQUEST
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error or "Replay detected")

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            route_outcome = "invalid_json"
            response_status = status.HTTP_400_BAD_REQUEST
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

        if not isinstance(payload, dict):
            route_outcome = "invalid_payload"
            response_status = status.HTTP_400_BAD_REQUEST
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")

        if await guards.is_payload_duplicate(payload):
            route_outcome = "duplicate_message"
            response_status = status.HTTP_200_OK
            dedup_kind = "message"
            return JSONResponse({"ok": True, "dedup": True}, status_code=status.HTTP_200_OK)

        rate_limit_result = await guards.check_payload_rate_limit(payload, request)
        if not rate_limit_result.allowed:
            route_outcome = f"rate_limited_{rate_limit_result.scope}"
            response_status = status.HTTP_429_TOO_MANY_REQUESTS
            return JSONResponse(
                {
                    "error": "Rate limit exceeded",
                    "throttled": True,
                },
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "X-RateLimit-Limit": str(rate_limit_result.limit),
                    "X-RateLimit-Remaining": str(rate_limit_result.remaining),
                    "X-RateLimit-Reset": str(rate_limit_result.reset_time),
                    "X-RateLimit-Scope": rate_limit_result.scope,
                },
            )

        if payload.get("event_type") == "payment.confirmed" and isinstance(payload.get("data"), dict):
            try:
                result = await handle_payment_confirmed(payload, trace_id)
                route_outcome = "payment_confirmed"
                response_status = status.HTTP_200_OK
                return JSONResponse({**result, "event": "payment.confirmed"}, status_code=status.HTTP_200_OK)
            except Exception as exc:
                logger.error("socialwiseflow_payment_confirmed_error", error=str(exc), trace_id=trace_id)
                route_outcome = "payment_confirmed_error"
                response_status = status.HTTP_200_OK
                return JSONResponse(
                    {"ok": True, "event": "payment.confirmed", "error": "processing_failed"},
                    status_code=status.HTTP_200_OK,
                )

        context = payload.get("context") or {}
        message = context.get("message") or {}
        metadata = payload.get("metadata") or {}
        text_input = sanitize_user_text(_extract_text_input(payload))

        channel_type = (
            payload.get("channel_type")
            or (context.get("inbox") or {}).get("channel_type")
            or _nested_get(context, "socialwise-chatwit", "inbox_data", "channel_type")
            or "Channel::WhatsApp"
        )
        button = detect_button_click(payload, channel_type)

        if button.is_button_click and button.button_id == "@falar_atendente":
            route_outcome = "button_handoff"
            response_status = status.HTTP_200_OK
            return JSONResponse({"action": "handoff"}, status_code=status.HTTP_200_OK)
        if button.is_button_click and button.button_id == "@recomecar":
            await clear_session_history(resolve_session_id(payload))
            await clear_interactive_message_context(resolve_session_id(payload))
            route_outcome = "button_restart"
            response_status = status.HTTP_200_OK
            return JSONResponse(
                build_channel_response(channel_type, "Olá! Vamos começar novamente. Como posso ajudar você hoje?"),
                status_code=status.HTTP_200_OK,
            )
        if button.is_button_click and button.button_id == "@sair":
            route_outcome = "button_exit"
            response_status = status.HTTP_200_OK
            return JSONResponse(
                build_channel_response(
                    channel_type,
                    "Até logo! Se precisar de ajuda novamente, é só enviar uma mensagem.",
                ),
                status_code=status.HTTP_200_OK,
            )
        if button.is_button_click and button.button_id == "@retry":
            route_outcome = "button_retry"
            response_status = status.HTTP_200_OK
            return JSONResponse(build_fallback_response(channel_type), status_code=status.HTTP_200_OK)

        if not text_input and not button.is_button_click:
            route_outcome = "missing_message_content"
            response_status = status.HTTP_400_BAD_REQUEST
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message content is required")

        source_message_id = (
            str(message.get("source_id") or "")
            or str(_nested_get(context, "socialwise-chatwit", "wamid") or "")
            or str(_nested_get(context, "socialwise-chatwit", "message_data", "id") or "")
            or str(message.get("id") or "")
        )

        account_id = int(
            metadata.get("account_id")
            or (context.get("inbox") or {}).get("account_id")
            or _nested_get(context, "socialwise-chatwit", "account_data", "id")
            or 0
        )
        external_inbox_id = str(
            _nested_get(context, "socialwise-chatwit", "inbox_data", "id")
            or (context.get("inbox") or {}).get("id")
            or ""
        )
        inbox_row = await resolve_inbox(external_inbox_id, account_id)

        if metadata.get("chatwit_agent_bot_token") and metadata.get("chatwit_base_url"):
            try:
                await save_chatwit_system_config(
                    bot_token=str(metadata["chatwit_agent_bot_token"]),
                    base_url=str(metadata["chatwit_base_url"]),
                )
            except Exception as exc:
                logger.warning("socialwiseflow_save_chatwit_config_failed", error=str(exc), trace_id=trace_id)

        system_chatwit_config = await get_chatwit_system_config()
        contact_name = str(
            _nested_get(context, "socialwise-chatwit", "contact_data", "name")
            or (context.get("contact") or {}).get("name")
            or _nested_get(context, "socialwise-chatwit", "contact_name")
            or ""
        )
        contact_phone = str(
            _nested_get(context, "socialwise-chatwit", "contact_data", "phone_number")
            or (context.get("contact") or {}).get("phone_number")
            or _nested_get(context, "socialwise-chatwit", "contact_phone")
            or ""
        )
        delivery_context = DeliveryContext(
            account_id=account_id,
            conversation_id=int(
                _nested_get(context, "socialwise-chatwit", "conversation_data", "id")
                or (context.get("conversation") or {}).get("id")
                or metadata.get("conversation_id")
                or 0
            ),
            conversation_display_id=int(
                metadata.get("conversation_display_id")
                or (context.get("conversation") or {}).get("display_id")
                or 0
            )
            or None,
            inbox_id=int(external_inbox_id or 0),
            contact_id=int(
                _nested_get(context, "socialwise-chatwit", "contact_data", "id")
                or (context.get("contact") or {}).get("id")
                or 0
            ),
            contact_name=contact_name,
            contact_phone=contact_phone,
            channel_type=normalize_channel_type(channel_type),
            source_message_id=source_message_id or None,
            prisma_inbox_id=inbox_row.id if inbox_row else None,
            chatwit_access_token=str(metadata.get("chatwit_agent_bot_token") or system_chatwit_config.bot_token or ""),
            chatwit_base_url=str(metadata.get("chatwit_base_url") or system_chatwit_config.base_url or ""),
        )

        flow_payload = build_flow_payload(payload, text_input)
        flow_orchestrator = FlowOrchestrator()

        if button.is_button_click and is_flow_button(button.button_id):
            dedup_key = f"sw:flow_btn:{resolve_session_id(payload)}:{button.button_id}"
            if not await _mark_message_if_new(dedup_key, trace_id, FLOW_BUTTON_DEDUP_TTL_SECONDS):
                route_outcome = "duplicate_flow_button"
                response_status = status.HTTP_200_OK
                dedup_kind = "flow_button"
                return JSONResponse({"ok": True, "dedup": True}, status_code=status.HTTP_200_OK)

            flow_result = await flow_orchestrator.handle(flow_payload, delivery_context)
            if flow_result.sync_response:
                await record_history(resolve_session_id(payload), text_input, flow_result.sync_response)
                route_outcome = "flow_sync"
                response_status = status.HTTP_200_OK
                return JSONResponse(flow_result.sync_response, status_code=status.HTTP_200_OK)
            if flow_result.waiting_input or flow_result.handled:
                route_outcome = "flow_async"
                response_status = status.HTTP_200_OK
                return JSONResponse({"status": "accepted", "async": True}, status_code=status.HTTP_200_OK)

        resume_result = await flow_orchestrator.handle(flow_payload, delivery_context)
        if resume_result.sync_response:
            await record_history(resolve_session_id(payload), text_input, resume_result.sync_response)
            route_outcome = "flow_resume_sync"
            response_status = status.HTTP_200_OK
            return JSONResponse(resume_result.sync_response, status_code=status.HTTP_200_OK)
        if resume_result.waiting_input or resume_result.handled:
            route_outcome = "flow_resume_async"
            response_status = status.HTTP_200_OK
            return JSONResponse({"status": "accepted", "async": True}, status_code=status.HTTP_200_OK)

        session_id = resolve_session_id(payload)
        history = await get_session_history(session_id)
        interactive_context = await get_interactive_message_context(session_id)
        supplemental = build_agent_supplement(history, interactive_context)
        blocked_intent_slug = interactive_context.intent_slug if interactive_context and not button.is_button_click else None

        processor_context = ProcessorContext(
            user_text=text_input,
            channel_type=channel_type,
            inbox_id=external_inbox_id,
            chatwit_account_id=str(account_id or "") or None,
            user_id=inbox_row.usuario_chatwit.app_user_id if inbox_row and inbox_row.usuario_chatwit else None,
            session_id=session_id,
            trace_id=trace_id,
            original_payload=payload,
            agent_supplement=supplemental,
            blocked_intent_slug=blocked_intent_slug,
        )
        processor_result = await process_socialwise_intent(processor_context)
        ttl_config = SessionTtlConfig(
            session_ttl_seconds=processor_context.session_ttl_seconds,
            session_ttl_dev_seconds=processor_context.session_ttl_dev_seconds,
        )

        if processor_result.action == "handoff":
            await record_history(session_id, text_input, {"action": "handoff"}, ttl_config=ttl_config, store_interactive=False)
            route_outcome = "router_handoff"
            response_status = status.HTTP_200_OK
            return JSONResponse({"action": "handoff"}, status_code=status.HTTP_200_OK)

        if processor_result.action == "resume_flow" and processor_result.flow_button_id:
            flow_payload["metadata"]["button_id"] = processor_result.flow_button_id
            flow_result = await flow_orchestrator.handle(flow_payload, delivery_context)
            if flow_result.sync_response:
                await record_history(session_id, text_input, flow_result.sync_response, ttl_config=ttl_config, store_interactive=False)
                route_outcome = "router_resume_flow_sync"
                response_status = status.HTTP_200_OK
                return JSONResponse(flow_result.sync_response, status_code=status.HTTP_200_OK)
            if flow_result.waiting_input or flow_result.handled:
                route_outcome = "router_resume_flow_async"
                response_status = status.HTTP_200_OK
                return JSONResponse({"status": "accepted", "async": True}, status_code=status.HTTP_200_OK)

        response: dict[str, Any] | None = processor_result.response
        response_intent_slug: str | None = processor_result.selected_intent.slug if processor_result.selected_intent else None
        if processor_result.selected_intent:
            mapping = await resolve_intent_mapping(
                processor_result.selected_intent.payload,
                prisma_inbox_id=inbox_row.id if inbox_row else "",
                delivery_context=delivery_context,
            )
            if mapping and mapping.flow_id:
                flow_result = await flow_orchestrator.execute_flow_by_id(mapping.flow_id, delivery_context)
                if flow_result.sync_response:
                    await record_history(session_id, text_input, flow_result.sync_response, ttl_config=ttl_config, store_interactive=False)
                    route_outcome = "intent_flow_sync"
                    response_status = status.HTTP_200_OK
                    return JSONResponse(flow_result.sync_response, status_code=status.HTTP_200_OK)
                if flow_result.waiting_input or flow_result.handled:
                    route_outcome = "intent_flow_async"
                    response_status = status.HTTP_200_OK
                    return JSONResponse({"status": "accepted", "async": True}, status_code=status.HTTP_200_OK)
            if mapping and mapping.response:
                response = mapping.response
                response_intent_slug = mapping.intent_slug

        if not response:
            response = build_fallback_response(channel_type)

        await record_history(
            session_id,
            text_input,
            response,
            ttl_config=ttl_config,
            intent_slug=response_intent_slug,
        )
        background_tasks.add_task(
            persist_webhook_history,
            WebhookHistoryPayload(
                account_id=str(account_id),
                inbox_id=external_inbox_id,
                channel_type=channel_type,
                user_text=text_input,
                response=response,
                trace_id=trace_id,
                source_message_id=source_message_id or None,
                contact_id=str(delivery_context.contact_id or "") or None,
                contact_name=contact_name or None,
                contact_phone=contact_phone or None,
                classification_band=processor_result.classification.band,
                classification_strategy=processor_result.classification.strategy,
            ),
        )
        route_outcome = "intent_response"
        response_status = status.HTTP_200_OK
        return JSONResponse(response, status_code=status.HTTP_200_OK)
    except HTTPException as exc:
        response_status = exc.status_code
        if route_outcome == "unhandled":
            route_outcome = "http_exception"
        raise
    finally:
        try:
            observe_webhook_result(
                outcome=route_outcome,
                status_code=response_status,
                duration_seconds=time.perf_counter() - started_at,
                dedup_kind=dedup_kind,
            )
        finally:
            await guards.close()


def sanitize_user_text(text: str) -> str:
    sanitized = " ".join((text or "").split()).strip()[:4096]
    if any(marker in sanitized.lower() for marker in ("<script", "javascript:", "vbscript:", "data:text/html", "onload=", "onerror=")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid message content")
    return sanitized


def build_flow_payload(payload: dict[str, Any], text_input: str) -> dict[str, Any]:
    context = payload.get("context") or {}
    message = context.get("message") or {}
    content_attributes = message.get("content_attributes") or {}
    metadata = dict(payload.get("metadata") or {})
    return {
        "session_id": resolve_session_id(payload),
        "text": text_input,
        "channel_type": payload.get("channel_type"),
        "metadata": metadata,
        "content_attributes": content_attributes,
        "message": {
            "content": text_input,
            "content_attributes": content_attributes,
        },
    }


def resolve_session_id(payload: dict[str, Any]) -> str:
    context = payload.get("context") or {}
    if payload.get("session_id"):
        return str(payload["session_id"])
    phone = (context.get("contact") or {}).get("phone_number")
    if phone:
        return str(phone)
    return "unknown-session"


def _extract_text_input(payload: dict[str, Any]) -> str:
    raw_message = payload.get("message")
    if isinstance(raw_message, str):
        return raw_message
    if isinstance(raw_message, dict) and isinstance(raw_message.get("content"), str):
        return raw_message["content"]
    return str((payload.get("context") or {}).get("message", {}).get("content") or "")


def _nested_get(obj: dict[str, Any], *path: str) -> Any:
    current: Any = obj
    for part in path:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


async def resolve_inbox(external_inbox_id: str, account_id: int) -> ChatwitInbox | None:
    if not external_inbox_id:
        return None

    async with session_ctx() as db:
        rows = (
            await db.execute(
                select(ChatwitInbox)
                .options(selectinload(ChatwitInbox.usuario_chatwit))
                .where(ChatwitInbox.inbox_id == external_inbox_id)
            )
        ).scalars().all()

    if account_id:
        for row in rows:
            user = row.usuario_chatwit
            if user and str(user.chatwit_account_id) == str(account_id):
                return row
    return rows[0] if rows else None


def build_agent_supplement(
    history: list[ConversationMessage],
    interactive_context: InteractiveMessageContext | None,
) -> str | None:
    parts: list[str] = []
    if interactive_context:
        parts.append(f"Ultima mensagem interativa enviada: {interactive_context.body_text}")
        if interactive_context.buttons:
            buttons = " | ".join(
                f"{button.title} => {button.payload}"
                for button in interactive_context.buttons
                if button.title and button.payload
            )
            if buttons:
                parts.append(f"Botoes recentes: {buttons}")
    if history:
        history_lines = "\n".join(f"{item.role}: {item.content}" for item in history[-8:])
        parts.append(f"Historico recente:\n{history_lines}")
    return "\n\n".join(parts) if parts else None


def extract_response_text(response: dict[str, Any]) -> str:
    if response.get("text"):
        return str(response["text"])

    whatsapp = response.get("whatsapp") or {}
    if isinstance(whatsapp, dict):
        interactive = whatsapp.get("interactive") or {}
        if isinstance(interactive, dict):
            body = interactive.get("body") or {}
            if isinstance(body, dict) and body.get("text"):
                return str(body["text"])
        text_block = whatsapp.get("text") or {}
        if isinstance(text_block, dict) and text_block.get("body"):
            return str(text_block["body"])

    for channel in ("instagram", "facebook"):
        block = response.get(channel) or {}
        if isinstance(block, dict):
            if block.get("text"):
                return str(block["text"])
            message = block.get("message") or {}
            if isinstance(message, dict) and message.get("text"):
                return str(message["text"])
    if response.get("action") == "handoff":
        return "handoff"
    return ""


def extract_interactive_context(
    response: dict[str, Any],
    *,
    intent_slug: str | None,
) -> InteractiveMessageContext | None:
    whatsapp = response.get("whatsapp") or {}
    if isinstance(whatsapp, dict) and isinstance(whatsapp.get("interactive"), dict):
        interactive = whatsapp["interactive"]
        body_text = str((interactive.get("body") or {}).get("text") or "")
        buttons = []
        for button in (interactive.get("action") or {}).get("buttons") or []:
            reply = button.get("reply") or {}
            title = str(reply.get("title") or "").strip()
            payload = str(reply.get("id") or "").strip()
            if title and payload:
                buttons.append(InteractiveButtonContext(title=title, payload=payload))
        if buttons or interactive.get("type") == "cta_url":
            return InteractiveMessageContext(
                body_text=body_text,
                intent_slug=intent_slug,
                timestamp=int(time.time() * 1000),
                buttons=buttons,
            )

    for channel in ("instagram", "facebook"):
        block = response.get(channel) or {}
        quick_replies = block.get("quick_replies") if isinstance(block, dict) else None
        if isinstance(quick_replies, list):
            buttons = []
            for item in quick_replies:
                title = str(item.get("title") or "").strip()
                payload = str(item.get("payload") or "").strip()
                if title and payload:
                    buttons.append(InteractiveButtonContext(title=title, payload=payload))
            if buttons:
                return InteractiveMessageContext(
                    body_text=str(block.get("text") or ""),
                    intent_slug=intent_slug,
                    timestamp=int(time.time() * 1000),
                    buttons=buttons,
                )
    return None


async def record_history(
    session_id: str,
    user_text: str,
    response: dict[str, Any],
    *,
    ttl_config: SessionTtlConfig | None = None,
    intent_slug: str | None = None,
    store_interactive: bool = True,
) -> None:
    if user_text:
        await append_to_history(
            session_id,
            ConversationMessage(role="user", content=user_text, timestamp=int(time.time() * 1000)),
            ttl_config=ttl_config,
        )

    response_text = extract_response_text(response)
    if response_text:
        await append_to_history(
            session_id,
            ConversationMessage(role="assistant", content=response_text, timestamp=int(time.time() * 1000)),
            ttl_config=ttl_config,
        )

    if store_interactive:
        interactive_context = extract_interactive_context(response, intent_slug=intent_slug)
        if interactive_context:
            await store_interactive_message_context(session_id, interactive_context, ttl_config=ttl_config)


async def _mark_message_if_new(key: str, value: str, ttl_seconds: int) -> bool:
    try:
        from redis.asyncio import Redis

        redis = Redis.from_url(str(settings.redis_url), decode_responses=True)
        try:
            is_new = await redis.set(key, value, ex=ttl_seconds, nx=True)
        finally:
            await redis.aclose()
        return bool(is_new)
    except Exception as exc:
        logger.warning("socialwiseflow_dedup_failed", key=key, error=str(exc))
        return True
