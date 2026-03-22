"""Flow orchestrator for Socialwise webhook and campaign execution."""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.flow import Flow, FlowEdge
from domains.socialwise.db.models.flow_session import FlowSession, FlowSessionStatus
from domains.socialwise.db.models.mapeamento_botao import MapeamentoBotao
from domains.socialwise.db.models.mapeamento_intencao import MapeamentoIntencao
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.chatwit_config import get_chatwit_system_config
from domains.socialwise.services.flow.delivery_service import DeliveryContext
from domains.socialwise.services.flow.executor import FLOW_PAYMENT_PREFIX, FlowExecutor
from domains.socialwise.services.flow.mtf_loader import load_mtf_variables_for_inbox
from domains.socialwise.services.flow.runtime import (
    FlowSessionData,
    RuntimeFlow,
    RuntimeFlowEdge,
    RuntimeFlowNode,
)
from domains.socialwise.services.flow.sync_bridge import SyncBridge
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class OrchestratorResult:
    sync_response: dict[str, Any] | None
    waiting_input: bool
    handled: bool = False
    error: str | None = None
    session_id: str | None = None


class FlowOrchestrator:
    async def execute_flow_by_id(
        self,
        flow_id: str,
        delivery_context: DeliveryContext,
        *,
        force_async: bool = False,
        initial_variables: dict[str, Any] | None = None,
    ) -> OrchestratorResult:
        bridge = SyncBridge(force_async=force_async)
        flow = await self.load_flow(flow_id)
        if not flow:
            return OrchestratorResult(
                sync_response=None,
                waiting_input=False,
                handled=False,
                error=f"Flow {flow_id} não encontrado ou inativo",
            )
        return await self.execute_new_flow(flow, delivery_context, bridge, initial_variables=initial_variables)

    async def handle(self, payload: dict[str, Any], delivery_context: DeliveryContext) -> OrchestratorResult:
        bridge = SyncBridge()
        button_id = self.extract_button_id(payload)
        message_text = self.extract_message_text(payload)

        if button_id:
            session_by_edge = await self.find_session_by_button_id(button_id, str(delivery_context.contact_id))
            if session_by_edge:
                return await self.resume_session(session_by_edge, button_id, delivery_context, bridge)

            session = await self.find_active_session(delivery_context)
            if session and session.current_node_id:
                expected_skip_button_id = f"flow_skip_{session.current_node_id}"
                if session.variables.get("_waitType") == "free_text" and button_id == expected_skip_button_id:
                    return await self.resume_session(session, button_id, delivery_context, bridge)

                async with session_ctx() as db:
                    edge = (
                        await db.execute(
                            select(FlowEdge.id).where(
                                FlowEdge.flow_id == session.flow_id,
                                FlowEdge.source_node_id == session.current_node_id,
                                FlowEdge.button_id == button_id,
                            )
                        )
                    ).scalar_one_or_none()
                if edge:
                    return await self.resume_session(session, button_id, delivery_context, bridge)

        if not button_id and message_text:
            matched_button_id = await self.try_template_text_match(message_text, delivery_context)
            if matched_button_id:
                session_by_edge = await self.find_session_by_button_id(matched_button_id, str(delivery_context.contact_id))
                if session_by_edge:
                    return await self.resume_session(session_by_edge, matched_button_id, delivery_context, bridge)

        if not button_id and message_text:
            session = await self.find_active_session(delivery_context)
            if session and session.variables.get("_waitType") == "free_text":
                return await self.resume_free_text_session(session, message_text, delivery_context, bridge)

        flow_id = await self.find_flow_for_message(payload, delivery_context)
        if not flow_id:
            return OrchestratorResult(sync_response=None, waiting_input=False, handled=False)

        flow = await self.load_flow(flow_id)
        if not flow:
            return OrchestratorResult(
                sync_response=None,
                waiting_input=False,
                handled=False,
                error=f"Flow {flow_id} não encontrado ou inativo",
            )
        return await self.execute_new_flow(flow, delivery_context, bridge)

    async def execute_new_flow(
        self,
        flow: RuntimeFlow,
        ctx: DeliveryContext,
        bridge: SyncBridge,
        *,
        initial_variables: dict[str, Any] | None = None,
    ) -> OrchestratorResult:
        ctx = await self.ensure_delivery_context(ctx)
        mtf_vars: dict[str, Any] = {}
        if ctx.prisma_inbox_id:
            mtf_vars = await load_mtf_variables_for_inbox(ctx.prisma_inbox_id)

        merged_variables: dict[str, Any] = {
            **mtf_vars,
            "nome_lead": ctx.contact_name or "",
            **(initial_variables or {}),
            "_deliveryMeta": {
                "accountId": ctx.account_id,
                "conversationDisplayId": ctx.conversation_display_id,
                "inboxId": ctx.inbox_id,
                "prismaInboxId": ctx.prisma_inbox_id,
                "contactName": ctx.contact_name,
                "contactPhone": ctx.contact_phone,
                "channelType": ctx.channel_type,
            },
        }

        async with session_ctx() as db:
            flow_session = FlowSession(
                flow_id=flow.id,
                conversation_id=str(ctx.conversation_id),
                contact_id=str(ctx.contact_id),
                inbox_id=ctx.prisma_inbox_id or str(ctx.inbox_id),
                status=FlowSessionStatus.ACTIVE,
                current_node_id=None,
                variables={},
                execution_log=[],
            )
            db.add(flow_session)
            await db.commit()
            await db.refresh(flow_session)

        executor = FlowExecutor(ctx, merged_variables)
        result = await executor.execute(flow, bridge)
        await self.persist_session_result(flow_session.id, result)

        return OrchestratorResult(
            sync_response=bridge.consume_sync_payload(),
            waiting_input=result.status == "WAITING_INPUT",
            handled=True,
            error="Erro na execução do flow" if result.status == "ERROR" else None,
            session_id=flow_session.id,
        )

    async def resume_session(
        self,
        session: FlowSessionData,
        button_id: str,
        ctx: DeliveryContext,
        bridge: SyncBridge,
    ) -> OrchestratorResult:
        ctx = await self.ensure_delivery_context(ctx)
        flow = await self.load_flow(session.flow_id)
        if not flow:
            return OrchestratorResult(
                sync_response=None,
                waiting_input=False,
                handled=False,
                error=f"Flow {session.flow_id} não encontrado ou inativo",
                session_id=session.id,
            )

        if str(ctx.conversation_id or 0) not in {"", "0"} and session.conversation_id != str(ctx.conversation_id):
            async with session_ctx() as db:
                db_session = await db.get(FlowSession, session.id)
                if db_session:
                    db_session.conversation_id = str(ctx.conversation_id)
                    await db.commit()
            session.conversation_id = str(ctx.conversation_id)

        executor = FlowExecutor(ctx, session.variables)
        result = await executor.resume_from_button(flow, session, button_id, bridge)
        await self.persist_session_result(session.id, result)

        return OrchestratorResult(
            sync_response=bridge.consume_sync_payload(),
            waiting_input=result.status == "WAITING_INPUT",
            handled=True,
            error="Erro ao retomar flow" if result.status == "ERROR" else None,
            session_id=session.id,
        )

    async def resume_free_text_session(
        self,
        session: FlowSessionData,
        user_text: str,
        ctx: DeliveryContext,
        bridge: SyncBridge,
    ) -> OrchestratorResult:
        ctx = await self.ensure_delivery_context(ctx)
        flow = await self.load_flow(session.flow_id)
        if not flow:
            return OrchestratorResult(
                sync_response=None,
                waiting_input=False,
                handled=False,
                error=f"Flow {session.flow_id} não encontrado ou inativo",
                session_id=session.id,
            )

        executor = FlowExecutor(ctx, session.variables)
        result = await executor.resume_from_free_text(flow, session, user_text, bridge)
        await self.persist_session_result(session.id, result)

        return OrchestratorResult(
            sync_response=bridge.consume_sync_payload(),
            waiting_input=result.status == "WAITING_INPUT",
            handled=True,
            error="Erro ao retomar flow (free-text)" if result.status == "ERROR" else None,
            session_id=session.id,
        )

    async def resume_from_payment(
        self,
        conversation_id: str,
        order_nsu: str,
        trace_id: str | None = None,
    ) -> OrchestratorResult:
        async with session_ctx() as db:
            row = (
                await db.execute(
                    select(FlowSession)
                    .where(
                        FlowSession.conversation_id == str(conversation_id),
                        FlowSession.status == FlowSessionStatus.WAITING_INPUT,
                    )
                    .order_by(FlowSession.updated_at.desc())
                )
            ).scalars().first()

        if not row:
            return OrchestratorResult(sync_response=None, waiting_input=False, handled=False)

        session = self.flow_session_to_data(row)
        vars_dict = dict(session.variables or {})
        anchors_map = vars_dict.get("_payment_anchors") or {}
        specific_button_id = anchors_map.get(order_nsu) if isinstance(anchors_map, dict) else None

        async with session_ctx() as db:
            if specific_button_id:
                anchor_edge = (
                    await db.execute(
                        select(FlowEdge).where(
                            FlowEdge.flow_id == session.flow_id,
                            FlowEdge.button_id == specific_button_id,
                        )
                    )
                ).scalars().first()
            else:
                anchor_edge = (
                    await db.execute(
                        select(FlowEdge).where(
                            FlowEdge.flow_id == session.flow_id,
                            FlowEdge.button_id.startswith(FLOW_PAYMENT_PREFIX),
                        )
                    )
                ).scalars().first()

        updated_vars = {
            **vars_dict,
            "_payment_confirmed": True,
            "_payment_confirmed_at": self._now_iso(),
            "_payment_nsu": order_nsu,
        }

        if not anchor_edge or not anchor_edge.button_id:
            async with session_ctx() as db:
                db_session = await db.get(FlowSession, session.id)
                if db_session:
                    db_session.status = FlowSessionStatus.COMPLETED
                    db_session.completed_at = datetime.now(timezone.utc)
                    db_session.variables = updated_vars
                    await db.commit()
            return OrchestratorResult(sync_response=None, waiting_input=False, handled=True, session_id=session.id)

        async with session_ctx() as db:
            db_session = await db.get(FlowSession, session.id)
            if db_session:
                db_session.variables = updated_vars
                await db.commit()

        meta = updated_vars.get("_deliveryMeta") or {}
        sys_config = await get_chatwit_system_config()
        delivery_context = DeliveryContext(
            account_id=int(meta.get("accountId") or 0),
            conversation_id=int(conversation_id or 0),
            conversation_display_id=int(meta.get("conversationDisplayId") or 0) or None,
            inbox_id=int(meta.get("inboxId") or 0),
            contact_id=int(session.contact_id or 0),
            contact_name=str(meta.get("contactName") or ""),
            contact_phone=str(meta.get("contactPhone") or ""),
            channel_type=str(meta.get("channelType") or "whatsapp"),
            prisma_inbox_id=str(meta.get("prismaInboxId") or session.inbox_id),
            chatwit_access_token=sys_config.bot_token,
            chatwit_base_url=sys_config.base_url,
        )

        session.variables = updated_vars
        bridge = SyncBridge(force_async=True)
        logger.info(
            "flow_resume_from_payment",
            session_id=session.id,
            conversation_id=conversation_id,
            anchor_button_id=anchor_edge.button_id,
            trace_id=trace_id,
        )
        return await self.resume_session(session, anchor_edge.button_id, delivery_context, bridge)

    async def persist_session_result(self, session_id: str, result: Any) -> None:
        async with session_ctx() as db:
            db_session = await db.get(FlowSession, session_id)
            if not db_session:
                return
            db_session.status = FlowSessionStatus(result.status)
            db_session.current_node_id = result.current_node_id
            db_session.variables = result.variables
            db_session.execution_log = [asdict(item) for item in result.execution_log]
            if result.status == "COMPLETED":
                db_session.completed_at = datetime.now(timezone.utc)
            await db.commit()

    async def find_session_by_button_id(self, button_id: str, contact_id: str) -> FlowSessionData | None:
        async with session_ctx() as db:
            edge = (
                await db.execute(
                    select(FlowEdge).where(FlowEdge.button_id == button_id)
                )
            ).scalars().first()
            if not edge:
                return None

            session = (
                await db.execute(
                    select(FlowSession)
                    .where(
                        FlowSession.flow_id == edge.flow_id,
                        FlowSession.current_node_id == edge.source_node_id,
                        FlowSession.status == FlowSessionStatus.WAITING_INPUT,
                        FlowSession.contact_id == contact_id,
                    )
                    .order_by(FlowSession.updated_at.desc())
                )
            ).scalars().first()
            return self.flow_session_to_data(session) if session else None

    async def find_active_session(self, ctx: DeliveryContext) -> FlowSessionData | None:
        inbox_id = ctx.prisma_inbox_id or str(ctx.inbox_id)
        async with session_ctx() as db:
            session = None
            if str(ctx.conversation_id or 0) not in {"", "0"}:
                session = (
                    await db.execute(
                        select(FlowSession)
                        .where(
                            FlowSession.conversation_id == str(ctx.conversation_id),
                            FlowSession.inbox_id == inbox_id,
                            FlowSession.status == FlowSessionStatus.WAITING_INPUT,
                        )
                        .order_by(FlowSession.updated_at.desc())
                    )
                ).scalars().first()

            if not session and ctx.contact_id:
                session = (
                    await db.execute(
                        select(FlowSession)
                        .where(
                            FlowSession.contact_id == str(ctx.contact_id),
                            FlowSession.inbox_id == inbox_id,
                            FlowSession.status == FlowSessionStatus.WAITING_INPUT,
                        )
                        .order_by(FlowSession.updated_at.desc())
                    )
                ).scalars().first()
                if session and str(ctx.conversation_id or 0) not in {"", "0"}:
                    session.conversation_id = str(ctx.conversation_id)
                    await db.commit()

        return self.flow_session_to_data(session) if session else None

    async def load_flow(self, flow_id: str) -> RuntimeFlow | None:
        async with session_ctx() as db:
            flow = (
                await db.execute(
                    select(Flow)
                    .where(Flow.id == flow_id)
                    .options(selectinload(Flow.nodes), selectinload(Flow.edges))
                )
            ).scalars().first()

        if not flow or not flow.is_active:
            return None

        return RuntimeFlow(
            id=flow.id,
            name=flow.name,
            inbox_id=flow.inbox_id,
            nodes=[
                RuntimeFlowNode(id=node.id, node_type=node.node_type, config=node.config or {})
                for node in flow.nodes
            ],
            edges=[
                RuntimeFlowEdge(
                    id=edge.id,
                    source_node_id=edge.source_node_id,
                    target_node_id=edge.target_node_id,
                    button_id=edge.button_id,
                    condition_branch=edge.condition_branch,
                )
                for edge in flow.edges
            ],
        )

    async def ensure_delivery_context(self, ctx: DeliveryContext) -> DeliveryContext:
        if ctx.chatwit_access_token and ctx.chatwit_base_url:
            return ctx

        sys_config = await get_chatwit_system_config()
        return replace(
            ctx,
            chatwit_access_token=ctx.chatwit_access_token or sys_config.bot_token,
            chatwit_base_url=ctx.chatwit_base_url or sys_config.base_url,
        )

    async def find_flow_for_message(self, payload: dict[str, Any], ctx: DeliveryContext) -> str | None:
        button_id = self.extract_button_id(payload)
        async with session_ctx() as db:
            if button_id:
                mapping = (
                    await db.execute(select(MapeamentoBotao).where(MapeamentoBotao.button_id == button_id))
                ).scalars().first()
                if mapping and mapping.action_type == "START_FLOW":
                    action_payload = mapping.action_payload or {}
                    if isinstance(action_payload, dict) and action_payload.get("flowId"):
                        return str(action_payload["flowId"])

            intent_name = str(payload.get("intent_name") or payload.get("detected_intent") or "").strip()
            if intent_name and ctx.prisma_inbox_id:
                mapping = (
                    await db.execute(
                        select(MapeamentoIntencao)
                        .where(
                            MapeamentoIntencao.intent_name == intent_name,
                            MapeamentoIntencao.inbox_id == ctx.prisma_inbox_id,
                            MapeamentoIntencao.flow_id.is_not(None),
                        )
                    )
                ).scalars().first()
                if mapping and mapping.flow_id:
                    return mapping.flow_id
        return None

    def extract_button_id(self, payload: dict[str, Any]) -> str | None:
        content_attributes = payload.get("content_attributes") or {}
        if isinstance(content_attributes.get("button_reply"), dict) and content_attributes["button_reply"].get("id"):
            return str(content_attributes["button_reply"]["id"])
        if isinstance(content_attributes.get("list_reply"), dict) and content_attributes["list_reply"].get("id"):
            return str(content_attributes["list_reply"]["id"])

        message = payload.get("message") or {}
        message_attrs = message.get("content_attributes") or {}
        if isinstance(message_attrs.get("button_reply"), dict) and message_attrs["button_reply"].get("id"):
            return str(message_attrs["button_reply"]["id"])
        if isinstance(message_attrs.get("list_reply"), dict) and message_attrs["list_reply"].get("id"):
            return str(message_attrs["list_reply"]["id"])

        metadata = payload.get("metadata") or {}
        for key in ("button_id", "postback_payload", "quick_reply_payload"):
            value = metadata.get(key) or message_attrs.get(key) or payload.get(key)
            if value:
                return str(value)
        return None

    def extract_message_text(self, payload: dict[str, Any]) -> str:
        message = payload.get("message")
        if isinstance(message, str):
            return message.strip()
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                return content.strip()
        text = payload.get("text")
        return str(text or "").strip()

    async def try_template_text_match(self, message_text: str, ctx: DeliveryContext) -> str | None:
        if not message_text:
            return None
        session = await self.find_active_session(ctx)
        if not session or not session.current_node_id:
            return None

        flow = await self.load_flow(session.flow_id)
        if not flow:
            return None

        current_node = next((node for node in flow.nodes if node.id == session.current_node_id), None)
        if not current_node or current_node.node_type not in {"TEMPLATE", "WHATSAPP_TEMPLATE"}:
            return None

        buttons = list(current_node.config.get("buttons") or [])
        quick_reply_buttons = [
            button for button in buttons if str(button.get("type") or "") == "QUICK_REPLY"
        ]
        normalized_message = message_text.strip().lower()
        matched_index = next(
            (
                index
                for index, button in enumerate(quick_reply_buttons)
                if str(button.get("text") or "").strip().lower() == normalized_message
            ),
            None,
        )
        if matched_index is None:
            return None

        template_edges = [
            edge
            for edge in flow.edges
            if edge.source_node_id == current_node.id and edge.button_id
        ]
        if matched_index >= len(template_edges):
            return None
        return template_edges[matched_index].button_id

    def flow_session_to_data(self, row: FlowSession | None) -> FlowSessionData | None:
        if not row:
            return None
        return FlowSessionData(
            id=row.id,
            flow_id=row.flow_id,
            conversation_id=row.conversation_id,
            contact_id=row.contact_id,
            inbox_id=row.inbox_id,
            status=self._enum_value(row.status),
            current_node_id=row.current_node_id,
            variables=row.variables or {},
            execution_log=row.execution_log or [],
            created_at=row.created_at,
            updated_at=row.updated_at,
            completed_at=row.completed_at,
        )

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _enum_value(value: Any) -> str:
        if isinstance(value, Enum):
            return str(value.value)
        return str(value)
