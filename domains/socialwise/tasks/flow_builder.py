"""TaskIQ worker for Socialwise Flow Builder queue jobs.

Port of worker/WebhookWorkerTasks/flow-builder-queues.task.ts.

Processes 6 job types: CHATWIT_ACTION, HTTP_REQUEST, TAG_ACTION,
WEBHOOK_NOTIFY, DELAY, MEDIA_UPLOAD.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, update

from domains.socialwise.db.models.flow_session import FlowSession
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.delivery_service import (
    ChatwitDeliveryService,
    DeliveryContext,
    DeliveryPayload,
    DeliveryResult,
)
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# MIME extension mapping
# ---------------------------------------------------------------------------

MIME_MAP: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_delivery_context(ctx_dict: dict[str, Any]) -> DeliveryContext:
    """Build DeliveryContext from a serialized dict."""
    return DeliveryContext(
        account_id=ctx_dict.get("accountId", 0),
        conversation_id=ctx_dict.get("conversationId", 0),
        conversation_display_id=ctx_dict.get("conversationDisplayId"),
        inbox_id=ctx_dict.get("inboxId", 0),
        contact_id=ctx_dict.get("contactId", 0),
        contact_name=ctx_dict.get("contactName", ""),
        contact_phone=ctx_dict.get("contactPhone", ""),
        channel_type=ctx_dict.get("channelType", "whatsapp"),
        prisma_inbox_id=ctx_dict.get("prismaInboxId"),
        chatwit_access_token=ctx_dict.get("chatwitAccessToken", ""),
        chatwit_base_url=ctx_dict.get("chatwitBaseUrl", ""),
        is_playground=ctx_dict.get("isPlayground", False),
        playground_execution_id=ctx_dict.get("playgroundExecutionId"),
    )


async def _update_session_variable(session_id: str, variable_name: str, value: Any) -> None:
    """Update a variable in a flow session."""
    async with session_ctx() as session:
        stmt = select(FlowSession).where(FlowSession.id == session_id)
        result = await session.execute(stmt)
        flow_session = result.scalar_one_or_none()
        if not flow_session:
            logger.warning("flow_builder_session_not_found", session_id=session_id, variable_name=variable_name)
            return

        current_vars = dict(flow_session.variables or {})
        current_vars[variable_name] = value
        await session.execute(
            update(FlowSession)
            .where(FlowSession.id == session_id)
            .values(variables=current_vars),
        )
        await session.commit()


# ---------------------------------------------------------------------------
# Job handlers
# ---------------------------------------------------------------------------

async def _handle_chatwit_action(job_data: dict[str, Any]) -> dict[str, Any]:
    ctx_dict = job_data["context"]
    payload_dict = job_data["payload"]
    ctx = _build_delivery_context(ctx_dict)

    delivery = ChatwitDeliveryService(ctx.chatwit_base_url, ctx.chatwit_access_token)
    payload = DeliveryPayload(
        type=payload_dict.get("type", "chatwit_action"),
        action_type=payload_dict.get("actionType"),
        assignee_id=payload_dict.get("assigneeId"),
        labels=payload_dict.get("labels"),
        contact_id=payload_dict.get("contactId"),
        contact_fields=payload_dict.get("contactFields"),
    )

    result = await delivery.deliver(ctx, payload)
    if not result.success:
        raise RuntimeError(f"ChatwitAction failed: {result.error}")

    return {
        "success": True,
        "jobType": "CHATWIT_ACTION",
        "actionType": payload.action_type,
        "conversationId": ctx.conversation_id,
    }


async def _handle_http_request(job_data: dict[str, Any]) -> dict[str, Any]:
    payload = job_data["payload"]
    url = payload["url"]
    method = payload.get("method", "GET")
    headers = payload.get("headers", {})
    body = payload.get("body")
    timeout_ms = payload.get("timeoutMs", 10000)
    response_variable = payload.get("responseVariable")
    session_id = job_data.get("sessionId")

    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        request_headers = {
            "Content-Type": "application/json",
            "User-Agent": "Chatwit-FlowBuilder/1.0",
            **headers,
        }
        resp = await client.request(
            method, url,
            headers=request_headers,
            content=body if body else None,
        )

        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            response_data = resp.json()
        else:
            response_data = resp.text

        # Save response to session variable
        if response_variable and session_id:
            await _update_session_variable(session_id, response_variable, {
                "status": resp.status_code,
                "statusText": resp.reason_phrase,
                "data": response_data,
            })

        resp.raise_for_status()

    return {
        "success": True,
        "jobType": "HTTP_REQUEST",
        "status": resp.status_code,
        "responseVariable": response_variable,
    }


async def _handle_tag_action(job_data: dict[str, Any]) -> dict[str, Any]:
    ctx_dict = job_data["context"]
    payload = job_data["payload"]
    action = payload["action"]
    tag_name = payload["tagName"]

    base_url = ctx_dict.get("chatwitBaseUrl", "").rstrip("/")
    token = ctx_dict.get("chatwitAccessToken", "")
    account_id = ctx_dict.get("accountId", 0)
    conversation_id = ctx_dict.get("conversationId", 0)
    headers = {"api_access_token": token, "Content-Type": "application/json"}

    labels_url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/labels"

    async with httpx.AsyncClient(timeout=10.0) as client:
        if action == "add":
            resp = await client.post(labels_url, json={"labels": [tag_name]}, headers=headers)
            resp.raise_for_status()
        elif action == "remove":
            get_resp = await client.get(labels_url, headers=headers)
            get_resp.raise_for_status()
            current_labels = get_resp.json().get("payload", [])
            updated_labels = [l for l in current_labels if l != tag_name]
            resp = await client.post(labels_url, json={"labels": updated_labels}, headers=headers)
            resp.raise_for_status()

    return {"success": True, "jobType": "TAG_ACTION", "action": action, "tagName": tag_name}


async def _handle_webhook_notify(job_data: dict[str, Any]) -> dict[str, Any]:
    payload = job_data["payload"]
    ctx_dict = job_data.get("context", {})
    url = payload["url"]
    method = payload.get("method", "POST")
    headers = payload.get("headers", {})
    body = payload.get("body", {})

    flow_id = job_data.get("flowId", "")
    session_id = job_data.get("sessionId", "")
    node_id = job_data.get("nodeId", "")

    webhook_body = {
        **body,
        "_flowContext": {
            "flowId": flow_id,
            "sessionId": session_id,
            "nodeId": node_id,
            "conversationId": ctx_dict.get("conversationId"),
            "accountId": ctx_dict.get("accountId"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }

    request_headers = {
        "Content-Type": "application/json",
        "User-Agent": "Chatwit-FlowBuilder-Webhook/1.0",
        "X-Flow-Id": flow_id,
        "X-Session-Id": session_id,
        **headers,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request(
            method, url,
            headers=request_headers,
            json=webhook_body if method != "GET" else None,
        )

        if resp.status_code >= 500:
            raise RuntimeError(f"Webhook server error: {resp.status_code}")

    return {"success": True, "jobType": "WEBHOOK_NOTIFY", "status": resp.status_code, "url": url}


async def _handle_delay(job_data: dict[str, Any]) -> dict[str, Any]:
    payload = job_data["payload"]
    session_id = job_data.get("sessionId", "")
    flow_id = job_data.get("flowId", "")
    resume_node_id = payload.get("resumeNodeId", "")

    async with session_ctx() as session:
        stmt = select(FlowSession).where(FlowSession.id == session_id)
        result = await session.execute(stmt)
        flow_session = result.scalar_one_or_none()

        if not flow_session:
            return {"success": False, "jobType": "DELAY", "error": "Session not found"}

        if flow_session.status not in ("ACTIVE", "WAITING_INPUT"):
            return {
                "success": True,
                "jobType": "DELAY",
                "skipped": True,
                "reason": "session_not_active",
            }

        await session.execute(
            update(FlowSession)
            .where(FlowSession.id == session_id)
            .values(current_node_id=resume_node_id, updated_at=datetime.now(timezone.utc)),
        )
        await session.commit()

    return {"success": True, "jobType": "DELAY", "resumeNodeId": resume_node_id}


async def _handle_media_upload(job_data: dict[str, Any]) -> dict[str, Any]:
    ctx_dict = job_data["context"]
    payload = job_data["payload"]
    media_url = payload["mediaUrl"]
    filename = payload.get("filename")
    caption = payload.get("caption")

    # Determine filename from content-type if not provided
    if not filename:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.head(media_url)
            content_type = resp.headers.get("content-type", "application/octet-stream")
            ext = MIME_MAP.get(content_type, "bin")
            filename = f"media_{int(time.time())}.{ext}"

    ctx = _build_delivery_context(ctx_dict)
    delivery = ChatwitDeliveryService(ctx.chatwit_base_url, ctx.chatwit_access_token)
    result = await delivery.deliver(ctx, DeliveryPayload(
        type="media",
        media_url=media_url,
        filename=filename,
        content=caption,
    ))

    if not result.success:
        raise RuntimeError(result.error or "Media upload failed")

    return {
        "success": True,
        "jobType": "MEDIA_UPLOAD",
        "mediaType": payload.get("mediaType"),
        "filename": filename,
    }


# ---------------------------------------------------------------------------
# Main task processor
# ---------------------------------------------------------------------------

_HANDLERS: dict[str, Any] = {
    "CHATWIT_ACTION": _handle_chatwit_action,
    "HTTP_REQUEST": _handle_http_request,
    "TAG_ACTION": _handle_tag_action,
    "WEBHOOK_NOTIFY": _handle_webhook_notify,
    "DELAY": _handle_delay,
    "MEDIA_UPLOAD": _handle_media_upload,
}


@broker.task(retry_on_error=True, max_retries=3)
async def process_flow_builder_task(job_data: dict[str, Any]) -> dict[str, Any]:
    """Main FlowBuilder queue processor. Routes to the appropriate handler."""
    start = time.monotonic()
    job_type = job_data.get("jobType", "UNKNOWN")
    flow_id = job_data.get("flowId", "")
    session_id = job_data.get("sessionId", "")
    node_id = job_data.get("nodeId", "")

    logger.info(
        "flow_builder_processing",
        job_type=job_type,
        flow_id=flow_id,
        session_id=session_id,
        node_id=node_id,
    )

    handler = _HANDLERS.get(job_type)
    if not handler:
        raise ValueError(f"Unknown job type: {job_type}")

    try:
        result = await handler(job_data)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "flow_builder_completed",
            job_type=job_type,
            flow_id=flow_id,
            processing_time_ms=elapsed_ms,
            success=result.get("success", True),
        )
        result["processingTimeMs"] = elapsed_ms
        result["flowId"] = flow_id
        result["sessionId"] = session_id
        result["nodeId"] = node_id
        return result
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "flow_builder_error",
            job_type=job_type,
            flow_id=flow_id,
            error=str(exc),
            processing_time_ms=elapsed_ms,
        )
        raise
