import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { ActionType } from "@prisma/client";
import type { FlowCanvas, FlowNode, FlowEdge } from "@/types/flow-builder";
import { FlowNodeType, FLOW_CANVAS_CONSTANTS } from "@/types/flow-builder";

// =============================================================================
// TYPES
// =============================================================================

interface MessageWithButtons {
	templateId: string;
	templateName: string;
	bodyText: string;
	headerText?: string;
	footerText?: string;
	buttons: Array<{ id: string; title: string }>;
}

interface ReactionRecord {
	id: string;
	buttonId: string;
	actionType: ActionType;
	actionPayload: Record<string, unknown>;
	description: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Busca mensagens interativas com botões da inbox
 */
async function fetchMessagesWithButtons(inboxId: string): Promise<MessageWithButtons[]> {
	const prisma = getPrismaInstance();

	// Buscar templates com ActionReplyButton
	const templates = await prisma.template.findMany({
		where: {
			inboxId,
			type: "INTERACTIVE_MESSAGE",
			isActive: true,
		},
		include: {
			interactiveContent: {
				include: {
					body: true,
					header: true,
					footer: true,
					actionReplyButton: true,
					actionList: true,
				},
			},
		},
	});

	const messages: MessageWithButtons[] = [];

	for (const template of templates) {
		const ic = template.interactiveContent;
		if (!ic) continue;

		let buttons: Array<{ id: string; title: string }> = [];

		// Extrair botões de ActionReplyButton
		if (ic.actionReplyButton?.buttons) {
			const rawButtons = ic.actionReplyButton.buttons as Array<{
				id?: string;
				title?: string;
				reply?: { id?: string; title?: string };
			}>;
			buttons = rawButtons
				.map((b) => ({
					id: b.id ?? b.reply?.id ?? "",
					title: b.title ?? b.reply?.title ?? "",
				}))
				.filter((b) => b.id && b.title);
		}

		// Extrair rows de ActionList (para menus de lista)
		if (ic.actionList?.sections && buttons.length === 0) {
			const sections = ic.actionList.sections as Array<{
				rows?: Array<{ id?: string; title?: string }>;
			}>;
			for (const section of sections) {
				if (section.rows) {
					for (const row of section.rows) {
						if (row.id && row.title) {
							buttons.push({ id: row.id, title: row.title });
						}
					}
				}
			}
		}

		// Extrair de genericPayload (carrossel Instagram)
		if (ic.genericPayload && buttons.length === 0) {
			const payload = ic.genericPayload as {
				elements?: Array<{
					buttons?: Array<{ payload?: string; title?: string }>;
				}>;
			};
			if (payload.elements) {
				for (const element of payload.elements) {
					if (element.buttons) {
						for (const btn of element.buttons) {
							if (btn.payload && btn.title) {
								buttons.push({ id: btn.payload, title: btn.title });
							}
						}
					}
				}
			}
		}

		if (buttons.length > 0) {
			messages.push({
				templateId: template.id,
				templateName: template.name,
				bodyText: ic.body?.text ?? "",
				headerText: ic.header?.content,
				footerText: ic.footer?.text,
				buttons,
			});
		}
	}

	return messages;
}

/**
 * Busca reações de botões da inbox
 */
async function fetchButtonReactions(inboxId: string): Promise<ReactionRecord[]> {
	const prisma = getPrismaInstance();

	const reactions = await prisma.mapeamentoBotao.findMany({
		where: { inboxId },
	});

	return reactions.map((r) => ({
		id: r.id,
		buttonId: r.buttonId,
		actionType: r.actionType,
		actionPayload: r.actionPayload as Record<string, unknown>,
		description: r.description,
	}));
}

/**
 * Converte actionType + actionPayload para tipo de nó do Flow Builder
 */
function getNodeTypeFromReaction(
	actionType: ActionType,
	actionPayload: Record<string, unknown>,
): { type: FlowNodeType; data: Record<string, unknown> } {
	switch (actionType) {
		case ActionType.BUTTON_REACTION:
			if (actionPayload.emoji) {
				return {
					type: FlowNodeType.EMOJI_REACTION,
					data: {
						emoji: actionPayload.emoji,
						label: "Emoji",
						isConfigured: true,
					},
				};
			}
			if (actionPayload.textReaction) {
				return {
					type: FlowNodeType.TEXT_REACTION,
					data: {
						textReaction: actionPayload.textReaction,
						label: "Resposta de Texto",
						isConfigured: true,
					},
				};
			}
			if (actionPayload.action === "end_conversation") {
				return {
					type: FlowNodeType.END_CONVERSATION,
					data: {
						endMessage: actionPayload.endMessage,
						label: "Finalizar",
						isConfigured: true,
					},
				};
			}
			// Default: texto simples
			return {
				type: FlowNodeType.TEXT_REACTION,
				data: {
					textReaction: "",
					label: "Reação",
					isConfigured: false,
				},
			};

		case ActionType.SEND_TEMPLATE:
			return {
				type: FlowNodeType.INTERACTIVE_MESSAGE,
				data: {
					messageId: actionPayload.messageId ?? actionPayload.templateId,
					label: "Enviar Mensagem",
					isConfigured: !!actionPayload.messageId || !!actionPayload.templateId,
				},
			};

		case ActionType.ASSIGN_TO_AGENT:
			return {
				type: FlowNodeType.HANDOFF,
				data: {
					targetTeam: actionPayload.targetTeam,
					label: "Transferir",
					isConfigured: true,
				},
			};

		case ActionType.ADD_TAG:
			return {
				type: FlowNodeType.ADD_TAG,
				data: {
					tagName: actionPayload.tagName,
					tagColor: actionPayload.tagColor,
					label: "Tag",
					isConfigured: !!actionPayload.tagName,
				},
			};

		default:
			return {
				type: FlowNodeType.TEXT_REACTION,
				data: {
					label: "Reação",
					isConfigured: false,
				},
			};
	}
}

/**
 * Constrói canvas a partir de mensagens e reações existentes
 */
function buildCanvasFromReactions(messages: MessageWithButtons[], reactions: ReactionRecord[]): FlowCanvas {
	const nodes: FlowNode[] = [];
	const edges: FlowEdge[] = [];

	// Mapa de buttonId → reaction
	const reactionByButtonId = new Map<string, ReactionRecord>();
	for (const r of reactions) {
		reactionByButtonId.set(r.buttonId, r);
	}

	// Mapa de templateId → node ID (para mensagens que são destino de outras)
	const templateToNodeId = new Map<string, string>();

	// Layout: posições iniciais
	const startX = 300;
	const startY = 100;
	const messageSpacingY = 250;
	const reactionOffsetX = 400;
	const reactionSpacingY = 100;

	// 1. Criar nó START
	const startNodeId = `start_${Date.now()}`;
	nodes.push({
		id: startNodeId,
		type: FlowNodeType.START,
		position: { x: startX, y: startY - 150 },
		data: {
			label: "Início do Fluxo",
			isConfigured: true,
		},
	});

	// 2. Criar nós de mensagens interativas
	let messageIndex = 0;
	for (const msg of messages) {
		const nodeId = `msg_${msg.templateId}_${Date.now()}_${messageIndex}`;
		templateToNodeId.set(msg.templateId, nodeId);

		nodes.push({
			id: nodeId,
			type: FlowNodeType.INTERACTIVE_MESSAGE,
			position: {
				x: startX,
				y: startY + messageIndex * messageSpacingY,
			},
			data: {
				label: msg.templateName,
				messageId: msg.templateId,
				message: {
					id: msg.templateId,
					name: msg.templateName,
					body: { text: msg.bodyText },
					header: msg.headerText ? { type: "text" as const, text: msg.headerText } : undefined,
					footer: msg.footerText ? { text: msg.footerText } : undefined,
					action: { type: "button" as const, buttons: msg.buttons },
					type: "button" as const,
					isActive: true,
				},
				isConfigured: true,
			} as FlowNode["data"],
		});

		// Se for a primeira mensagem, conectar ao START
		if (messageIndex === 0) {
			edges.push({
				id: `edge_start_${nodeId}`,
				source: startNodeId,
				target: nodeId,
				type: "smoothstep",
			});
		}

		// 3. Criar nós de reação para cada botão
		let buttonIndex = 0;
		for (const button of msg.buttons) {
			const reaction = reactionByButtonId.get(button.id);
			if (!reaction) {
				buttonIndex++;
				continue;
			}

			const { type: reactionType, data: reactionData } = getNodeTypeFromReaction(
				reaction.actionType,
				reaction.actionPayload,
			);

			// Se o destino é outra mensagem interativa, verificar se já existe nó
			if (reactionType === FlowNodeType.INTERACTIVE_MESSAGE && reactionData.messageId) {
				const existingNodeId = templateToNodeId.get(reactionData.messageId as string);
				if (existingNodeId) {
					// Conectar ao nó existente
					edges.push({
						id: `edge_${nodeId}_${button.id}_${existingNodeId}`,
						source: nodeId,
						target: existingNodeId,
						sourceHandle: button.id,
						type: "smoothstep",
						data: { buttonId: button.id, buttonLabel: button.title },
					});
					buttonIndex++;
					continue;
				}
			}

			// Criar nó de reação
			const reactionNodeId = `reaction_${reaction.id}_${Date.now()}_${buttonIndex}`;
			nodes.push({
				id: reactionNodeId,
				type: reactionType,
				position: {
					x: startX + reactionOffsetX,
					y: startY + messageIndex * messageSpacingY + buttonIndex * reactionSpacingY,
				},
				data: reactionData as unknown as FlowNode["data"],
			});

			// Criar edge do botão para a reação
			edges.push({
				id: `edge_${nodeId}_${button.id}_${reactionNodeId}`,
				source: nodeId,
				target: reactionNodeId,
				sourceHandle: button.id,
				type: "smoothstep",
				data: { buttonId: button.id, buttonLabel: button.title },
			});

			buttonIndex++;
		}

		messageIndex++;
	}

	return {
		nodes,
		edges,
		viewport: { ...FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT },
	};
}

// =============================================================================
// POST - Importar reações existentes para o Flow Builder
// =============================================================================

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const { inboxId } = body;

		if (!inboxId) {
			return NextResponse.json({ success: false, error: "inboxId é obrigatório" }, { status: 400 });
		}

		// Verificar acesso
		const prisma = getPrismaInstance();
		const inbox = await prisma.chatwitInbox.findFirst({
			where: {
				id: inboxId,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!inbox) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Verificar se já existe canvas
		const existingCanvas = await prisma.inboxFlowCanvas.findUnique({
			where: { inboxId },
		});

		if (existingCanvas) {
			return NextResponse.json(
				{
					success: false,
					error: "Já existe um canvas para esta caixa. Remova-o antes de importar.",
				},
				{ status: 409 },
			);
		}

		// Buscar dados
		const [messages, reactions] = await Promise.all([fetchMessagesWithButtons(inboxId), fetchButtonReactions(inboxId)]);

		if (messages.length === 0 && reactions.length === 0) {
			return NextResponse.json({
				success: true,
				data: null,
				message: "Nenhuma mensagem ou reação encontrada para importar",
				stats: { messages: 0, reactions: 0, nodes: 0, edges: 0 },
			});
		}

		// Construir canvas
		const canvas = buildCanvasFromReactions(messages, reactions);

		// Salvar canvas
		const savedCanvas = await prisma.inboxFlowCanvas.create({
			data: {
				inboxId,
				canvas: canvas as unknown as object,
				version: 1,
				isActive: true,
			},
		});

		return NextResponse.json({
			success: true,
			data: {
				id: savedCanvas.id,
				inboxId: savedCanvas.inboxId,
				canvas,
				version: savedCanvas.version,
				isActive: savedCanvas.isActive,
				createdAt: savedCanvas.createdAt,
				updatedAt: savedCanvas.updatedAt,
			},
			message: "Reações importadas com sucesso",
			stats: {
				messages: messages.length,
				reactions: reactions.length,
				nodes: canvas.nodes.length,
				edges: canvas.edges.length,
			},
		});
	} catch (error) {
		console.error("[flow-canvas/import] POST error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}

// =============================================================================
// GET - Verificar se há reações para importar
// =============================================================================

export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const inboxId = searchParams.get("inboxId");

		if (!inboxId) {
			return NextResponse.json({ success: false, error: "inboxId é obrigatório" }, { status: 400 });
		}

		// Verificar acesso
		const prisma = getPrismaInstance();
		const inbox = await prisma.chatwitInbox.findFirst({
			where: {
				id: inboxId,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!inbox) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Verificar se já existe canvas
		const existingCanvas = await prisma.inboxFlowCanvas.findUnique({
			where: { inboxId },
		});

		// Contar mensagens e reações
		const [messagesCount, reactionsCount] = await Promise.all([
			prisma.template.count({
				where: {
					inboxId,
					type: "INTERACTIVE_MESSAGE",
					isActive: true,
					interactiveContent: {
						OR: [
							{ actionReplyButton: { isNot: null } },
							{ actionList: { isNot: null } },
							{ NOT: { genericPayload: { equals: undefined } } },
						],
					},
				},
			}),
			prisma.mapeamentoBotao.count({
				where: { inboxId },
			}),
		]);

		return NextResponse.json({
			success: true,
			data: {
				hasExistingCanvas: !!existingCanvas,
				canImport: !existingCanvas && (messagesCount > 0 || reactionsCount > 0),
				stats: {
					messages: messagesCount,
					reactions: reactionsCount,
				},
			},
		});
	} catch (error) {
		console.error("[flow-canvas/import] GET error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}
