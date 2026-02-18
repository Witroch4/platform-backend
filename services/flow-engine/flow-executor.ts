/**
 * FlowExecutor — Motor unificado de execução de flows
 *
 * Regra simples:
 *   - Primeira INTERACTIVE_MESSAGE → resposta síncrona (ponte HTTP)
 *   - Chatwoot fecha a ponte automaticamente ao receber
 *   - Tudo depois → async via API Chatwit
 *
 * Sem cronômetro. Sem margem de segurança. Sem complexidade.
 */

import log from "@/lib/log";
import { SyncBridge } from "./sync-bridge";
import { ChatwitDeliveryService, createDeliveryService } from "./chatwit-delivery-service";
import { VariableResolver } from "./variable-resolver";
import { elementsToLegacyFields } from "@/lib/flow-builder/interactiveMessageElements";
import { buildTemplateDispatchPayload } from "@/lib/flow-builder/templateElements";
import { debugLogRuntimeFlow } from "@/lib/flow-builder/exportImport";
import type { InteractiveMessageElement, TemplateNodeData } from "@/types/flow-builder";
import type {
	DeliveryContext,
	DeliveryPayload,
	SynchronousResponse,
	RuntimeFlow,
	RuntimeFlowNode,
	ExecutionLogEntry,
	FlowNodeType,
	FlowSessionData,
	ConditionConfig,
	DelayConfig,
	HttpRequestConfig,
	SetVariableConfig,
	TransferConfig,
	TagConfig,
	MediaConfig,
	ExecuteResult,
} from "@/types/flow-engine";

// =============================================================================
// Tipos internos para Harvest
// =============================================================================

/** Nós leves que podem ir na ponte sync */
type LightNodeType = "TEXT_MESSAGE" | "REACTION" | "INTERACTIVE_MESSAGE";

/** Nós que são barreiras (forçam transição para async) */
type BarrierNodeType = "MEDIA" | "DELAY";

/** Resultado do harvest de nós leves */
interface HarvestedContent {
	/** Nós leves coletados (em ordem) */
	lightNodes: RuntimeFlowNode[];
	/** Nó de barreira encontrado (MEDIA ou DELAY) */
	barrierNode: RuntimeFlowNode | null;
	/** Nós após a barreira (para continuar async) */
	remainingStartNode: RuntimeFlowNode | null;
}

// Re-export ExecuteResult from types for backwards compatibility
export type { ExecuteResult } from "@/types/flow-engine";

// =============================================================================
// FlowExecutor
// =============================================================================

export class FlowExecutor {
	private delivery: ChatwitDeliveryService;
	private resolver: VariableResolver;
	private executionLog: ExecutionLogEntry[] = [];

	constructor(
		private readonly context: DeliveryContext,
		sessionVariables: Record<string, unknown> = {},
	) {
		this.delivery = createDeliveryService(context);
		this.resolver = new VariableResolver(context, sessionVariables);
	}

	// ---------------------------------------------------------------------------
	// Public: execução completa de um flow (desde o START)
	// ---------------------------------------------------------------------------

	async execute(flow: RuntimeFlow, bridge: SyncBridge): Promise<ExecuteResult> {
		// DEBUG: Log do grafo de conexões quando DEBUG=1
		debugLogRuntimeFlow(flow, `FlowExecutor.execute() - Starting flow`);

		const startNode = flow.nodes.find((n) => n.nodeType === "START");
		if (!startNode) {
			log.error("[FlowExecutor] Flow sem nó START", { flowId: flow.id });
			return {
				status: "ERROR",
				variables: this.resolver.getSessionVariables(),
				executionLog: this.executionLog,
			};
		}

		return this.executeChain(flow, startNode, bridge);
	}

	// ---------------------------------------------------------------------------
	// Public: retomar de um clique de botão (WAITING_INPUT → próximo nó)
	// ---------------------------------------------------------------------------

	async resumeFromButton(
		flow: RuntimeFlow,
		session: FlowSessionData,
		buttonId: string,
		bridge: SyncBridge,
	): Promise<ExecuteResult> {
		// DEBUG: Log do grafo de conexões quando DEBUG=1
		debugLogRuntimeFlow(flow, `FlowExecutor.resumeFromButton(${buttonId}) - currentNode: ${session.currentNodeId}`);

		if (!session.currentNodeId) {
			return {
				status: "ERROR",
				variables: session.variables,
				executionLog: this.executionLog,
			};
		}

		// Buscar TODAS as edges com este buttonId (suporte a branches paralelos)
		let edges = flow.edges.filter((e) => e.sourceNodeId === session.currentNodeId && e.buttonId === buttonId);

		// Se não encontrou no currentNode, buscar em QUALQUER nó do flow
		// (usuário clicou botão de uma mensagem interativa anterior — "rewind")
		if (edges.length === 0) {
			const allMatchingEdges = flow.edges.filter((e) => e.buttonId === buttonId);

			if (allMatchingEdges.length > 0) {
				// Agrupar por sourceNodeId: NUNCA misturar edges de sources diferentes
				// (previne contaminação cruzada quando botões duplicados existem no flow)
				const sourceNodeIds = [...new Set(allMatchingEdges.map((e) => e.sourceNodeId))];

				if (sourceNodeIds.length > 1) {
					// Múltiplas fontes com mesmo buttonId — tentar desambiguar pelo config do nó
					let matchedSourceId: string | null = null;

					for (const sourceId of sourceNodeIds) {
						const sourceNode = flow.nodes.find((n) => n.id === sourceId);
						if (!sourceNode || sourceNode.nodeType !== "INTERACTIVE_MESSAGE") continue;

						const config = sourceNode.config as Record<string, unknown>;
						const buttons = config.buttons as Array<{ id: string }> | undefined;
						const configElements = config.elements as Array<{ id: string; type: string }> | undefined;

						const hasButton =
							buttons?.some((b) => b.id === buttonId) ||
							configElements?.some((e) => e.type === "button" && e.id === buttonId);

						if (hasButton) {
							matchedSourceId = sourceId;
							break;
						}
					}

					if (!matchedSourceId) {
						// Fallback: usar primeiro source (prevenir mistura de paths)
						matchedSourceId = sourceNodeIds[0];
						log.warn("[FlowExecutor] Rewind: buttonId duplicado sem match por config", {
							buttonId,
							sourceCount: sourceNodeIds.length,
						});
					}

					edges = allMatchingEdges.filter((e) => e.sourceNodeId === matchedSourceId);
				} else {
					// Source único — sem ambiguidade
					edges = allMatchingEdges;
				}

				if (edges.length > 0) {
					log.info("[FlowExecutor] Botão encontrado em nó anterior, executando rewind", {
						currentNodeId: session.currentNodeId,
						actualSourceNodeId: edges[0].sourceNodeId,
						buttonId,
						ambiguous: sourceNodeIds.length > 1,
					});
				}
			}
		}

		if (edges.length === 0) {
			log.warn("[FlowExecutor] Nenhuma edge encontrada para botão", {
				currentNodeId: session.currentNodeId,
				buttonId,
			});
			return {
				status: "ERROR",
				currentNodeId: session.currentNodeId,
				variables: session.variables,
				executionLog: this.executionLog,
			};
		}

		// Recarrega variáveis da sessão
		for (const [k, v] of Object.entries(session.variables)) {
			this.resolver.setVariable(k, v);
		}

		// Mapear edges para nós de destino
		const targetNodes = edges
			.map((edge) => flow.nodes.find((n) => n.id === edge.targetNodeId))
			.filter((n): n is RuntimeFlowNode => n !== undefined);

		if (targetNodes.length === 0) {
			return {
				status: "ERROR",
				variables: session.variables,
				executionLog: this.executionLog,
			};
		}

		log.debug("[FlowExecutor] Branches paralelos após botão", {
			buttonId,
			targetCount: targetNodes.length,
			targetTypes: targetNodes.map((n) => n.nodeType),
		});

		// -------------------------------------------------------------------------
		// HARVEST + BARRIER: Coletar nós leves até encontrar barreira
		//
		// Modelo: Olhar para frente, coletar tudo que cabe na ponte sync,
		// e só depois continuar async a partir da barreira.
		// -------------------------------------------------------------------------

		// 1. Separar REACTIONs de nós de conteúdo
		const reactionBranches: RuntimeFlowNode[] = [];
		const contentTargets: RuntimeFlowNode[] = [];

		for (const node of targetNodes) {
			if (node.nodeType === "REACTION") {
				reactionBranches.push(node);
			} else {
				contentTargets.push(node);
			}
		}

		// 2. Processar REACTIONs e suas continuações
		const reactionContinuations: RuntimeFlowNode[] = [];
		for (const reaction of reactionBranches) {
			const nextEdge = flow.edges.find((e) => e.sourceNodeId === reaction.id && !e.buttonId && !e.conditionBranch);
			if (nextEdge) {
				const nextNode = flow.nodes.find((n) => n.id === nextEdge.targetNodeId);
				if (nextNode) reactionContinuations.push(nextNode);
			}
		}

		// 3. Escolher main chain
		const allCandidates = [...contentTargets, ...reactionContinuations];
		let mainChainNode: RuntimeFlowNode | null = null;
		const parallelContent: RuntimeFlowNode[] = [];

		for (const node of allCandidates) {
			const hasNextEdge = flow.edges.some((e) => e.sourceNodeId === node.id && !e.buttonId && !e.conditionBranch);
			const isInteractive = node.nodeType === "INTERACTIVE_MESSAGE";
			const hasContinuation = hasNextEdge || isInteractive;

			if (!mainChainNode) {
				mainChainNode = node;
			} else {
				const mainHasNextEdge = flow.edges.some(
					(e) => e.sourceNodeId === mainChainNode!.id && !e.buttonId && !e.conditionBranch,
				);
				const mainIsInteractive = mainChainNode!.nodeType === "INTERACTIVE_MESSAGE";
				const mainHasContinuation = mainHasNextEdge || mainIsInteractive;

				if (hasContinuation && !mainHasContinuation) {
					parallelContent.push(mainChainNode);
					mainChainNode = node;
				} else {
					parallelContent.push(node);
				}
			}
		}

		if (!mainChainNode && targetNodes.length > 0) {
			mainChainNode = targetNodes[0];
		}

		// -------------------------------------------------------------------------
		// 4. HARVEST: Coletar nós leves da main chain até encontrar barreira
		// -------------------------------------------------------------------------
		const harvested = this.harvestLightNodes(flow, mainChainNode);

		log.debug("[FlowExecutor] Harvest result", {
			lightNodesCount: harvested.lightNodes.length,
			lightTypes: harvested.lightNodes.map((n) => n.nodeType),
			hasBarrier: !!harvested.barrierNode,
			barrierType: harvested.barrierNode?.nodeType,
		});

		// ---- EXECUÇÃO (HARVEST MODE) ----

		// 4.5 Propagar wamid do botão clicado como contexto (fallback para text-only)
		const wamid = this.context.sourceMessageId;
		if (wamid) {
			bridge.setContextMessageId(wamid);
		}

		// 5. REACTIONs primeiro - coletar no harvest
		for (const reaction of reactionBranches) {
			log.debug("[FlowExecutor] Coletando REACTION (harvest)", {
				nodeId: reaction.id,
			});
			await this.harvestNode(reaction, flow, bridge);
			this.pushLog(reaction, Date.now(), "sync", "ok", "reaction harvested");
		}

		// 6. Coletar conteúdo dos nós leves no harvest
		for (const lightNode of harvested.lightNodes) {
			log.debug("[FlowExecutor] Coletando light node (harvest)", {
				nodeId: lightNode.id,
				nodeType: lightNode.nodeType,
			});
			await this.harvestNode(lightNode, flow, bridge);
			this.pushLog(lightNode, Date.now(), "sync", "ok", "harvested");
		}

		// 7. Conteúdo paralelo (branches que não são main chain) - também harvest
		for (const branch of parallelContent) {
			log.debug("[FlowExecutor] Coletando branch paralelo (harvest)", {
				nodeId: branch.id,
				nodeType: branch.nodeType,
			});
			await this.harvestNode(branch, flow, bridge);
			this.pushLog(branch, Date.now(), "sync", "ok", "branch paralelo harvested");
		}

		// 8. Construir payload combinado e definir no sync
		if (bridge.canSync() && (bridge.hasHarvestedContent() || bridge.hasPendingReaction())) {
			const channel = this.context.channelType;
			const combinedPayload = bridge.buildCombinedPayload(channel);
			if (combinedPayload) {
				bridge.setSyncPayload(combinedPayload);
				log.debug("[FlowExecutor] Payload combinado definido no sync");
			}
		}

		// 9. Se encontrou barreira, agendar execução async em BACKGROUND e retornar IMEDIATAMENTE
		if (harvested.barrierNode) {
			log.debug("[FlowExecutor] Barrier encontrada - agendando async em background", {
				barrierType: harvested.barrierNode.nodeType,
				barrierNodeId: harvested.barrierNode.id,
			});

			// Capturar referências para o closure
			const barrierNode = harvested.barrierNode;
			const flowRef = flow;
			const bridgeRef = bridge;

			// Executar em background (não bloqueante) - resposta sync retorna imediatamente
			setImmediate(async () => {
				try {
					log.debug("[FlowExecutor] Iniciando execução async em background", {
						barrierNodeId: barrierNode.id,
					});
					await this.executeChain(flowRef, barrierNode, bridgeRef, false);
					log.debug("[FlowExecutor] Execução async em background concluída");
				} catch (err) {
					log.error("[FlowExecutor] Erro na execução async em background", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			});

			// Retornar imediatamente - NÃO bloqueia esperando DELAY/MEDIA
			const lastHarvested = harvested.lightNodes[harvested.lightNodes.length - 1];
			if (lastHarvested?.nodeType === "INTERACTIVE_MESSAGE") {
				return {
					status: "WAITING_INPUT",
					currentNodeId: lastHarvested.id,
					variables: this.resolver.getSessionVariables(),
					executionLog: this.executionLog,
				};
			}

			return {
				status: "COMPLETED",
				variables: this.resolver.getSessionVariables(),
				executionLog: this.executionLog,
			};
		}

		// 10. Sem barreira: se há remaining node após harvest, executar em background também
		if (harvested.remainingStartNode) {
			const remainingNode = harvested.remainingStartNode;
			const flowRef = flow;
			const bridgeRef = bridge;

			setImmediate(async () => {
				try {
					await this.executeChain(flowRef, remainingNode, bridgeRef, false);
				} catch (err) {
					log.error("[FlowExecutor] Erro na execução remaining em background", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			});

			return {
				status: "COMPLETED",
				variables: this.resolver.getSessionVariables(),
				executionLog: this.executionLog,
			};
		}

		// 11. Nenhum remaining - check se último nó era INTERACTIVE (WAITING_INPUT)
		const lastHarvested = harvested.lightNodes[harvested.lightNodes.length - 1];
		if (lastHarvested?.nodeType === "INTERACTIVE_MESSAGE") {
			return {
				status: "WAITING_INPUT",
				currentNodeId: lastHarvested.id,
				variables: this.resolver.getSessionVariables(),
				executionLog: this.executionLog,
			};
		}

		return {
			status: "COMPLETED",
			variables: this.resolver.getSessionVariables(),
			executionLog: this.executionLog,
		};
	}

	// ---------------------------------------------------------------------------
	// Harvest: coletar nós leves até encontrar barreira
	// ---------------------------------------------------------------------------

	/**
	 * Coleta o conteúdo de um nó leve no SyncBridge (em vez de enviar).
	 * Usado durante a fase de harvest para combinar múltiplos itens.
	 */
	private async harvestNode(node: RuntimeFlowNode, _flow: RuntimeFlow, bridge: SyncBridge): Promise<void> {
		const nodeType = node.nodeType as FlowNodeType;
		const wamid = this.context.sourceMessageId;

		switch (nodeType) {
			case "TEXT_MESSAGE": {
				const config = node.config as { text?: string };
				const text = this.resolver.resolve(config.text ?? "");
				bridge.addHarvestedText(text);
				break;
			}

			case "REACTION": {
				const config = node.config as { emoji?: string; text?: string };
				if (config.emoji && wamid) {
					const channel = this.context.channelType;
					const reactionEmoji = channel === "instagram" ? "❤️" : config.emoji;
					bridge.setHarvestedEmoji(reactionEmoji, wamid);
				}
				if (config.text) {
					const text = this.resolver.resolve(config.text);
					bridge.addHarvestedText(text);
				}
				break;
			}

			case "INTERACTIVE_MESSAGE": {
				const config = node.config as {
					interactivePayload?: Record<string, unknown>;
					elements?: InteractiveMessageElement[];
					body?: string;
					header?: string;
					footer?: string;
					buttons?: Array<{ id: string; title: string }>;
				};

				// Converter elements para formato legado se necessário
				let effectiveConfig = config;
				if (config.elements?.length) {
					const legacy = elementsToLegacyFields(config.elements);
					effectiveConfig = {
						...config,
						body: legacy.body,
						header: legacy.header,
						footer: legacy.footer,
						buttons: legacy.buttons,
					};
				}

				const resolvedPayload = effectiveConfig.interactivePayload
					? JSON.parse(this.resolver.resolve(JSON.stringify(effectiveConfig.interactivePayload)))
					: this.buildInteractivePayload(effectiveConfig);

				bridge.setHarvestedInteractive(resolvedPayload);
				break;
			}

			default:
				log.warn("[FlowExecutor] harvestNode: tipo inesperado", { nodeType });
		}
	}

	/**
	 * Faz look-ahead a partir de um nó, coletando nós "leves" que podem ir
	 * na ponte sync até encontrar uma barreira (MEDIA ou DELAY).
	 */
	private harvestLightNodes(flow: RuntimeFlow, startNode: RuntimeFlowNode | null): HarvestedContent {
		const result: HarvestedContent = {
			lightNodes: [],
			barrierNode: null,
			remainingStartNode: null,
		};

		if (!startNode) return result;

		const lightTypes: LightNodeType[] = ["TEXT_MESSAGE", "REACTION", "INTERACTIVE_MESSAGE"];
		const barrierTypes: BarrierNodeType[] = ["MEDIA", "DELAY"];

		let current: RuntimeFlowNode | null = startNode;

		while (current) {
			const nodeType = current.nodeType as FlowNodeType;

			// É uma barreira? Para aqui.
			if (barrierTypes.includes(nodeType as BarrierNodeType)) {
				result.barrierNode = current;
				break;
			}

			// É um nó leve? Coleta.
			if (lightTypes.includes(nodeType as LightNodeType)) {
				result.lightNodes.push(current);

				// INTERACTIVE_MESSAGE com botões = fim do harvest (espera input)
				if (nodeType === "INTERACTIVE_MESSAGE") {
					const config = current.config as { buttons?: unknown[]; elements?: unknown[] };
					const hasButtons =
						config.buttons?.length || config.elements?.some((e: unknown) => (e as { type?: string }).type === "button");
					if (hasButtons) {
						// Não tem remaining - vai esperar input
						break;
					}
				}
			} else {
				// Nó de controle (CONDITION, SET_VARIABLE, etc) - não é harvest nem barrier
				// Marca como remaining e para
				result.remainingStartNode = current;
				break;
			}

			// Próximo nó na cadeia
			const nextEdge = flow.edges.find((e) => e.sourceNodeId === current!.id && !e.buttonId && !e.conditionBranch);

			if (!nextEdge) break;

			current = flow.nodes.find((n) => n.id === nextEdge.targetNodeId) ?? null;
		}

		return result;
	}

	// ---------------------------------------------------------------------------
	// Core: execute chain (nó a nó até END, WAITING_INPUT ou erro)
	// ---------------------------------------------------------------------------

	private async executeChain(
		flow: RuntimeFlow,
		startNode: RuntimeFlowNode,
		bridge: SyncBridge,
		isFirstNodeAfterButton = false,
	): Promise<ExecuteResult> {
		let current: RuntimeFlowNode | null = startNode;
		let directlyAfterButton = isFirstNodeAfterButton;

		while (current) {
			const t0 = Date.now();
			let deliveryMode: "sync" | "async" = bridge.isBridgeClosed() ? "async" : "sync";
			let result: "ok" | "error" | "skipped" = "ok";
			let detail: string | undefined;

			try {
				const outcome = await this.executeNode(current, flow, bridge, directlyAfterButton);
				directlyAfterButton = false;

				if (outcome === "WAITING_INPUT") {
					this.pushLog(current, t0, deliveryMode, "ok", "Aguardando input do usuário");
					return {
						status: "WAITING_INPUT",
						currentNodeId: current.id,
						variables: this.resolver.getSessionVariables(),
						executionLog: this.executionLog,
					};
				}

				if (outcome === "END") {
					this.pushLog(current, t0, deliveryMode, "ok", "Flow encerrado");
					return {
						status: "COMPLETED",
						variables: this.resolver.getSessionVariables(),
						executionLog: this.executionLog,
					};
				}

				detail = `next → ${outcome}`;
			} catch (err) {
				result = "error";
				detail = err instanceof Error ? err.message : String(err);
				log.error("[FlowExecutor] Erro ao executar nó", {
					nodeId: current.id,
					nodeType: current.nodeType,
					error: detail,
				});
			}

			deliveryMode = bridge.isBridgeClosed() ? "async" : "sync";
			this.pushLog(current, t0, deliveryMode, result, detail);

			if (result === "error") {
				return {
					status: "ERROR",
					currentNodeId: current.id,
					variables: this.resolver.getSessionVariables(),
					executionLog: this.executionLog,
				};
			}

			const nextNodeId = detail?.replace("next → ", "");
			current = nextNodeId ? (flow.nodes.find((n) => n.id === nextNodeId) ?? null) : null;
		}

		return {
			status: "COMPLETED",
			variables: this.resolver.getSessionVariables(),
			executionLog: this.executionLog,
		};
	}

	// ---------------------------------------------------------------------------
	// Execute individual node
	// ---------------------------------------------------------------------------

	private async executeNode(
		node: RuntimeFlowNode,
		flow: RuntimeFlow,
		bridge: SyncBridge,
		directlyAfterButton = false,
	): Promise<string> {
		const nodeType = node.nodeType as FlowNodeType;

		switch (nodeType) {
			case "START":
				return this.findNextNodeId(flow, node);

			case "END":
				return "END";

			case "TEXT_MESSAGE":
				return this.handleTextMessage(node, flow, bridge, directlyAfterButton);

			case "INTERACTIVE_MESSAGE":
				return this.handleInteractiveMessage(node, flow, bridge, directlyAfterButton);

			case "MEDIA":
				return this.handleMedia(node, flow, bridge);

			case "DELAY":
				return this.handleDelay(node, flow);

			case "CONDITION":
				return this.handleCondition(node, flow);

			case "SET_VARIABLE":
				return this.handleSetVariable(node, flow);

			case "HTTP_REQUEST":
				return this.handleHttpRequest(node, flow);

			case "ADD_TAG":
			case "REMOVE_TAG":
				return this.handleTag(node, flow, nodeType);

			case "TRANSFER":
				return this.handleTransfer(node, flow);

			case "REACTION":
				return this.handleReaction(node, flow, bridge, directlyAfterButton);

			case "QUICK_REPLIES":
				return this.handleQuickReplies(node, flow, bridge);

			case "CAROUSEL":
				return this.handleCarousel(node, flow, bridge);

			case "TEMPLATE":
				return this.handleTemplate(node, flow, bridge, directlyAfterButton);

			default:
				log.warn("[FlowExecutor] Tipo de nó desconhecido", { nodeType });
				return this.findNextNodeId(flow, node);
		}
	}

	// ---------------------------------------------------------------------------
	// Node handlers
	// ---------------------------------------------------------------------------

	private async handleTextMessage(
		node: RuntimeFlowNode,
		flow: RuntimeFlow,
		bridge: SyncBridge,
		directlyAfterButton = false,
	): Promise<string> {
		const config = node.config as { text?: string };
		const text = this.resolver.resolve(config.text ?? "");
		const wamid = this.context.sourceMessageId;
		const contextMessageId = directlyAfterButton && wamid ? wamid : undefined;

		// Verificar se há REACTION pendente para combinar
		const pendingReaction = bridge.consumePendingReaction();

		if (pendingReaction && directlyAfterButton && bridge.canSync()) {
			// Combinar reaction + text no formato button_reaction
			const channel = this.context.channelType;
			const combinedPayload = this.buildCombinedReactionTextPayload(
				pendingReaction.emoji,
				text,
				pendingReaction.targetMessageId,
				channel,
			);
			bridge.setSyncPayload(combinedPayload);
			log.debug("[FlowExecutor] TEXT combinado com REACTION pendente", {
				emoji: pendingReaction.emoji,
				textPreview: text.slice(0, 50),
			});
		} else {
			await this.deliver(bridge, { type: "text", content: text, contextMessageId });
		}

		return this.findNextNodeId(flow, node);
	}

	/**
	 * Monta payload button_reaction para resposta síncrona.
	 * Suporta 3 variantes:
	 *   - Só emoji:  { action_type, emoji, whatsapp: { message_id, reaction_emoji } }
	 *   - Só texto:  { action_type, text,  whatsapp: { message_id, response_text } }
	 *   - Ambos:     { action_type, emoji, text, whatsapp: { message_id, reaction_emoji, response_text } }
	 */
	private buildCombinedReactionTextPayload(
		emoji: string,
		text: string | undefined,
		targetMessageId: string,
		channel: string,
	): SynchronousResponse {
		const basePayload: Record<string, unknown> = {
			action_type: "button_reaction",
		};
		if (emoji) basePayload.emoji = emoji;
		if (text) basePayload.text = text;

		const channelPayload: Record<string, unknown> = {
			message_id: targetMessageId,
		};
		if (emoji) channelPayload.reaction_emoji = emoji;
		if (text) channelPayload.response_text = text;

		if (channel === "instagram") {
			return { ...basePayload, instagram: channelPayload } as SynchronousResponse;
		}
		if (channel === "facebook") {
			return { ...basePayload, facebook: channelPayload } as SynchronousResponse;
		}
		return { ...basePayload, whatsapp: channelPayload } as SynchronousResponse;
	}

	private async handleInteractiveMessage(
		node: RuntimeFlowNode,
		flow: RuntimeFlow,
		bridge: SyncBridge,
		directlyAfterButton = false,
	): Promise<string> {
		const config = node.config as {
			interactivePayload?: Record<string, unknown>;
			elements?: InteractiveMessageElement[];
			body?: string;
			header?: string;
			footer?: string;
			buttons?: Array<{ id: string; title: string }>;
		};

		// Verificar se há REACTION pendente
		const pendingReaction = bridge.consumePendingReaction();
		if (pendingReaction) {
			log.debug("[FlowExecutor] INTERACTIVE_MESSAGE: consumindo reação pendente", {
				emoji: pendingReaction.emoji,
			});
			// Enviar reação via API (não pode combinar com interactive)
			await this.delivery.deliver(this.context, {
				type: "reaction",
				emoji: pendingReaction.emoji,
				targetMessageId: pendingReaction.targetMessageId,
			});
		}

		// Se tem elements, SEMPRE converter para campos legados
		let effectiveConfig = config;
		if (config.elements?.length) {
			const legacy = elementsToLegacyFields(config.elements);
			effectiveConfig = {
				...config,
				body: legacy.body,
				header: legacy.header,
				footer: legacy.footer,
				buttons: legacy.buttons,
			};
			log.debug("[FlowExecutor] INTERACTIVE_MESSAGE: converteu elements", {
				buttonsCount: legacy.buttons?.length ?? 0,
				buttonTitles: legacy.buttons?.map((b) => b.title),
			});
		}

		const resolvedPayload = effectiveConfig.interactivePayload
			? JSON.parse(this.resolver.resolve(JSON.stringify(effectiveConfig.interactivePayload)))
			: this.buildInteractivePayload(effectiveConfig);

		await this.deliver(bridge, { type: "interactive", interactivePayload: resolvedPayload });

		// Se tem botões, STOP e espera resposta
		const hasButtons = effectiveConfig.buttons?.length || (resolvedPayload as Record<string, unknown>)?.action;
		if (hasButtons) {
			return "WAITING_INPUT";
		}

		return this.findNextNodeId(flow, node);
	}

	/**
	 * Handler para Quick Replies (Instagram/Facebook)
	 * Gera mensagem com até 13 quick reply buttons
	 */
	private async handleQuickReplies(node: RuntimeFlowNode, flow: RuntimeFlow, bridge: SyncBridge): Promise<string> {
		const config = node.config as {
			promptText?: string;
			quickReplies?: Array<{ id: string; title: string; payload?: string; imageUrl?: string }>;
		};

		const promptText = this.resolver.resolve(config.promptText ?? "");
		const quickReplies = config.quickReplies ?? [];

		// Build Instagram Quick Replies payload
		const payload = {
			text: promptText,
			quick_replies: quickReplies.map((qr) => ({
				content_type: "text",
				title: qr.title,
				payload: qr.id, // Use ID as payload for flow routing
				image_url: qr.imageUrl,
			})),
		};

		log.debug("[FlowExecutor] QUICK_REPLIES", {
			promptText: promptText.slice(0, 50),
			quickRepliesCount: quickReplies.length,
		});

		await this.deliver(bridge, {
			type: "interactive",
			interactivePayload: { instagram: payload },
		});

		// Quick replies sempre esperam input do usuário
		return "WAITING_INPUT";
	}

	/**
	 * Handler para Carousel (Generic Template - Instagram/Facebook)
	 * Gera mensagem com até 10 cards
	 */
	private async handleCarousel(node: RuntimeFlowNode, flow: RuntimeFlow, bridge: SyncBridge): Promise<string> {
		const config = node.config as {
			cards?: Array<{
				id: string;
				title: string;
				subtitle?: string;
				imageUrl?: string;
				defaultAction?: { type: "web_url"; url: string };
				buttons?: Array<{
					id: string;
					type: "web_url" | "postback";
					title: string;
					url?: string;
					payload?: string;
				}>;
			}>;
		};

		const cards = config.cards ?? [];

		// Build Instagram Generic Template payload
		const payload = {
			attachment: {
				type: "template",
				payload: {
					template_type: "generic",
					elements: cards.map((card) => ({
						title: this.resolver.resolve(card.title),
						subtitle: card.subtitle ? this.resolver.resolve(card.subtitle) : undefined,
						image_url: card.imageUrl,
						default_action: card.defaultAction,
						buttons: card.buttons?.map((btn) => ({
							type: btn.type,
							title: btn.title,
							url: btn.type === "web_url" ? btn.url : undefined,
							payload: btn.type === "postback" ? btn.id : undefined,
						})),
					})),
				},
			},
		};

		log.debug("[FlowExecutor] CAROUSEL", {
			cardsCount: cards.length,
		});

		await this.deliver(bridge, {
			type: "interactive",
			interactivePayload: { instagram: payload },
		});

		// Verifica se algum card tem botão postback (espera input)
		const hasPostbackButton = cards.some((card) => card.buttons?.some((btn) => btn.type === "postback"));

		if (hasPostbackButton) {
			return "WAITING_INPUT";
		}

		return this.findNextNodeId(flow, node);
	}

	/**
	 * Handler para Template WhatsApp Oficial
	 * Envia templates aprovados pela Meta com resolução de variáveis
	 */
	private async handleTemplate(
		node: RuntimeFlowNode,
		flow: RuntimeFlow,
		bridge: SyncBridge,
		_directlyAfterButton = false,
	): Promise<string> {
		const config = node.config as unknown as TemplateNodeData & {
			runtimeMediaUrl?: string;
			runtimeVariables?: Record<string, string>;
			runtimeButtonParams?: Record<number, { couponCode?: string }>;
		};

		// Verificar se o template está aprovado
		if (config.status !== "APPROVED") {
			log.warn("[FlowExecutor] TEMPLATE não aprovado, pulando", {
				nodeId: node.id,
				status: config.status,
				templateName: config.templateName,
			});
			return this.findNextNodeId(flow, node);
		}

		// Verificar se tem nome do template
		if (!config.templateName) {
			log.warn("[FlowExecutor] TEMPLATE sem nome, pulando", { nodeId: node.id });
			return this.findNextNodeId(flow, node);
		}

		// Resolver variáveis do body (usa runtimeVariables como override)
		const variableValues: Record<string, string> = {};
		const bodyVariables = config.body?.variables ?? [];
		for (const varName of bodyVariables) {
			// Prioridade: runtimeVariables > contexto do flow
			const runtimeValue = config.runtimeVariables?.[varName];
			variableValues[varName] = runtimeValue || this.resolver.resolve(`{{${varName}}}`);
		}

		// Resolver variáveis do header (se TEXT)
		const headerVariables = config.header?.variables ?? [];
		for (const varName of headerVariables) {
			const runtimeValue = config.runtimeVariables?.[varName];
			variableValues[varName] = runtimeValue || this.resolver.resolve(`{{${varName}}}`);
		}

		// Override mediaUrl do header se tiver runtimeMediaUrl
		let effectiveConfig = config;
		if (config.runtimeMediaUrl && config.header) {
			effectiveConfig = {
				...config,
				header: {
					...config.header,
					mediaUrl: config.runtimeMediaUrl,
				},
			};
		}

		// Override couponCode dos botões se tiver runtimeButtonParams
		if (config.runtimeButtonParams && config.buttons) {
			effectiveConfig = {
				...effectiveConfig,
				buttons: effectiveConfig.buttons?.map((btn, idx) => {
					const runtimeParams = config.runtimeButtonParams?.[idx];
					if (btn.type === "COPY_CODE" && runtimeParams?.couponCode) {
						return { ...btn, exampleCode: runtimeParams.couponCode };
					}
					return btn;
				}),
			};
		}

		// Construir payload do template
		const templatePayload = buildTemplateDispatchPayload(effectiveConfig, this.context.contactPhone ?? "", variableValues);

		log.debug("[FlowExecutor] TEMPLATE", {
			templateName: config.templateName,
			variablesResolved: Object.keys(variableValues).length,
			hasButtons: (config.buttons?.length ?? 0) > 0,
			hasRuntimeOverrides: !!(config.runtimeMediaUrl || config.runtimeVariables || config.runtimeButtonParams),
		});

		// Enviar template via delivery service
		await this.deliver(bridge, {
			type: "template",
			templatePayload: templatePayload as unknown as Record<string, unknown>,
		});

		// Verificar se tem botões QUICK_REPLY (espera input)
		const hasQuickReplyButtons = config.buttons?.some((btn) => btn.type === "QUICK_REPLY");

		if (hasQuickReplyButtons) {
			return "WAITING_INPUT";
		}

		return this.findNextNodeId(flow, node);
	}

	private async handleMedia(node: RuntimeFlowNode, flow: RuntimeFlow, bridge: SyncBridge): Promise<string> {
		const config = node.config as unknown as MediaConfig;
		const mediaUrl = this.resolver.resolve(config.mediaUrl);
		const caption = config.caption ? this.resolver.resolve(config.caption) : undefined;

		// Mídia SEMPRE via API (não cabe na ponte)
		await this.delivery.deliver(this.context, {
			type: "media",
			mediaUrl,
			filename: config.filename,
			content: caption,
		});

		return this.findNextNodeId(flow, node);
	}

	private async handleDelay(node: RuntimeFlowNode, flow: RuntimeFlow): Promise<string> {
		const config = node.config as unknown as DelayConfig;
		const delayMs = Math.max(0, Math.min(config.delayMs, 30_000));

		log.debug("[FlowExecutor] DELAY", { delayMs });
		await new Promise((resolve) => setTimeout(resolve, delayMs));

		return this.findNextNodeId(flow, node);
	}

	private async handleCondition(node: RuntimeFlowNode, flow: RuntimeFlow): Promise<string> {
		const config = node.config as unknown as ConditionConfig;
		const actualValue = this.resolver.resolve(`{{${config.variable}}}`);
		const expectedValue = this.resolver.resolve(config.value);

		const result = this.evaluateCondition(actualValue, config.operator, expectedValue);
		const branch = result ? "true" : "false";

		const edge = flow.edges.find((e) => e.sourceNodeId === node.id && e.conditionBranch === branch);

		if (!edge) {
			log.warn("[FlowExecutor] CONDITION sem edge para branch", { nodeId: node.id, branch });
			return "END";
		}

		return edge.targetNodeId;
	}

	private async handleSetVariable(node: RuntimeFlowNode, flow: RuntimeFlow): Promise<string> {
		const config = node.config as unknown as SetVariableConfig;
		const resolvedValue = this.resolver.resolve(config.expression);
		this.resolver.setVariable(config.variableName, resolvedValue);

		log.debug("[FlowExecutor] SET_VARIABLE", { variable: config.variableName, value: resolvedValue });

		return this.findNextNodeId(flow, node);
	}

	private async handleHttpRequest(node: RuntimeFlowNode, flow: RuntimeFlow): Promise<string> {
		const config = node.config as unknown as HttpRequestConfig;
		const url = this.resolver.resolve(config.url);
		const body = config.body ? this.resolver.resolve(config.body) : undefined;
		const headers = config.headers ? this.resolver.resolveObject(config.headers) : undefined;
		const timeoutMs = config.timeoutMs ?? 10_000;

		try {
			const { default: axios } = await import("axios");
			const response = await axios({
				method: config.method,
				url,
				headers,
				data: body ? JSON.parse(body) : undefined,
				timeout: timeoutMs,
			});

			if (config.responseVariable) {
				this.resolver.setVariable(config.responseVariable, response.data);
			}
			log.debug("[FlowExecutor] HTTP_REQUEST OK", { url, status: response.status });
		} catch (err) {
			log.error("[FlowExecutor] HTTP_REQUEST falhou", {
				url,
				error: err instanceof Error ? err.message : String(err),
			});
			if (config.responseVariable) {
				this.resolver.setVariable(config.responseVariable, null);
			}
		}

		return this.findNextNodeId(flow, node);
	}

	private async handleTag(node: RuntimeFlowNode, flow: RuntimeFlow, action: "ADD_TAG" | "REMOVE_TAG"): Promise<string> {
		const config = node.config as unknown as TagConfig;
		const tagName = this.resolver.resolve(config.tagName);
		log.debug(`[FlowExecutor] ${action}`, { tagName });
		return this.findNextNodeId(flow, node);
	}

	private async handleTransfer(node: RuntimeFlowNode, flow: RuntimeFlow): Promise<string> {
		const config = node.config as TransferConfig;

		if (config.internalNote) {
			const noteText = this.resolver.resolve(config.internalNote);
			await this.delivery.deliverText(this.context, noteText, true);
		}

		log.debug("[FlowExecutor] TRANSFER", {
			assigneeId: config.assigneeId,
			assigneeType: config.assigneeType,
		});

		return this.findNextNodeId(flow, node);
	}

	private async handleReaction(
		node: RuntimeFlowNode,
		flow: RuntimeFlow,
		bridge: SyncBridge,
		directlyAfterButton = false,
	): Promise<string> {
		const config = node.config as { emoji?: string; text?: string };
		const channel = this.context.channelType;
		const wamid = this.context.sourceMessageId;

		if (config.emoji) {
			if (directlyAfterButton && wamid) {
				// Armazenar para combinar com próximo TEXT
				const reactionEmoji = channel === "instagram" ? "❤️" : config.emoji;
				bridge.setPendingReaction(reactionEmoji, wamid);
				log.debug("[FlowExecutor] REACTION armazenada como pendente", { emoji: reactionEmoji });
			} else {
				// Enviar emoji como texto via API
				await this.delivery.deliver(this.context, { type: "text", content: config.emoji });
			}
		}

		if (config.text) {
			const text = this.resolver.resolve(config.text);
			await this.delivery.deliver(this.context, { type: "text", content: text });
		}

		return this.findNextNodeId(flow, node);
	}

	// ---------------------------------------------------------------------------
	// deliver — decide sync ou async
	// ---------------------------------------------------------------------------

	private async deliver(bridge: SyncBridge, payload: DeliveryPayload): Promise<void> {
		// Mídia nunca na ponte
		if (payload.type === "media") {
			await this.delivery.deliver(this.context, payload);
			return;
		}

		// Se ponte ainda disponível, usa
		if (bridge.canSync()) {
			bridge.setSyncPayload(this.toSyncResponse(payload));
			return;
		}

		// Ponte já fechou → API
		await this.delivery.deliver(this.context, payload);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private toSyncResponse(payload: DeliveryPayload): SynchronousResponse {
		if (payload.type === "text" && payload.contextMessageId) {
			const channel = this.context.channelType;
			if (channel === "whatsapp") {
				return {
					whatsapp: {
						type: "text",
						text: { body: payload.content ?? "" },
						context: { message_id: payload.contextMessageId },
					},
				};
			}
			if (channel === "instagram") {
				return {
					instagram: {
						message: { text: payload.content ?? "" },
						reply_to: { mid: payload.contextMessageId },
					},
				};
			}
			return { text: payload.content };
		}

		if (payload.type === "interactive") {
			const channel = this.context.channelType;
			if (channel === "whatsapp") {
				return {
					whatsapp: {
						type: "interactive",
						interactive: payload.interactivePayload,
					},
				};
			}
			if (channel === "instagram" || channel === "facebook") {
				return { [channel]: payload.interactivePayload };
			}
			return {
				whatsapp: {
					type: "interactive",
					interactive: payload.interactivePayload,
				},
			};
		}

		return { text: payload.content };
	}

	private buildInteractivePayload(config: {
		body?: string;
		header?: string;
		footer?: string;
		buttons?: Array<{ id: string; title: string }>;
	}): Record<string, unknown> {
		const payload: Record<string, unknown> = {
			type: "button",
			body: { text: this.resolver.resolve(config.body ?? "") },
		};

		if (config.header) {
			payload.header = { type: "text", text: this.resolver.resolve(config.header) };
		}
		if (config.footer) {
			payload.footer = { text: this.resolver.resolve(config.footer) };
		}
		if (config.buttons?.length) {
			// Dedup títulos — WhatsApp rejeita botões com mesmo título
			const seenTitles = new Map<string, number>();
			payload.action = {
				buttons: config.buttons.map((b) => {
					let title = this.resolver.resolve(b.title);
					const normalizedTitle = title.trim();
					const count = seenTitles.get(normalizedTitle) ?? 0;
					seenTitles.set(normalizedTitle, count + 1);
					if (count > 0) {
						title = `${normalizedTitle} (${count + 1})`;
						console.warn(
							`[FlowExecutor] Título de botão duplicado detectado: "${normalizedTitle}" → renomeado para "${title}"`,
						);
					}
					return {
						type: "reply",
						reply: { id: b.id, title },
					};
				}),
			};
		}

		return payload;
	}

	private findNextNodeId(flow: RuntimeFlow, node: RuntimeFlowNode): string {
		const edge = flow.edges.find((e) => e.sourceNodeId === node.id && !e.buttonId && !e.conditionBranch);
		return edge?.targetNodeId ?? "END";
	}

	private evaluateCondition(actual: string, operator: ConditionConfig["operator"], expected: string): boolean {
		switch (operator) {
			case "eq":
				return actual === expected;
			case "neq":
				return actual !== expected;
			case "contains":
				return actual.includes(expected);
			case "not_contains":
				return !actual.includes(expected);
			case "gt":
				return Number(actual) > Number(expected);
			case "lt":
				return Number(actual) < Number(expected);
			case "exists":
				return actual !== "" && actual !== `{{${expected}}}`;
			case "not_exists":
				return actual === "" || actual === `{{${expected}}}`;
			default:
				return false;
		}
	}

	private pushLog(
		node: RuntimeFlowNode,
		startTime: number,
		deliveryMode: "sync" | "async",
		result: "ok" | "error" | "skipped",
		detail?: string,
	): void {
		this.executionLog.push({
			nodeId: node.id,
			nodeType: node.nodeType as FlowNodeType,
			timestamp: startTime,
			durationMs: Date.now() - startTime,
			deliveryMode,
			result,
			detail,
		});
	}
}
