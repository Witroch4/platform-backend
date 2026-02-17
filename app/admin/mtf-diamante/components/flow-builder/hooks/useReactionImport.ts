"use client";

import { useCallback } from "react";
import type { Node, Connection } from "@xyflow/react";
import { toast } from "sonner";
import { FlowNodeType, type FlowNodeData, type InteractiveMessageNodeData } from "@/types/flow-builder";
import type { ButtonReaction } from "@/app/admin/mtf-diamante/lib/types";

interface InteractiveMessage {
	id?: string;
	name?: string;
	body?: { text?: string } | undefined;
	header?: { type?: string; text?: string; content?: string; media_url?: string } | undefined;
	footer?: { text?: string } | undefined;
	action?: Record<string, unknown> | undefined;
	content?: Record<string, unknown>;
}

interface ReactionImportDependencies {
	nodes: Node[];
	buttonReactions: ButtonReaction[] | undefined;
	interactiveMessages: InteractiveMessage[] | undefined;
	addNode: (type: FlowNodeType, position: { x: number; y: number }) => string | null;
	updateNodeData: (id: string, data: Partial<FlowNodeData>) => void;
	onConnect: (connection: Connection) => void;
}

/**
 * Hook que gerencia a importação de reações para nós do Flow Builder.
 * Quando uma mensagem é vinculada, cria automaticamente nós de reação
 * para cada botão que tem uma reação configurada.
 */
export function useReactionImport({
	nodes,
	buttonReactions,
	interactiveMessages,
	addNode,
	updateNodeData,
	onConnect,
}: ReactionImportDependencies) {
	/**
	 * Cria nós de reação automaticamente quando uma mensagem é vinculada.
	 * Para cada botão que tem uma reação configurada, cria um nó e conecta.
	 */
	const handleLinkMessageWithReactions = useCallback(
		(nodeId: string, messageId: string, buttons: Array<{ id: string; title: string }>) => {
			// Criar Set com os IDs dos botões desta mensagem para lookup rápido
			const buttonIds = new Set(buttons.map((b) => b.id));

			// Filtrar reações que correspondem aos botões desta mensagem
			// Nota: usamos buttonId (não messageId) porque MapeamentoBotao não tem
			// campo de templateId - apenas inboxId e buttonId
			const messageReactions = (buttonReactions ?? []).filter(
				(r: ButtonReaction) => r.buttonId && buttonIds.has(r.buttonId),
			);

			if (messageReactions.length === 0) {
				if (process.env.NODE_ENV === "development") {
					console.log("🔍 [handleLinkMessageWithReactions] Nenhuma reação encontrada", {
						messageId,
						buttonIds: Array.from(buttonIds),
						availableReactions: buttonReactions?.map((r: ButtonReaction) => r.buttonId),
					});
				}
				return;
			}

			// Buscar a posição atual do nó para calcular posições dos filhos
			const currentNode = nodes.find((n) => n.id === nodeId);
			if (!currentNode) return;

			const baseX = currentNode.position.x + 400; // À direita do nó atual
			let offsetY = currentNode.position.y - 50; // Começar um pouco acima

			// Helper para criar e conectar um nó
			const createAndConnectNode = (nodeType: FlowNodeType, nodeData: Partial<FlowNodeData>, buttonId: string) => {
				const newNodeId = addNode(nodeType, {
					x: baseX,
					y: offsetY,
				});

				if (newNodeId && Object.keys(nodeData).length > 0) {
					updateNodeData(newNodeId, nodeData);
				}

				if (newNodeId) {
					onConnect({
						source: nodeId,
						target: newNodeId,
						sourceHandle: buttonId,
						targetHandle: null,
					});
				}

				offsetY += 180; // Espaçamento vertical entre nós
				return newNodeId;
			};

			// Para cada botão que tem uma reação, criar um nó
			for (const button of buttons) {
				const reaction = messageReactions.find((r: ButtonReaction) => r.buttonId === button.id) as
					| {
							buttonId?: string;
							messageId?: string;
							linkedMessageId?: string;
							emoji?: string;
							textReaction?: string;
							textResponse?: string;
							action?: string;
					  }
					| undefined;

				if (!reaction) continue;

				// Criar nós separados para cada tipo de configuração
				// 1. Handoff → Nó de HANDOFF (transferência real)
				if (reaction.action === "handoff") {
					createAndConnectNode(
						FlowNodeType.HANDOFF,
						{
							label: "Transferir para atendente",
							isConfigured: true,
						},
						button.id,
					);
				}

				// 2. Texto → Nó de texto (pode coexistir com handoff)
				const textContent = reaction.textReaction || reaction.textResponse;
				if (textContent) {
					const emoji = reaction.emoji ? `${reaction.emoji} ` : "";
					createAndConnectNode(
						FlowNodeType.TEXT_MESSAGE,
						{
							label: button.title,
							text: `${emoji}${textContent}`,
							isConfigured: true,
						},
						button.id,
					);
				}

				// 3. Mensagem vinculada → Nó de mensagem interativa
				if ((reaction as { linkedMessageId?: string }).linkedMessageId) {
					const linkedMsg = interactiveMessages?.find(
						(m) => m.id === (reaction as { linkedMessageId?: string }).linkedMessageId,
					);
					if (linkedMsg) {
						const content = linkedMsg.content || {};
						createAndConnectNode(
							FlowNodeType.INTERACTIVE_MESSAGE,
							{
								label: linkedMsg.name ?? "Mensagem",
								messageId: linkedMsg.id,
								message: {
									id: linkedMsg.id ?? "",
									name: linkedMsg.name ?? "",
									body: content.body ?? linkedMsg.body,
									header: content.header ?? linkedMsg.header,
									footer: content.footer ?? linkedMsg.footer,
									action: content.action ?? linkedMsg.action,
								} as InteractiveMessageNodeData["message"],
								isConfigured: true,
							},
							button.id,
						);
					}
				}

				// 4. Se não tem nenhuma das configurações acima, mas tem emoji, criar nó de texto só com emoji
				if (
					!reaction.action &&
					!textContent &&
					!(reaction as { linkedMessageId?: string }).linkedMessageId &&
					reaction.emoji
				) {
					createAndConnectNode(
						FlowNodeType.TEXT_MESSAGE,
						{
							label: button.title,
							text: reaction.emoji,
							isConfigured: true,
						},
						button.id,
					);
				}
			}

			toast.success(`${messageReactions.length} reação(ões) importada(s) automaticamente`);
		},
		[buttonReactions, nodes, interactiveMessages, addNode, updateNodeData, onConnect],
	);

	return { handleLinkMessageWithReactions };
}

export type ReactionImportState = ReturnType<typeof useReactionImport>;
