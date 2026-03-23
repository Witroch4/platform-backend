"""Runtime executor for Socialwise flows."""

from __future__ import annotations

import asyncio
import random
import re
import time
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.interactive_content import InteractiveContent
from domains.socialwise.db.models.template import Template
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.delivery_service import (
    DeliveryContext,
    DeliveryPayload,
    create_delivery_service,
)
from domains.socialwise.services.flow.payment_links import (
    PaymentCustomer,
    PaymentLinkRequest,
    generate_payment_link,
)
from domains.socialwise.services.flow.runtime import (
    ExecuteResult,
    ExecutionLogEntry,
    FlowSessionData,
    RuntimeFlow,
    RuntimeFlowNode,
)
from domains.socialwise.services.flow.sync_bridge import SyncBridge
from domains.socialwise.services.flow.variable_resolver import VariableResolver
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

FLOW_PAYMENT_PREFIX = "flow_payment_"
MIN_PAYMENT_AMOUNT_CENTS = 100


class FlowExecutor:
    def __init__(self, context: DeliveryContext, session_variables: dict[str, Any] | None = None) -> None:
        self.context = context
        self.resolver = VariableResolver(context, session_variables or {})
        self.delivery = create_delivery_service(context)
        self.execution_log: list[ExecutionLogEntry] = []

    async def execute(self, flow: RuntimeFlow, bridge: SyncBridge) -> ExecuteResult:
        start_node = next((node for node in flow.nodes if node.node_type == "START"), None)
        if not start_node:
            return ExecuteResult(
                status="ERROR",
                variables=self.resolver.get_session_variables(),
                execution_log=self.execution_log,
            )
        return await self.execute_chain(flow, start_node, bridge)

    async def resume_from_button(
        self,
        flow: RuntimeFlow,
        session: FlowSessionData,
        button_id: str,
        bridge: SyncBridge,
    ) -> ExecuteResult:
        if not session.current_node_id:
            return ExecuteResult(
                status="ERROR",
                variables=session.variables,
                execution_log=self.execution_log,
            )

        current_wait_type = str(session.variables.get("_waitType") or "")
        expected_skip_button_id = f"flow_skip_{session.current_node_id}"
        if current_wait_type == "free_text" and button_id == expected_skip_button_id:
            for key, value in session.variables.items():
                self.resolver.set_variable(key, value)
            return await self.skip_wait_for_reply(flow, session, bridge)

        edges = [
            edge
            for edge in flow.edges
            if edge.source_node_id == session.current_node_id and edge.button_id == button_id
        ]
        if not edges:
            edges = [edge for edge in flow.edges if edge.button_id == button_id]
        if not edges:
            return ExecuteResult(
                status="ERROR",
                current_node_id=session.current_node_id,
                variables=session.variables,
                execution_log=self.execution_log,
            )

        for key, value in session.variables.items():
            self.resolver.set_variable(key, value)

        target_nodes = [
            node
            for edge in edges
            for node in flow.nodes
            if node.id == edge.target_node_id
        ]
        reaction_branches = [node for node in target_nodes if node.node_type == "REACTION"]
        content_targets = [node for node in target_nodes if node.node_type != "REACTION"]
        reaction_continuations: list[RuntimeFlowNode] = []
        for reaction in reaction_branches:
            next_edge = next(
                (
                    edge
                    for edge in flow.edges
                    if edge.source_node_id == reaction.id and not edge.button_id and not edge.condition_branch
                ),
                None,
            )
            if next_edge:
                next_node = next((node for node in flow.nodes if node.id == next_edge.target_node_id), None)
                if next_node:
                    reaction_continuations.append(next_node)

        all_candidates = [*content_targets, *reaction_continuations]
        main_chain_node = all_candidates[0] if all_candidates else (target_nodes[0] if target_nodes else None)
        parallel_content = all_candidates[1:] if len(all_candidates) > 1 else []

        harvested = self.harvest_light_nodes(flow, main_chain_node)
        if self.context.source_message_id:
            bridge.set_context_message_id(self.context.source_message_id)

        for reaction in reaction_branches:
            await self.harvest_node(reaction, bridge)
            self.push_log(reaction, "sync", "ok", "reaction harvested")

        for light_node in harvested["light_nodes"]:
            await self.harvest_node(light_node, bridge)
            self.push_log(light_node, "sync", "ok", "harvested")

        for branch in parallel_content:
            await self.harvest_node(branch, bridge)
            self.push_log(branch, "sync", "ok", "parallel harvested")

        if bridge.can_sync() and (bridge.has_harvested_content() or bridge.has_pending_reaction()):
            combined_payload = bridge.build_combined_payload(self.context.channel_type)
            if combined_payload:
                bridge.set_sync_payload(combined_payload)

        barrier_node = harvested["barrier_node"]
        if barrier_node:
            bridge.close_sync_window()
            if barrier_node.node_type == "WAIT_FOR_REPLY":
                return await self.execute_chain(flow, barrier_node, bridge)
            await self.execute_chain(flow, barrier_node, bridge)
            last_harvested = harvested["light_nodes"][-1] if harvested["light_nodes"] else None
            if last_harvested and last_harvested.node_type in {"INTERACTIVE_MESSAGE", "WHATSAPP_TEMPLATE"}:
                return ExecuteResult(
                    status="WAITING_INPUT",
                    current_node_id=last_harvested.id,
                    variables=self.resolver.get_session_variables(),
                    execution_log=self.execution_log,
                )
            return ExecuteResult(
                status="COMPLETED",
                variables=self.resolver.get_session_variables(),
                execution_log=self.execution_log,
            )

        remaining_start_node = harvested["remaining_start_node"]
        if remaining_start_node:
            bridge.close_sync_window()
            return await self.execute_chain(flow, remaining_start_node, bridge)

        last_harvested = harvested["light_nodes"][-1] if harvested["light_nodes"] else None
        if last_harvested and last_harvested.node_type in {"INTERACTIVE_MESSAGE", "WHATSAPP_TEMPLATE"}:
            return ExecuteResult(
                status="WAITING_INPUT",
                current_node_id=last_harvested.id,
                variables=self.resolver.get_session_variables(),
                execution_log=self.execution_log,
            )

        return ExecuteResult(
            status="COMPLETED",
            variables=self.resolver.get_session_variables(),
            execution_log=self.execution_log,
        )

    async def resume_from_free_text(
        self,
        flow: RuntimeFlow,
        session: FlowSessionData,
        user_text: str,
        bridge: SyncBridge,
    ) -> ExecuteResult:
        if not session.current_node_id:
            return ExecuteResult(
                status="ERROR",
                variables=session.variables,
                execution_log=self.execution_log,
            )

        for key, value in session.variables.items():
            self.resolver.set_variable(key, value)

        variable_name = str(session.variables.get("_waitingVariable") or "user_reply")
        validation_regex = session.variables.get("_waitValidationRegex")
        validation_error = str(session.variables.get("_waitValidationError") or "Formato inválido. Tente novamente.")
        attempts = int(session.variables.get("_waitAttempts") or 0) + 1
        max_attempts = int(session.variables.get("_waitMaxAttempts") or 2)

        if validation_regex:
            try:
                if not re.search(str(validation_regex), user_text, flags=re.IGNORECASE):
                    if attempts >= max_attempts:
                        return await self.skip_wait_for_reply(flow, session, bridge)
                    self.resolver.set_variable("_waitAttempts", attempts)
                    await self.deliver(bridge, DeliveryPayload(type="text", content=validation_error))
                    return ExecuteResult(
                        status="WAITING_INPUT",
                        current_node_id=session.current_node_id,
                        variables=self.resolver.get_session_variables(),
                        execution_log=self.execution_log,
                    )
            except re.error:
                logger.warning("flow_wait_for_reply_invalid_regex", regex=str(validation_regex))

        self.resolver.set_variable(variable_name, user_text)
        for key in [
            "_waitType",
            "_waitingVariable",
            "_waitNodeId",
            "_waitAttempts",
            "_waitMaxAttempts",
            "_waitValidationRegex",
            "_waitValidationError",
        ]:
            self.resolver.set_variable(key, None)

        current_node = next((node for node in flow.nodes if node.id == session.current_node_id), None)
        next_node_id = self.find_next_node_id(flow, current_node) if current_node else "END"
        next_node = next((node for node in flow.nodes if node.id == next_node_id), None)
        if not next_node or next_node_id == "END":
            return ExecuteResult(
                status="COMPLETED",
                variables=self.resolver.get_session_variables(),
                execution_log=self.execution_log,
            )
        return await self.execute_chain(flow, next_node, bridge)

    async def execute_chain(
        self,
        flow: RuntimeFlow,
        start_node: RuntimeFlowNode,
        bridge: SyncBridge,
        *,
        directly_after_button: bool = False,
    ) -> ExecuteResult:
        current: RuntimeFlowNode | None = start_node
        current_after_button = directly_after_button
        while current:
            try:
                next_node_id = await self.execute_node(
                    current,
                    flow,
                    bridge,
                    directly_after_button=current_after_button,
                )
                current_after_button = False
                if next_node_id == "WAITING_INPUT":
                    self.push_log(current, "async" if bridge.is_bridge_closed() else "sync", "ok", "waiting input")
                    return ExecuteResult(
                        status="WAITING_INPUT",
                        current_node_id=current.id,
                        variables=self.resolver.get_session_variables(),
                        execution_log=self.execution_log,
                    )
                if next_node_id == "END":
                    self.push_log(current, "async" if bridge.is_bridge_closed() else "sync", "ok", "flow ended")
                    return ExecuteResult(
                        status="COMPLETED",
                        variables=self.resolver.get_session_variables(),
                        execution_log=self.execution_log,
                    )
                self.push_log(
                    current,
                    "async" if bridge.is_bridge_closed() else "sync",
                    "ok",
                    f"next -> {next_node_id}",
                )
                current = next((node for node in flow.nodes if node.id == next_node_id), None)
            except Exception as exc:
                logger.error(
                    "flow_executor_node_error",
                    node_id=current.id,
                    node_type=current.node_type,
                    error=str(exc),
                )
                self.push_log(
                    current,
                    "async" if bridge.is_bridge_closed() else "sync",
                    "error",
                    str(exc),
                )
                return ExecuteResult(
                    status="ERROR",
                    current_node_id=current.id,
                    variables=self.resolver.get_session_variables(),
                    execution_log=self.execution_log,
                )

        return ExecuteResult(
            status="COMPLETED",
            variables=self.resolver.get_session_variables(),
            execution_log=self.execution_log,
        )

    async def harvest_node(self, node: RuntimeFlowNode, bridge: SyncBridge) -> None:
        if node.node_type == "TEXT_MESSAGE":
            bridge.add_harvested_text(self.resolver.resolve(str(node.config.get("text") or "")))
            return

        if node.node_type == "REACTION":
            emoji = str(node.config.get("emoji") or "")
            if emoji and self.context.source_message_id:
                bridge.set_harvested_emoji(
                    "❤️" if self.context.channel_type == "instagram" else emoji,
                    self.context.source_message_id,
                )
            if node.config.get("text"):
                bridge.add_harvested_text(self.resolver.resolve(str(node.config.get("text"))))
            return

        if node.node_type == "INTERACTIVE_MESSAGE":
            interactive = await self.resolve_message_id(str(node.config.get("messageId") or ""))
            if not interactive:
                interactive = self.build_interactive_payload(node.config)
            if interactive:
                bridge.set_harvested_interactive(interactive)
            return

        if node.node_type == "GENERATE_PAYMENT_LINK":
            await self.handle_generate_payment_link(node, self._placeholder_flow())

    def harvest_light_nodes(self, flow: RuntimeFlow, start_node: RuntimeFlowNode | None) -> dict[str, Any]:
        result = {
            "light_nodes": [],
            "barrier_node": None,
            "remaining_start_node": None,
        }
        if not start_node:
            return result

        current = start_node
        light_types = {"TEXT_MESSAGE", "REACTION", "INTERACTIVE_MESSAGE", "GENERATE_PAYMENT_LINK"}
        barrier_types = {"MEDIA", "DELAY", "WAIT_FOR_REPLY"}
        while current:
            if current.node_type in barrier_types:
                result["barrier_node"] = current
                break
            if current.node_type in light_types:
                result["light_nodes"].append(current)
                if current.node_type == "INTERACTIVE_MESSAGE" and self.node_waits_for_input(flow, current):
                    break
            else:
                result["remaining_start_node"] = current
                break

            next_edge = next(
                (
                    edge
                    for edge in flow.edges
                    if edge.source_node_id == current.id and not edge.button_id and not edge.condition_branch
                ),
                None,
            )
            if not next_edge:
                break
            current = next((node for node in flow.nodes if node.id == next_edge.target_node_id), None)
        return result

    async def execute_node(
        self,
        node: RuntimeFlowNode,
        flow: RuntimeFlow,
        bridge: SyncBridge,
        *,
        directly_after_button: bool = False,
    ) -> str:
        if node.node_type == "START":
            return self.find_next_node_id(flow, node)
        if node.node_type == "END":
            return "END"
        if node.node_type == "TEXT_MESSAGE":
            return await self.handle_text_message(node, flow, bridge, directly_after_button=directly_after_button)
        if node.node_type == "INTERACTIVE_MESSAGE":
            return await self.handle_interactive_message(node, flow, bridge, directly_after_button=directly_after_button)
        if node.node_type == "WHATSAPP_TEMPLATE":
            return await self.handle_template(node, flow, bridge)
        if node.node_type == "MEDIA":
            return await self.handle_media(node, flow, bridge)
        if node.node_type == "DELAY":
            return await self.handle_delay(node, flow)
        if node.node_type == "CONDITION":
            return await self.handle_condition(node, flow)
        if node.node_type == "SET_VARIABLE":
            return await self.handle_set_variable(node, flow)
        if node.node_type == "HTTP_REQUEST":
            return await self.handle_http_request(node, flow)
        if node.node_type in {"ADD_TAG", "REMOVE_TAG"}:
            return await self.handle_tag(node, flow)
        if node.node_type == "TRANSFER":
            return await self.handle_transfer(node, flow)
        if node.node_type == "REACTION":
            return await self.handle_reaction(node, flow, bridge, directly_after_button=directly_after_button)
        if node.node_type == "CHATWIT_ACTION":
            return await self.handle_chatwit_action(node, flow)
        if node.node_type == "WAIT_FOR_REPLY":
            return await self.handle_wait_for_reply(node, flow, bridge)
        if node.node_type == "GENERATE_PAYMENT_LINK":
            return await self.handle_generate_payment_link(node, flow)
        return self.find_next_node_id(flow, node)

    async def handle_text_message(
        self,
        node: RuntimeFlowNode,
        flow: RuntimeFlow,
        bridge: SyncBridge,
        *,
        directly_after_button: bool = False,
    ) -> str:
        text = self.resolver.resolve(str(node.config.get("text") or ""))
        pending_reaction = bridge.consume_pending_reaction()
        context_message_id = self.context.source_message_id if directly_after_button else None
        if pending_reaction and bridge.can_sync():
            bridge.set_sync_payload(
                self.build_combined_reaction_text_payload(
                    pending_reaction["emoji"],
                    text,
                    pending_reaction["target_message_id"],
                    self.context.channel_type,
                )
            )
        else:
            await self.deliver(
                bridge,
                DeliveryPayload(type="text", content=text, context_message_id=context_message_id),
            )
        return self.find_next_node_id(flow, node)

    async def handle_interactive_message(
        self,
        node: RuntimeFlowNode,
        flow: RuntimeFlow,
        bridge: SyncBridge,
        *,
        directly_after_button: bool = False,
    ) -> str:
        pending_reaction = bridge.consume_pending_reaction()
        if pending_reaction:
            await self.delivery.deliver(
                self.context,
                DeliveryPayload(
                    type="reaction",
                    emoji=pending_reaction["emoji"],
                    target_message_id=pending_reaction["target_message_id"],
                ),
            )

        interactive = await self.resolve_message_id(str(node.config.get("messageId") or ""))
        if not interactive:
            interactive = self.build_interactive_payload(node.config)
        if interactive:
            await self.deliver(bridge, DeliveryPayload(type="interactive", interactive_payload=interactive))

        if self.node_waits_for_input(flow, node):
            return "WAITING_INPUT"
        return self.find_next_node_id(flow, node)

    async def handle_template(self, node: RuntimeFlowNode, flow: RuntimeFlow, bridge: SyncBridge) -> str:
        config = node.config
        if str(config.get("status") or "") != "APPROVED":
            return self.find_next_node_id(flow, node)
        template_name = str(config.get("templateName") or "")
        if not template_name:
            return self.find_next_node_id(flow, node)

        body = config.get("body") or {}
        header = config.get("header") or {}
        buttons = config.get("buttons") or []
        variable_values: dict[str, str] = {}
        for name in body.get("variables") or []:
            variable_values[str(name)] = self.resolver.resolve(f"{{{{{name}}}}}")
        for name in header.get("variables") or []:
            variable_values[str(name)] = self.resolver.resolve(f"{{{{{name}}}}}")

        button_payloads: list[dict[str, str]] = []
        if buttons:
            template_edges = [
                edge for edge in flow.edges if edge.source_node_id == node.id and edge.button_id
            ]
            quick_reply_indices = [
                index for index, button in enumerate(buttons) if str(button.get("type") or "") == "QUICK_REPLY"
            ]
            for edge, index in zip(template_edges, quick_reply_indices, strict=False):
                if edge.button_id:
                    button_payloads.append({"type": "quick_reply", "parameter": edge.button_id})

        processed_params: dict[str, Any] = {}
        if variable_values:
            processed_params["body"] = variable_values
        if header and str(header.get("type") or "") in {"IMAGE", "VIDEO", "DOCUMENT"} and header.get("mediaUrl"):
            processed_params["header"] = {
                "media_url": self.resolver.resolve(str(header.get("mediaUrl"))),
                "media_type": str(header.get("type")).lower(),
            }
        if button_payloads:
            processed_params["buttons"] = button_payloads

        await self.deliver(
            bridge,
            DeliveryPayload(
                type="template",
                template_payload={
                    "name": template_name,
                    "language": str(config.get("language") or "pt_BR"),
                    "processed_params": processed_params,
                },
            ),
        )
        if self.node_waits_for_input(flow, node):
            return "WAITING_INPUT"
        return self.find_next_node_id(flow, node)

    async def handle_media(self, node: RuntimeFlowNode, flow: RuntimeFlow, bridge: SyncBridge) -> str:
        media_url = self.resolver.resolve(str(node.config.get("mediaUrl") or ""))
        caption = self.resolver.resolve(str(node.config.get("caption") or "")) if node.config.get("caption") else None
        await self.delivery.deliver(
            self.context,
            DeliveryPayload(
                type="media",
                media_url=media_url,
                filename=node.config.get("filename"),
                content=caption,
            ),
        )
        return self.find_next_node_id(flow, node)

    async def handle_delay(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        delay_ms = int(node.config.get("delayMs") or 0)
        await asyncio.sleep(max(0, min(delay_ms, 30000)) / 1000)
        return self.find_next_node_id(flow, node)

    async def handle_condition(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        actual_value = self.resolver.resolve(f"{{{{{node.config.get('variable') or ''}}}}}")
        expected_value = self.resolver.resolve(str(node.config.get("value") or ""))
        operator = str(node.config.get("operator") or "eq")
        result = self.evaluate_condition(str(actual_value), operator, str(expected_value))
        branch = "true" if result else "false"
        edge = next(
            (
                edge
                for edge in flow.edges
                if edge.source_node_id == node.id and edge.condition_branch == branch
            ),
            None,
        )
        return edge.target_node_id if edge else "END"

    async def handle_set_variable(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        variable_name = str(node.config.get("variableName") or "")
        expression = str(node.config.get("expression") or "")
        self.resolver.set_variable(variable_name, self.resolver.resolve(expression))
        return self.find_next_node_id(flow, node)

    async def handle_http_request(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        method = str(node.config.get("method") or "GET")
        url = self.resolver.resolve(str(node.config.get("url") or ""))
        timeout_ms = int(node.config.get("timeoutMs") or 10000)
        headers = {
            key: self.resolver.resolve(str(value))
            for key, value in (node.config.get("headers") or {}).items()
        }
        body = node.config.get("body")
        response_variable = node.config.get("responseVariable")
        try:
            async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
                response = await client.request(
                    method,
                    url,
                    headers=headers or None,
                    content=self.resolver.resolve(str(body)) if body else None,
                )
            if response_variable:
                self.resolver.set_variable(
                    str(response_variable),
                    {
                        "status": response.status_code,
                        "data": response.json() if "application/json" in response.headers.get("content-type", "") else response.text,
                    },
                )
        except Exception:
            if response_variable:
                self.resolver.set_variable(str(response_variable), None)
        return self.find_next_node_id(flow, node)

    async def handle_tag(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        return self.find_next_node_id(flow, node)

    async def handle_transfer(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        internal_note = node.config.get("internalNote")
        if internal_note:
            await self.delivery.deliver_text(self.context, self.resolver.resolve(str(internal_note)), True)
        return self.find_next_node_id(flow, node)

    async def handle_reaction(
        self,
        node: RuntimeFlowNode,
        flow: RuntimeFlow,
        bridge: SyncBridge,
        *,
        directly_after_button: bool = False,
    ) -> str:
        emoji = str(node.config.get("emoji") or "")
        if emoji:
            if directly_after_button and self.context.source_message_id:
                bridge.set_pending_reaction(
                    "❤️" if self.context.channel_type == "instagram" else emoji,
                    self.context.source_message_id,
                )
            else:
                await self.delivery.deliver(self.context, DeliveryPayload(type="text", content=emoji))
        if node.config.get("text"):
            await self.delivery.deliver(
                self.context,
                DeliveryPayload(type="text", content=self.resolver.resolve(str(node.config.get("text")))),
            )
        return self.find_next_node_id(flow, node)

    async def handle_chatwit_action(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        config = node.config
        labels = config.get("labels") or []
        normalized_labels = [
            label if isinstance(label, str) else str(label.get("title") or "")
            for label in labels
        ]
        await self.delivery.deliver(
            self.context,
            DeliveryPayload(
                type="chatwit_action",
                action_type=str(config.get("actionType") or "resolve_conversation"),
                assignee_id=int(config["assigneeId"]) if config.get("assigneeId") else None,
                labels=[label for label in normalized_labels if label],
            ),
        )
        return self.find_next_node_id(flow, node)

    async def handle_wait_for_reply(self, node: RuntimeFlowNode, flow: RuntimeFlow, bridge: SyncBridge) -> str:
        prompt_text = self.resolver.resolve(str(node.config.get("promptText") or "Informe o dado solicitado:"))
        variable_name = str(node.config.get("variableName") or "user_reply")
        max_attempts = int(node.config.get("maxAttempts") or 2)
        skip_label = str(node.config.get("skipButtonLabel") or "Pular ⏭️")
        skip_button_id = f"flow_skip_{node.id}"

        self.resolver.set_variable("_waitType", "free_text")
        self.resolver.set_variable("_waitingVariable", variable_name)
        self.resolver.set_variable("_waitNodeId", node.id)
        self.resolver.set_variable("_waitAttempts", 0)
        self.resolver.set_variable("_waitMaxAttempts", max_attempts)
        if node.config.get("validationRegex"):
            self.resolver.set_variable("_waitValidationRegex", node.config.get("validationRegex"))
        if node.config.get("validationErrorMessage"):
            self.resolver.set_variable("_waitValidationError", node.config.get("validationErrorMessage"))

        interactive_payload = {
            "type": "button",
            "body": {"text": prompt_text},
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": skip_button_id,
                            "title": skip_label[:20],
                        },
                    }
                ]
            },
        }
        await self.deliver(
            bridge,
            DeliveryPayload(type="interactive", interactive_payload=interactive_payload),
        )
        return "WAITING_INPUT"

    async def handle_generate_payment_link(self, node: RuntimeFlowNode, flow: RuntimeFlow) -> str:
        provider = str(node.config.get("provider") or "infinitepay")
        handle = self.resolver.resolve(str(node.config.get("handle") or ""))
        raw_amount = self.resolver.resolve(str(node.config.get("amountCents") or "0"))
        description = self.resolver.resolve(str(node.config.get("description") or "Pagamento"))
        output_variable = str(node.config.get("outputVariable") or "payment_url")
        if not handle:
            self.resolver.set_variable(output_variable, "")
            return self.find_next_node_id(flow, node)

        amount_cents = self.parse_currency_to_cents(str(raw_amount))
        if amount_cents < MIN_PAYMENT_AMOUNT_CENTS:
            self.resolver.set_variable(output_variable, "")
            return self.find_next_node_id(flow, node)

        resolved_customer_email = (
            str(self.resolver.resolve(f"{{{{{node.config.get('customerEmailVar') or ''}}}}}") or "").strip()
            if node.config.get("customerEmailVar")
            else ""
        )
        customer_email = resolved_customer_email if re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", resolved_customer_email) else "seuemail@gmail.com"
        customer_name = self.context.contact_name.strip() if len((self.context.contact_name or "").strip()) >= 3 else "Cliente"
        order_nsu = f"chatwit-{self.context.account_id}-{self.context.conversation_id}-{random.getrandbits(32):08x}"
        webhook_url = f"{self.context.chatwit_base_url.rstrip('/')}/webhooks/infinitepay" if self.context.chatwit_base_url else None

        result = await generate_payment_link(
            provider,
            PaymentLinkRequest(
                handle=handle,
                amount_cents=amount_cents,
                description=description,
                customer=PaymentCustomer(
                    name=customer_name,
                    email=customer_email,
                    phone=self.context.contact_phone or None,
                ),
                order_nsu=order_nsu,
                webhook_url=webhook_url,
            ),
        )

        if result.success and result.checkout_url:
            self.resolver.set_variable(output_variable, result.checkout_url)
            self.resolver.set_variable("_payment_order_nsu", order_nsu)
            link_id_variable = node.config.get("linkIdVariable")
            if link_id_variable and result.link_id:
                self.resolver.set_variable(str(link_id_variable), result.link_id)
            anchor_edge = next(
                (
                    edge
                    for edge in flow.edges
                    if edge.source_node_id == node.id and (edge.button_id or "").startswith(FLOW_PAYMENT_PREFIX)
                ),
                None,
            )
            if anchor_edge and anchor_edge.button_id:
                existing = self.resolver.get_variable("_payment_anchors") or {}
                if isinstance(existing, dict):
                    self.resolver.set_variable(
                        "_payment_anchors",
                        {**existing, order_nsu: anchor_edge.button_id},
                    )
        else:
            self.resolver.set_variable(output_variable, "")
        return self.find_next_node_id(flow, node)

    async def skip_wait_for_reply(
        self,
        flow: RuntimeFlow,
        session: FlowSessionData,
        bridge: SyncBridge,
    ) -> ExecuteResult:
        waiting_variable = str(session.variables.get("_waitingVariable") or "")
        if waiting_variable:
            self.resolver.set_variable(waiting_variable, "")
        for key in [
            "_waitType",
            "_waitingVariable",
            "_waitNodeId",
            "_waitAttempts",
            "_waitMaxAttempts",
            "_waitValidationRegex",
            "_waitValidationError",
        ]:
            self.resolver.set_variable(key, None)

        node_id = session.current_node_id or ""
        skip_edge = next(
            (
                edge
                for edge in flow.edges
                if edge.source_node_id == node_id and edge.button_id == f"flow_skip_{node_id}"
            ),
            None,
        )
        edge = skip_edge or next(
            (
                edge
                for edge in flow.edges
                if edge.source_node_id == node_id and not edge.button_id and not edge.condition_branch
            ),
            None,
        )
        if not edge:
            return ExecuteResult(
                status="COMPLETED",
                variables=self.resolver.get_session_variables(),
                execution_log=self.execution_log,
            )
        next_node = next((node for node in flow.nodes if node.id == edge.target_node_id), None)
        if not next_node:
            return ExecuteResult(
                status="COMPLETED",
                variables=self.resolver.get_session_variables(),
                execution_log=self.execution_log,
            )
        return await self.execute_chain(flow, next_node, bridge)

    async def deliver(self, bridge: SyncBridge, payload: DeliveryPayload) -> None:
        if payload.type in {"media", "template"}:
            result = await self.delivery.deliver(self.context, payload)
            if not result.success:
                raise RuntimeError(result.error or "delivery failed")
            return

        if bridge.can_sync():
            bridge.set_sync_payload(self.to_sync_response(payload))
            return

        result = await self.delivery.deliver(self.context, payload)
        if not result.success:
            raise RuntimeError(result.error or "delivery failed")

    def to_sync_response(self, payload: DeliveryPayload) -> dict[str, Any]:
        if payload.type == "text" and payload.context_message_id:
            if self.context.channel_type == "whatsapp":
                return {
                    "whatsapp": {
                        "type": "text",
                        "text": {"body": payload.content or ""},
                        "context": {"message_id": payload.context_message_id},
                    }
                }
            if self.context.channel_type == "instagram":
                return {
                    "instagram": {
                        "message": {"text": payload.content or ""},
                        "reply_to": {"mid": payload.context_message_id},
                    }
                }
        if payload.type == "interactive":
            if self.context.channel_type == "whatsapp":
                return {
                    "whatsapp": {
                        "type": "interactive",
                        "interactive": payload.interactive_payload,
                    }
                }
            if self.context.channel_type in {"instagram", "facebook"}:
                return {self.context.channel_type: payload.interactive_payload}
        return {"text": payload.content or ""}

    def build_interactive_payload(self, config: dict[str, Any]) -> dict[str, Any] | None:
        elements = config.get("elements") or []
        body = config.get("body") or ""
        footer = config.get("footer") or ""
        header_config = config.get("header")
        buttons = config.get("buttons") or []

        if elements:
            for element in elements:
                element_type = element.get("type")
                if element_type == "body":
                    body = element.get("text") or body
                elif element_type == "footer":
                    footer = element.get("text") or footer
                elif element_type in {"header_text", "header_image"} and not header_config:
                    if element_type == "header_text":
                        header_config = {"type": "text", "text": element.get("text")}
                    else:
                        header_config = {"type": "image", "url": element.get("url")}
                elif element_type == "button":
                    buttons.append({"id": element.get("id"), "title": element.get("title")})

        resolved_header = self.resolve_interactive_header(header_config)
        if config.get("ctaUrl") and config["ctaUrl"].get("url"):
            payload: dict[str, Any] = {
                "type": "cta_url",
                "body": {"text": self.resolver.resolve(str(body))},
                "action": {
                    "name": "cta_url",
                    "parameters": {
                        "display_text": self.resolver.resolve(str(config["ctaUrl"].get("title") or "Abrir")),
                        "url": self.resolver.resolve(str(config["ctaUrl"].get("url") or "")),
                    },
                },
            }
            if resolved_header:
                payload["header"] = resolved_header
            if footer:
                payload["footer"] = {"text": self.resolver.resolve(str(footer))}
            return payload

        deduped: list[dict[str, Any]] = []
        seen_titles: set[str] = set()
        for button in buttons:
            title = self.resolver.resolve(str(button.get("title") or button.get("text") or ""))
            if not title:
                continue
            final_title = title
            suffix = 2
            while final_title in seen_titles:
                final_title = f"{title[:17]} ({suffix})"
                suffix += 1
            seen_titles.add(final_title)
            deduped.append(
                {
                    "type": "reply",
                    "reply": {
                        "id": str(button.get("id") or button.get("payload") or final_title),
                        "title": final_title[:20],
                    },
                }
            )

        payload = {
            "type": "button",
            "body": {"text": self.resolver.resolve(str(body))},
        }
        if resolved_header:
            payload["header"] = resolved_header
        if footer:
            payload["footer"] = {"text": self.resolver.resolve(str(footer))}
        if deduped:
            payload["action"] = {"buttons": deduped[:3]}
        return payload

    async def resolve_message_id(self, message_id: str) -> dict[str, Any] | None:
        if not message_id:
            return None

        async with session_ctx() as session:
            stmt = (
                select(Template)
                .where(Template.id == message_id)
                .options(
                    selectinload(Template.interactive_content).selectinload(InteractiveContent.body),
                    selectinload(Template.interactive_content).selectinload(InteractiveContent.header),
                    selectinload(Template.interactive_content).selectinload(InteractiveContent.footer),
                    selectinload(Template.interactive_content).selectinload(InteractiveContent.action_reply_button),
                    selectinload(Template.interactive_content).selectinload(InteractiveContent.action_cta_url),
                )
            )
            template = (await session.execute(stmt)).scalar_one_or_none()

        content = template.interactive_content if template else None
        if not template or not content or not content.body:
            logger.warning("flow_executor_message_id_not_found", message_id=message_id)
            return None

        return self.build_interactive_from_template(content)

    def build_interactive_from_template(self, content: InteractiveContent) -> dict[str, Any]:
        body_text = self.resolver.resolve(content.body.text)
        payload: dict[str, Any] = {
            "type": "button",
            "body": {"text": body_text},
        }

        if content.header:
            header_type = (content.header.type or "").lower()
            header_content = self.resolver.resolve(content.header.content or "")
            if header_type == "text" and header_content:
                payload["header"] = {"type": "text", "text": header_content}
            elif header_type == "video" and header_content:
                payload["header"] = {"type": "video", "video": {"link": header_content}}
            elif header_type == "document" and header_content:
                payload["header"] = {"type": "document", "document": {"link": header_content}}
            elif header_content:
                payload["header"] = {"type": "image", "image": {"link": header_content}}

        if content.footer and content.footer.text:
            payload["footer"] = {"text": self.resolver.resolve(content.footer.text)}

        buttons = list(content.action_reply_button.buttons) if content.action_reply_button else []
        cta = content.action_cta_url
        if cta and cta.url and not buttons:
            payload["type"] = "cta_url"
            payload["action"] = {
                "name": "cta_url",
                "parameters": {
                    "display_text": self.resolver.resolve(cta.display_text)[:20],
                    "url": self.resolver.resolve(cta.url),
                },
            }
            return payload

        reply_buttons = []
        for button in buttons:
            title = self.resolver.resolve(str(button.get("title") or button.get("text") or ""))
            payload_id = str(button.get("payload") or button.get("id") or title)
            if title:
                reply_buttons.append(
                    {
                        "type": "reply",
                        "reply": {
                            "id": payload_id,
                            "title": title[:20],
                        },
                    }
                )
        if reply_buttons:
            payload["action"] = {"buttons": reply_buttons[:3]}
        return payload

    def resolve_interactive_header(self, header: Any) -> dict[str, Any] | None:
        if not header:
            return None
        if isinstance(header, str):
            text = self.resolver.resolve(header).strip()
            return {"type": "text", "text": text} if text else None

        header_type = str(header.get("type") or "").lower()
        if header_type == "text":
            text = self.resolver.resolve(str(header.get("text") or header.get("content") or "")).strip()
            return {"type": "text", "text": text} if text else None
        media_link = self.resolver.resolve(
            str(
                header.get("mediaUrl")
                or header.get("media_url")
                or header.get("url")
                or header.get("content")
                or ""
            )
        ).strip()
        if not media_link:
            return None
        if header_type == "video":
            return {"type": "video", "video": {"link": media_link}}
        if header_type == "document":
            return {"type": "document", "document": {"link": media_link}}
        return {"type": "image", "image": {"link": media_link}}

    def build_combined_reaction_text_payload(
        self,
        emoji: str,
        text: str | None,
        target_message_id: str,
        channel: str,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"action_type": "button_reaction"}
        if emoji:
            payload["emoji"] = emoji
        if text:
            payload["text"] = text
        channel_payload: dict[str, Any] = {"message_id": target_message_id}
        if emoji:
            channel_payload["reaction_emoji"] = emoji
        if text:
            channel_payload["response_text"] = text
        key = "facebook" if channel == "facebook" else "instagram" if channel == "instagram" else "whatsapp"
        payload[key] = channel_payload
        return payload

    def find_next_node_id(self, flow: RuntimeFlow, node: RuntimeFlowNode | None) -> str:
        if not node:
            return "END"
        edge = next(
            (
                edge
                for edge in flow.edges
                if edge.source_node_id == node.id and not edge.button_id and not edge.condition_branch
            ),
            None,
        )
        return edge.target_node_id if edge else "END"

    def evaluate_condition(self, actual: str, operator: str, expected: str) -> bool:
        if operator == "eq":
            return actual == expected
        if operator == "neq":
            return actual != expected
        if operator == "contains":
            return expected in actual
        if operator == "not_contains":
            return expected not in actual
        if operator == "gt":
            return float(actual or 0) > float(expected or 0)
        if operator == "lt":
            return float(actual or 0) < float(expected or 0)
        if operator == "exists":
            return bool(actual and actual != f"{{{{{expected}}}}}")
        if operator == "not_exists":
            return not actual or actual == f"{{{{{expected}}}}}"
        return False

    def node_waits_for_input(self, flow: RuntimeFlow, node: RuntimeFlowNode) -> bool:
        if node.node_type == "INTERACTIVE_MESSAGE":
            buttons = list(node.config.get("buttons") or [])
            elements = list(node.config.get("elements") or [])
            return bool(buttons or any(element.get("type") == "button" for element in elements))
        if node.node_type == "WHATSAPP_TEMPLATE":
            buttons = list(node.config.get("buttons") or [])
            return any(str(button.get("type") or "") == "QUICK_REPLY" for button in buttons)
        return False

    def parse_currency_to_cents(self, raw_value: str) -> int:
        cleaned = raw_value.strip()
        if not cleaned:
            return 0
        has_currency_prefix = "R$" in cleaned.upper()
        cleaned = cleaned.replace("R$", "").replace(" ", "")
        if "," in cleaned and "." in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", ".")
        number = float(cleaned)
        if "." in cleaned or has_currency_prefix:
            return int(round(number * 100))
        return int(round(number))

    def push_log(
        self,
        node: RuntimeFlowNode,
        delivery_mode: str,
        result: str,
        detail: str,
    ) -> None:
        self.execution_log.append(
            ExecutionLogEntry(
                node_id=node.id,
                node_type=node.node_type,
                timestamp=time.time_ns() // 1_000_000,
                duration_ms=0,
                delivery_mode="async" if delivery_mode == "async" else "sync",
                result="error" if result == "error" else "ok" if result == "ok" else "skipped",
                detail=detail,
            )
        )

    def _placeholder_flow(self) -> RuntimeFlow:
        return RuntimeFlow(id="", name="", inbox_id="", nodes=[], edges=[])
