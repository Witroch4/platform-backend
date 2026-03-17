/**
 * Flow Sync Utilities
 *
 * Sincroniza o canvas visual (React Flow) com as tabelas normalizadas
 * (Flow, FlowNode, FlowEdge) para que o FlowExecutor e Flow Analytics
 * possam ler os dados.
 *
 * Arquitetura:
 *   - canvasJson (Flow.canvasJson) = fonte de verdade (o que o usuário edita)
 *   - FlowNode/FlowEdge = views materializadas (geradas automaticamente)
 *
 * @see docs/interative_message_flow_builder.md
 */

import { getPrismaInstance } from "@/lib/connections";
import { Prisma } from "@prisma/client";
import type { FlowCanvas, FlowNode } from "@/types/flow-builder";

// =============================================================================
// NODE TYPE MAPPING
// =============================================================================

/**
 * Mapeamento de tipos de nó do canvas visual para tipos do runtime
 */
export const NODE_TYPE_MAP: Record<string, string> = {
	start: "START",
	interactive_message: "INTERACTIVE_MESSAGE",
	text_message: "TEXT_MESSAGE",
	emoji_reaction: "REACTION",
	text_reaction: "REACTION",
	handoff: "TRANSFER",
	add_tag: "ADD_TAG",
	end: "END",
	condition: "CONDITION",
	delay: "DELAY",
	media: "MEDIA",
	wait_for_reply: "WAIT_FOR_REPLY",
	generate_payment_link: "GENERATE_PAYMENT_LINK",
};

// =============================================================================
// CONFIG BUILDER
// =============================================================================

/**
 * Extrai configuração específica de um nó para armazenar no banco
 */
export function buildNodeConfig(node: FlowNode): object {
	const data = node.data as unknown as Record<string, unknown>;

	switch (node.type) {
		case "interactive_message":
			return {
				messageId: data.messageId,
				elements: data.elements,
				body: data.body,
				header: data.header,
				footer: data.footer,
				buttons: data.buttons,
				label: data.label,
			};
		case "text_message":
			return { text: data.text };
		case "emoji_reaction":
			return { emoji: data.emoji };
		case "text_reaction":
			return { text: data.textReaction };
		case "handoff":
			return { assigneeType: "team", internalNote: data.targetTeam };
		case "add_tag":
			return { tagName: data.tagName };
		case "delay":
			// Canvas usa delaySeconds, engine usa delayMs
			const seconds = (data.delaySeconds as number) || 5;
			return { delayMs: seconds * 1000 };
		case "media":
			return {
				mediaUrl: data.mediaUrl,
				filename: data.filename,
				caption: data.caption,
				mediaType: data.mediaType,
				mimeType: data.mimeType,
			};
		case "wait_for_reply":
			return {
				promptText: data.promptText,
				variableName: data.variableName,
				validationRegex: data.validationRegex,
				validationErrorMessage: data.validationErrorMessage,
				maxAttempts: data.maxAttempts,
				skipButtonLabel: data.skipButtonLabel,
			};
		case "generate_payment_link":
			return {
				provider: data.provider,
				handle: data.handle,
				amountCents: data.amountCents,
				description: data.description,
				customerEmailVar: data.customerEmailVar,
				outputVariable: data.outputVariable,
				linkIdVariable: data.linkIdVariable,
			};
		case "end":
			return { endMessage: data.endMessage };
		case "start":
			return { label: data.label, triggerType: data.triggerType };
		default:
			return data;
	}
}

// =============================================================================
// SYNC FUNCTION
// =============================================================================

/**
 * Sincroniza o canvas visual com as tabelas normalizadas (FlowNode, FlowEdge).
 *
 * Esta função materializa o canvas visual em tabelas relacionais para que:
 * - FlowExecutor possa executar o flow
 * - Flow Analytics possa calcular métricas
 *
 * @param flowId - ID do flow a sincronizar
 * @param canvas - Canvas visual (React Flow format)
 * @param flowName - Nome opcional do flow (extraído do nó START se não fornecido)
 * @returns ID do flow sincronizado
 */
export async function syncCanvasToNormalizedFlow(
	flowId: string,
	canvas: FlowCanvas,
	flowName?: string,
): Promise<string> {
	const prisma = getPrismaInstance();

	return await prisma.$transaction(async (tx) => {
		// 1. Buscar Flow existente
		const flow = await tx.flow.findUnique({
			where: { id: flowId },
		});

		if (!flow) {
			throw new Error(`Flow ${flowId} não encontrado`);
		}

		// Extrair nome do nó START se disponível
		const startNode = canvas.nodes.find((n) => n.type === "start");
		const extractedName =
			flowName || ((startNode?.data as unknown as Record<string, unknown>)?.label as string) || null;

		// Atualizar nome se mudou
		if (extractedName && flow.name !== extractedName) {
			await tx.flow.update({
				where: { id: flow.id },
				data: { name: extractedName },
			});
		}

		// 2. Buscar nós existentes e mapear por _canvasId para preservar DB IDs
		//    Isso evita que session.currentNodeId fique stale após cada save
		const existingNodes = await tx.flowNode.findMany({ where: { flowId: flow.id } });
		const existingByCanvasId = new Map<string, (typeof existingNodes)[0]>();
		for (const node of existingNodes) {
			const config = node.config as Record<string, unknown>;
			if (config?._canvasId && typeof config._canvasId === "string") {
				existingByCanvasId.set(config._canvasId, node);
			}
		}

		// 3. Deletar TODAS as edges (serão recriadas; edges não são referenciadas por sessões)
		await tx.flowEdge.deleteMany({ where: { flowId: flow.id } });

		// 4. Upsert nós: preservar DB ID quando _canvasId já existe, criar se novo
		const nodeIdMap = new Map<string, string>();
		const matchedExistingIds = new Set<string>();

		for (const node of canvas.nodes) {
			const config = { ...buildNodeConfig(node), _canvasId: node.id };
			const nodeType = NODE_TYPE_MAP[node.type] || node.type.toUpperCase();
			const existing = existingByCanvasId.get(node.id);

			if (existing) {
				// Nó existente: atualizar config/posição, preservar DB ID
				matchedExistingIds.add(existing.id);
				await tx.flowNode.update({
					where: { id: existing.id },
					data: {
						nodeType,
						config,
						positionX: node.position.x,
						positionY: node.position.y,
					},
				});
				nodeIdMap.set(node.id, existing.id);
			} else {
				// Nó novo: criar com novo DB ID
				const dbNode = await tx.flowNode.create({
					data: {
						flowId: flow.id,
						nodeType,
						config,
						positionX: node.position.x,
						positionY: node.position.y,
					},
				});
				nodeIdMap.set(node.id, dbNode.id);
			}
		}

		// 5. Deletar nós que não existem mais no canvas
		const nodesToDelete = existingNodes.filter((n) => !matchedExistingIds.has(n.id));
		if (nodesToDelete.length > 0) {
			await tx.flowNode.deleteMany({
				where: { id: { in: nodesToDelete.map((n) => n.id) } },
			});
		}

		// 6. Criar edges com IDs mapeados (com dedup por source+target+handle)
		//
		// FIX: Edges de interactive_message sem sourceHandle (criadas antes dos botões
		// serem adicionados, ou arrastadas do handle padrão do nó) precisam ser
		// expandidas em uma edge por botão. Sem isso, FlowEdge não tem buttonId e
		// resumeFromButton() não encontra o caminho ao receber clique de botão.
		const edgeDedup = new Set<string>();
		let edgesCreated = 0;

		// Pré-indexar canvas nodes por id para lookup rápido
		const canvasNodesMap = new Map<string, FlowNode>();
		for (const node of canvas.nodes) {
			canvasNodesMap.set(node.id, node);
		}

		// Coletar edges que JÁ têm sourceHandle por source (para saber quais botões já estão cobertos)
		const coveredButtonsBySource = new Map<string, Set<string>>();
		for (const edge of canvas.edges) {
			if (edge.sourceHandle) {
				const set = coveredButtonsBySource.get(edge.source) || new Set();
				set.add(edge.sourceHandle);
				coveredButtonsBySource.set(edge.source, set);
			}
		}

		for (const edge of canvas.edges) {
			const sourceId = nodeIdMap.get(edge.source);
			const targetId = nodeIdMap.get(edge.target);

			if (!sourceId || !targetId) continue;

			const conditionBranch = ((edge.data as Record<string, unknown> | undefined)?.conditionBranch as string) || null;

			// FIX: Se edge de interactive_message sem sourceHandle mas nó tem botões,
			// expandir para uma edge por botão não-coberto (garante que cliques funcionem)
			if (!edge.sourceHandle) {
				const sourceNode = canvasNodesMap.get(edge.source);
				if (sourceNode?.type === "interactive_message") {
					const data = sourceNode.data as unknown as Record<string, unknown>;
					const elements = data.elements as Array<{ id: string; type: string }> | undefined;
					const buttons = data.buttons as Array<{ id: string }> | undefined;
					const elementButtons = elements?.filter((e) => e.type === "button") ?? [];
					const allButtonIds = elementButtons.length > 0
						? elementButtons.map((b) => b.id)
						: (buttons ?? []).map((b) => b.id);

					if (allButtonIds.length > 0) {
						const covered = coveredButtonsBySource.get(edge.source) ?? new Set();
						const uncoveredButtonIds = allButtonIds.filter((id) => !covered.has(id));

						if (uncoveredButtonIds.length > 0) {
							console.log(
								`[syncFlow] ⚠️ Edge sem sourceHandle de interactive_message "${edge.source}" → expandindo para ${uncoveredButtonIds.length} botão(ões)`,
							);
							for (const btnId of uncoveredButtonIds) {
								const dedupKey = `${sourceId}|${targetId}|${btnId}`;
								if (edgeDedup.has(dedupKey)) continue;
								edgeDedup.add(dedupKey);
								edgesCreated++;

								await tx.flowEdge.create({
									data: {
										flowId: flow.id,
										sourceNodeId: sourceId,
										targetNodeId: targetId,
										buttonId: btnId,
										conditionBranch,
									},
								});
							}
							// Também criar a edge default (sem buttonId) para findNextNodeId()
							const defaultDedupKey = `${sourceId}|${targetId}|`;
							if (!edgeDedup.has(defaultDedupKey)) {
								edgeDedup.add(defaultDedupKey);
								edgesCreated++;
								await tx.flowEdge.create({
									data: {
										flowId: flow.id,
										sourceNodeId: sourceId,
										targetNodeId: targetId,
										buttonId: null,
										conditionBranch,
									},
								});
							}
							continue; // Já processou esta edge
						}
					}
				}
			}

			const dedupKey = `${sourceId}|${targetId}|${edge.sourceHandle || ""}`;
			if (edgeDedup.has(dedupKey)) continue;
			edgeDedup.add(dedupKey);
			edgesCreated++;

			await tx.flowEdge.create({
				data: {
					flowId: flow.id,
					sourceNodeId: sourceId,
					targetNodeId: targetId,
					buttonId: edge.sourceHandle || null,
					conditionBranch,
				},
			});
		}

		const duplicatesRemoved = canvas.edges.length - edgesCreated;
		if (duplicatesRemoved > 0) {
			console.log(`[syncFlow] ⚠️ ${duplicatesRemoved} edges duplicadas removidas no sync`);
		}

		console.log(
			`[syncFlow] Sincronizado Flow ${flow.id} (${extractedName || flow.name}) com ${canvas.nodes.length} nós e ${canvas.edges.length} edges`,
		);

		return flow.id;
	});
}
