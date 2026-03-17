/**
 * FlowOrchestrator — Endpoint unificado de entrada
 *
 * Recebe webhooks do Chatwit, decide se é um novo fluxo ou
 * continuação de sessão (clique de botão), e executa o flow.
 *
 * Modelo simples:
 *   - Primeira mensagem interativa → resposta síncrona (ponte HTTP)
 *   - Chatwoot fecha a ponte automaticamente ao receber
 *   - Tudo depois → async via API Chatwit
 *
 * @see docs/interative_message_flow_builder.md §14.2
 */

import log from "@/lib/log";
import { SyncBridge } from "./sync-bridge";
import { FlowExecutor } from "./flow-executor";
import { getPrismaInstance } from "@/lib/connections";
import { debugLogRuntimeFlow } from "@/lib/flow-builder/exportImport";
import { loadMtfVariablesForInbox } from "./mtf-variable-loader";
import type {
	ChatwitWebhookPayload,
	DeliveryContext,
	SynchronousResponse,
	RuntimeFlow,
	RuntimeFlowNode,
	FlowSessionData,
	FlowNodeType,
} from "@/types/flow-engine";

// =============================================================================
// Types
// =============================================================================

interface OrchestratorResult {
	/** Payload para responder na ponte HTTP (null = nada para retornar sync) */
	syncResponse: SynchronousResponse | null;
	/** Se o flow aguarda input (sessão fica WAITING_INPUT) */
	waitingInput: boolean;
	/** Se houve erro */
	error?: string;
	/** Se um flow foi efetivamente processado (true = não cair no LLM) */
	handled?: boolean;
}

// =============================================================================
// FlowOrchestrator
// =============================================================================

export class FlowOrchestrator {
	constructor() {
		// SyncBridge não precisa de parâmetros — sem cronômetro, sem margem
	}

	// ---------------------------------------------------------------------------
	// Main entry point
	// ---------------------------------------------------------------------------

	/**
	 * Executa um flow diretamente pelo ID (bypass de lookup).
	 * Usado quando já sabemos qual flow executar (ex: intent mapping com flowId).
	 */
	async executeFlowById(flowId: string, deliveryContext: DeliveryContext, options?: { forceAsync?: boolean; initialVariables?: Record<string, unknown> }): Promise<OrchestratorResult> {
		const bridge = new SyncBridge(options?.forceAsync);

		try {
			const flow = await this.loadFlow(flowId);
			if (!flow) {
				log.warn("[FlowOrchestrator] Flow não encontrado para execução direta", { flowId });
				return {
					syncResponse: null,
					waitingInput: false,
					error: `Flow ${flowId} não encontrado ou inativo`,
				};
			}

			log.info("[FlowOrchestrator] Executando flow por ID", {
				flowId,
				flowName: flow.name,
				conversationId: deliveryContext.conversationId,
			});

			return this.executeNewFlow(flow, deliveryContext, bridge, options?.initialVariables);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			log.error("[FlowOrchestrator] Erro ao executar flow por ID", { flowId, error: errorMsg });
			return { syncResponse: null, waitingInput: false, error: errorMsg };
		}
	}

	async handle(payload: ChatwitWebhookPayload, deliveryContext: DeliveryContext): Promise<OrchestratorResult> {
		const bridge = new SyncBridge();

		try {
			// 2. Extrair buttonId (se for clique de botão)
			const buttonId = this.extractButtonId(payload);

			// 3. CAMINHO PRINCIPAL: buttonId é a fonte da verdade
			// O buttonId (ex: flow_button_1771834377097_0cfs12) é único na FlowEdge.
			// Usamos ele diretamente para encontrar a sessão — sem depender de conversationId.
			if (buttonId) {
				const sessionByEdge = await this.findSessionByButtonId(buttonId);
				if (sessionByEdge) {
					return this.resumeSession(sessionByEdge, buttonId, deliveryContext, bridge);
				}

				// Fallback: buscar por conversationId/contactId (botões de interactive message normal)
				const session = await this.findActiveSession(deliveryContext);
				if (session) {
					return this.resumeSession(session, buttonId, deliveryContext, bridge);
				}
			}

			// 3.5 FALLBACK: Template QUICK_REPLY text-match
			// Quando o Chatwit não parseia o payload do botão QUICK_REPLY de template,
			// a mensagem chega como texto puro. Tentamos match pelo texto do botão.
			if (!buttonId) {
				const messageText = payload.text || payload.message?.content || "";
				if (messageText) {
					const matchedButtonId = await this.tryTemplateTextMatch(messageText, deliveryContext);
					if (matchedButtonId) {
						const sessionByEdge = await this.findSessionByButtonId(matchedButtonId);
						if (sessionByEdge) {
							log.info("[FlowOrchestrator] Template QUICK_REPLY resumido via text-match", {
								messageText,
								matchedButtonId,
								sessionId: sessionByEdge.id,
							});
							return this.resumeSession(sessionByEdge, matchedButtonId, deliveryContext, bridge);
						}
					}
				}
			}

			// 3.6 FREE-TEXT DISPATCH: Coleta de texto livre (WAIT_FOR_REPLY)
			// Se não é botão, verificar se há sessão WAITING_INPUT com _waitType=free_text
			if (!buttonId) {
				const messageText = payload.text || payload.message?.content || "";
				if (messageText) {
					const session = await this.findActiveSession(deliveryContext);
					if (session?.variables?._waitType === "free_text") {
						log.info("[FlowOrchestrator] WAIT_FOR_REPLY: resumindo via texto livre", {
							sessionId: session.id,
							textPreview: messageText.slice(0, 30),
						});
						return this.resumeFreeTextSession(session, messageText, deliveryContext, bridge);
					}
				}
			}

			// 4. Buscar mapeamento de intent → flow
			const flowId = await this.findFlowForMessage(payload, deliveryContext);
			if (!flowId) {
				log.debug("[FlowOrchestrator] Nenhum flow encontrado para esta mensagem");
				return { syncResponse: null, waitingInput: false };
			}

			// 5. Carregar e executar flow
			const flow = await this.loadFlow(flowId);
			if (!flow) {
				return {
					syncResponse: null,
					waitingInput: false,
					error: `Flow ${flowId} não encontrado`,
				};
			}

			return this.executeNewFlow(flow, deliveryContext, bridge);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			log.error("[FlowOrchestrator] Erro no handle", { error: errorMsg });
			return { syncResponse: null, waitingInput: false, error: errorMsg };
		}
	}

	// ---------------------------------------------------------------------------
	// Execute new flow
	// ---------------------------------------------------------------------------

	private async executeNewFlow(
		flow: RuntimeFlow,
		ctx: DeliveryContext,
		bridge: SyncBridge,
		initialVariables?: Record<string, unknown>,
	): Promise<OrchestratorResult> {
		// DEBUG: Log do grafo de conexões quando DEBUG=1
		debugLogRuntimeFlow(flow, `FlowOrchestrator.executeNewFlow() - conversationId: ${ctx.conversationId}`);

		// Guard: alertar se conversationId é 0 (indica problema na resolução)
		if (!ctx.conversationId || String(ctx.conversationId) === "0") {
			log.warn("[FlowOrchestrator] ⚠️ conversationId é 0 ou ausente — sessão pode não ser localizável depois", {
				flowId: flow.id,
				contactId: ctx.contactId,
				inboxId: ctx.inboxId,
				conversationDisplayId: ctx.conversationDisplayId,
			});
		}

		// Pre-load MTF Diamante variables (lote_ativo, chave_pix, etc.)
		let mtfVars: Record<string, string> = {};
		if (ctx.prismaInboxId) {
			mtfVars = await loadMtfVariablesForInbox(ctx.prismaInboxId);
		}

		// Merge: MTF vars (lowest) → nome_lead default → explicit initialVariables (highest)
		const mergedVariables: Record<string, unknown> = {
			...mtfVars,
			nome_lead: ctx.contactName || "",
			...(initialVariables ?? {}),
		};

		const prisma = getPrismaInstance();
		const executor = new FlowExecutor(ctx, mergedVariables);

		// Criar sessão
		const session = await prisma.flowSession.create({
			data: {
				flowId: flow.id,
				conversationId: String(ctx.conversationId),
				contactId: String(ctx.contactId),
				inboxId: ctx.prismaInboxId || String(ctx.inboxId),
				status: "ACTIVE",
				variables: {},
				executionLog: [],
			},
		});

		const result = await executor.execute(flow, bridge);

		// Atualizar sessão
		await prisma.flowSession.update({
			where: { id: session.id },
			data: {
				status: result.status,
				currentNodeId: result.currentNodeId ?? null,
				variables: result.variables as object,
				executionLog: result.executionLog as object[],
				completedAt: result.status === "COMPLETED" ? new Date() : null,
			},
		});

		const syncResponse = bridge.consumeSyncPayload();

		return {
			syncResponse,
			waitingInput: result.status === "WAITING_INPUT",
			error: result.status === "ERROR" ? "Erro na execução do flow" : undefined,
			handled: true,
		};
	}

	// ---------------------------------------------------------------------------
	// Resume session (botão clicado)
	// ---------------------------------------------------------------------------

	private async resumeSession(
		session: FlowSessionData,
		buttonId: string,
		ctx: DeliveryContext,
		bridge: SyncBridge,
	): Promise<OrchestratorResult> {
		const prisma = getPrismaInstance();

		const flow = await this.loadFlow(session.flowId);
		if (!flow) {
			return {
				syncResponse: null,
				waitingInput: false,
				error: `Flow ${session.flowId} não encontrado`,
			};
		}

		// DEBUG: Log do grafo de conexões quando DEBUG=1
		debugLogRuntimeFlow(flow, `FlowOrchestrator.resumeSession(${buttonId}) - sessionId: ${session.id}`);

		const executor = new FlowExecutor(ctx, session.variables);
		const result = await executor.resumeFromButton(flow, session, buttonId, bridge);

		// Atualizar sessão
		await prisma.flowSession.update({
			where: { id: session.id },
			data: {
				status: result.status,
				currentNodeId: result.currentNodeId ?? null,
				variables: result.variables as object,
				executionLog: result.executionLog as object[],
				completedAt: result.status === "COMPLETED" ? new Date() : null,
			},
		});

		const syncResponse = bridge.consumeSyncPayload();

		return {
			syncResponse,
			waitingInput: result.status === "WAITING_INPUT",
			error: result.status === "ERROR" ? "Erro ao retomar flow" : undefined,
			handled: true,
		};
	}

	// ---------------------------------------------------------------------------
	// Resume free-text session (WAIT_FOR_REPLY)
	// ---------------------------------------------------------------------------

	private async resumeFreeTextSession(
		session: FlowSessionData,
		userText: string,
		ctx: DeliveryContext,
		bridge: SyncBridge,
	): Promise<OrchestratorResult> {
		const prisma = getPrismaInstance();

		const flow = await this.loadFlow(session.flowId);
		if (!flow) {
			return {
				syncResponse: null,
				waitingInput: false,
				error: `Flow ${session.flowId} não encontrado`,
			};
		}

		const executor = new FlowExecutor(ctx, session.variables);
		const result = await executor.resumeFromFreeText(flow, session, userText, bridge);

		await prisma.flowSession.update({
			where: { id: session.id },
			data: {
				status: result.status,
				currentNodeId: result.currentNodeId ?? null,
				variables: result.variables as object,
				executionLog: result.executionLog as object[],
				completedAt: result.status === "COMPLETED" ? new Date() : null,
			},
		});

		const syncResponse = bridge.consumeSyncPayload();

		return {
			syncResponse,
			waitingInput: result.status === "WAITING_INPUT",
			error: result.status === "ERROR" ? "Erro ao retomar flow (free-text)" : undefined,
			handled: true,
		};
	}

	// ---------------------------------------------------------------------------
	// Database queries
	// ---------------------------------------------------------------------------

	/**
	 * Busca FlowSession diretamente pelo buttonId da FlowEdge.
	 * O buttonId é único e aponta para flow + sourceNode.
	 * Não depende de conversationId — resolve o bug de sessions com conversationId "0".
	 */
	private async findSessionByButtonId(buttonId: string): Promise<FlowSessionData | null> {
		const prisma = getPrismaInstance();

		// 1. Buscar a FlowEdge pelo buttonId
		const edge = await prisma.flowEdge.findFirst({
			where: { buttonId },
			select: { flowId: true, sourceNodeId: true },
		});

		if (!edge) return null;

		// 2. Buscar FlowSession WAITING_INPUT no nó de origem desta edge
		const session = await prisma.flowSession.findFirst({
			where: {
				flowId: edge.flowId,
				currentNodeId: edge.sourceNodeId,
				status: "WAITING_INPUT",
			},
			orderBy: { updatedAt: "desc" },
		});

		if (!session) return null;

		log.info("[FlowOrchestrator] Sessão encontrada via buttonId → FlowEdge", {
			buttonId,
			sessionId: session.id,
			flowId: edge.flowId,
			sourceNodeId: edge.sourceNodeId,
			conversationId: session.conversationId,
		});

		return {
			id: session.id,
			flowId: session.flowId,
			conversationId: session.conversationId,
			contactId: session.contactId,
			inboxId: session.inboxId,
			status: session.status as FlowSessionData["status"],
			currentNodeId: session.currentNodeId,
			variables: (session.variables as Record<string, unknown>) ?? {},
			executionLog: (session.executionLog as unknown as FlowSessionData["executionLog"]) ?? [],
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			completedAt: session.completedAt,
		};
	}

	private async findActiveSession(ctx: DeliveryContext): Promise<FlowSessionData | null> {
		const prisma = getPrismaInstance();
		const inboxId = ctx.prismaInboxId || String(ctx.inboxId);

		// 1. Buscar por conversationId (caminho principal)
		let session = ctx.conversationId
			? await prisma.flowSession.findFirst({
					where: {
						conversationId: String(ctx.conversationId),
						inboxId,
						status: "WAITING_INPUT",
					},
					orderBy: { updatedAt: "desc" },
				})
			: null;

		// 2. Fallback: buscar por contactId (cobre casos onde conversationId mudou ou era "0")
		if (!session && ctx.contactId) {
			session = await prisma.flowSession.findFirst({
				where: {
					contactId: String(ctx.contactId),
					inboxId,
					status: "WAITING_INPUT",
				},
				orderBy: { updatedAt: "desc" },
			});

			if (session) {
				log.info("[FlowOrchestrator] Sessão encontrada via contactId fallback", {
					sessionId: session.id,
					sessionConversationId: session.conversationId,
					expectedConversationId: String(ctx.conversationId),
					contactId: String(ctx.contactId),
				});

				// Atualizar conversationId da sessão para evitar mismatch futuro
				if (ctx.conversationId && String(ctx.conversationId) !== "0") {
					await prisma.flowSession.update({
						where: { id: session.id },
						data: { conversationId: String(ctx.conversationId) },
					});
				}
			}
		}

		if (!session) return null;

		return {
			id: session.id,
			flowId: session.flowId,
			conversationId: session.conversationId,
			contactId: session.contactId,
			inboxId: session.inboxId,
			status: session.status as FlowSessionData["status"],
			currentNodeId: session.currentNodeId,
			variables: (session.variables as Record<string, unknown>) ?? {},
			executionLog: (session.executionLog as unknown as FlowSessionData["executionLog"]) ?? [],
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			completedAt: session.completedAt,
		};
	}

	private async loadFlow(flowId: string): Promise<RuntimeFlow | null> {
		const prisma = getPrismaInstance();

		const flow = await prisma.flow.findUnique({
			where: { id: flowId },
			include: {
				nodes: true,
				edges: true,
			},
		});

		if (!flow || !flow.isActive) return null;

		return {
			id: flow.id,
			name: flow.name,
			inboxId: flow.inboxId,
			nodes: flow.nodes.map(
				(n): RuntimeFlowNode => ({
					id: n.id,
					nodeType: n.nodeType as FlowNodeType,
					config: (n.config as Record<string, unknown>) ?? {},
				}),
			),
			edges: flow.edges.map((e) => ({
				id: e.id,
				sourceNodeId: e.sourceNodeId,
				targetNodeId: e.targetNodeId,
				buttonId: e.buttonId,
				conditionBranch: e.conditionBranch,
			})),
		};
	}

	/**
	 * Busca um flow mapeado para a mensagem recebida.
	 * Procura primeiro por intent mapping, depois por botão com START_FLOW.
	 */
	private async findFlowForMessage(payload: ChatwitWebhookPayload, ctx: DeliveryContext): Promise<string | null> {
		const prisma = getPrismaInstance();

		// 1. Verificar se um MapeamentoBotao do tipo START_FLOW existe para o botão clicado
		const buttonId = this.extractButtonId(payload);
		if (buttonId) {
			const mapping = await prisma.mapeamentoBotao.findUnique({
				where: { buttonId },
			});

			if (mapping?.actionType === "START_FLOW") {
				const actionPayload = mapping.actionPayload as Record<string, unknown>;
				return (actionPayload?.flowId as string) ?? null;
			}
		}

		// 2. Buscar MapeamentoIntencao com flowId associado
		// O intent pode vir via payload.intent_name ou payload.detected_intent
		const intentName =
			((payload as Record<string, unknown>).intent_name as string | undefined) ||
			((payload as Record<string, unknown>).detected_intent as string | undefined);

		// Usar prismaInboxId (ID interno do Prisma) em vez do numérico externo
		const inboxIdStr = ctx.prismaInboxId || String(ctx.inboxId);

		if (intentName && inboxIdStr) {
			const intentMapping = await prisma.mapeamentoIntencao.findFirst({
				where: {
					intentName,
					inboxId: inboxIdStr,
					flowId: { not: null },
				},
				select: { flowId: true },
			});

			if (intentMapping?.flowId) {
				log.debug("[FlowOrchestrator] Flow encontrado via intent mapping", {
					intentName,
					flowId: intentMapping.flowId,
				});
				return intentMapping.flowId;
			}
		}

		return null;
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private extractButtonId(payload: ChatwitWebhookPayload): string | null {
		// Clique de quick reply / button
		const buttonReply = payload.content_attributes?.button_reply;
		if (buttonReply?.id) return buttonReply.id;

		// Clique de item de lista
		const listReply = payload.content_attributes?.list_reply;
		if (listReply?.id) return listReply.id;

		// Fallback: content_attributes na mensagem
		const msgAttrs = payload.message?.content_attributes as Record<string, unknown> | undefined;
		if (msgAttrs?.button_reply) {
			const br = msgAttrs.button_reply as { id?: string };
			if (br.id) return br.id;
		}

		// Fallback: button_id direto no metadata (formato Chatwit)
		const metadata = payload.metadata as Record<string, unknown> | undefined;
		if (metadata?.button_id && typeof metadata.button_id === "string") {
			return metadata.button_id;
		}

		// Fallback: postback_payload (Instagram/Facebook)
		if (msgAttrs?.postback_payload && typeof msgAttrs.postback_payload === "string") {
			return msgAttrs.postback_payload;
		}

		// Fallback: quick_reply_payload (Instagram/Facebook)
		if (msgAttrs?.quick_reply_payload && typeof msgAttrs.quick_reply_payload === "string") {
			return msgAttrs.quick_reply_payload;
		}

		return null;
	}

	/**
	 * FALLBACK: Tenta mapear texto puro → buttonId de template QUICK_REPLY.
	 *
	 * Quando o Chatwit não parseia o payload do botão QUICK_REPLY de template,
	 * a mensagem chega como texto puro (ex: "Fui aprovado(a)!").
	 * Este método verifica se há uma FlowSession WAITING_INPUT em um nó TEMPLATE
	 * e tenta fazer match exato do texto com os labels dos botões QUICK_REPLY.
	 *
	 * Este fallback será removido quando o Chatwit implementar parsing de button.payload.
	 * @see docs/TEMPLATE-BUTTONS-FLOW-RESUME.md
	 */
	private async tryTemplateTextMatch(messageText: string, ctx: DeliveryContext): Promise<string | null> {
		const prisma = getPrismaInstance();

		// 1. Buscar sessão WAITING_INPUT para esta conversa
		const session = await prisma.flowSession.findFirst({
			where: {
				conversationId: String(ctx.conversationId),
				inboxId: ctx.prismaInboxId || String(ctx.inboxId),
				status: "WAITING_INPUT",
			},
			orderBy: { updatedAt: "desc" },
		});

		if (!session?.currentNodeId) return null;

		// 2. Verificar se o nó atual é um TEMPLATE/WHATSAPP_TEMPLATE
		const currentNode = await prisma.flowNode.findUnique({
			where: { id: session.currentNodeId },
		});

		if (!currentNode) return null;

		const nodeType = currentNode.nodeType as string;
		if (nodeType !== "TEMPLATE" && nodeType !== "WHATSAPP_TEMPLATE") return null;

		// 3. Extrair botões QUICK_REPLY do config do nó
		const config = currentNode.config as Record<string, unknown> | null;
		const buttons = config?.buttons as Array<{ id?: string; type?: string; text?: string }> | undefined;
		if (!buttons || buttons.length === 0) return null;

		const quickReplyButtons = buttons.filter((b) => b.type === "QUICK_REPLY");
		if (quickReplyButtons.length === 0) return null;

		// 4. Match exato do texto da mensagem com o label do botão
		const normalizedMessage = messageText.trim().toLowerCase();
		const matchedButton = quickReplyButtons.find(
			(b) => b.text && b.text.trim().toLowerCase() === normalizedMessage,
		);

		if (!matchedButton) return null;

		// 5. Buscar o buttonId da edge correspondente
		// As edges saindo do template node têm buttonId (flow_button_* ou flow_tpl_btn_*)
		const templateEdges = await prisma.flowEdge.findMany({
			where: {
				sourceNodeId: session.currentNodeId,
				flowId: session.flowId,
				buttonId: { not: null },
			},
			orderBy: { id: "asc" },
		});

		if (templateEdges.length === 0) return null;

		// Mapear por índice: o N-ésimo botão QUICK_REPLY corresponde à N-ésima edge
		const buttonIndex = quickReplyButtons.indexOf(matchedButton);
		const matchedEdge = templateEdges[buttonIndex];

		if (!matchedEdge?.buttonId) return null;

		log.debug("[FlowOrchestrator] Template text-match encontrado", {
			messageText,
			matchedButtonText: matchedButton.text,
			matchedButtonId: matchedEdge.buttonId,
			nodeId: session.currentNodeId,
			sessionId: session.id,
		});

		return matchedEdge.buttonId;
	}
}
