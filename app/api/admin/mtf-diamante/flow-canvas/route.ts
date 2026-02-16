import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { z } from "zod";
import { ActionType, Prisma } from "@prisma/client";
import type { FlowCanvas, FlowCanvasState, FlowNode, FlowEdge } from "@/types/flow-builder";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const FlowViewportSchema = z.object({
	x: z.number(),
	y: z.number(),
	zoom: z.number().min(0.1).max(3),
});

const FlowNodeSchema = z.object({
	id: z.string().min(1),
	type: z.string(),
	position: z.object({
		x: z.number(),
		y: z.number(),
	}),
	data: z.record(z.unknown()),
	width: z.number().optional(),
	height: z.number().optional(),
	selected: z.boolean().optional(),
	dragging: z.boolean().optional(),
});

const FlowEdgeSchema = z.object({
	id: z.string().min(1),
	source: z.string().min(1),
	target: z.string().min(1),
	sourceHandle: z.string().optional(),
	targetHandle: z.string().optional(),
	data: z.record(z.unknown()).optional(),
	type: z.string().optional(),
	animated: z.boolean().optional(),
	selected: z.boolean().optional(),
});

const FlowCanvasSchema = z.object({
	nodes: z.array(FlowNodeSchema),
	edges: z.array(FlowEdgeSchema),
	viewport: FlowViewportSchema,
});

const SaveFlowCanvasSchema = z.object({
	inboxId: z.string().min(1, "inboxId é obrigatório"),
	canvas: FlowCanvasSchema,
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Formata a resposta do canvas
 */
function formatCanvasResponse(
	canvas: {
		id: string;
		inboxId: string;
		canvas: unknown;
		version: number;
		isActive: boolean;
		createdAt: Date;
		updatedAt: Date;
	} | null,
): FlowCanvasState | null {
	if (!canvas) return null;

	return {
		id: canvas.id,
		inboxId: canvas.inboxId,
		canvas: canvas.canvas as FlowCanvas,
		version: canvas.version,
		isActive: canvas.isActive,
		createdAt: canvas.createdAt,
		updatedAt: canvas.updatedAt,
	};
}

/**
 * Verifica se o usuário tem acesso à inbox
 */
async function verifyInboxAccess(inboxId: string, userId: string): Promise<boolean> {
	const inbox = await getPrismaInstance().chatwitInbox.findFirst({
		where: {
			id: inboxId,
			usuarioChatwit: {
				appUserId: userId,
			},
		},
	});

	return !!inbox;
}

// =============================================================================
// SYNC Flow → MapeamentoBotao
// =============================================================================

/**
 * Converts flow edges into MapeamentoBotao records.
 * For each edge whose source is an interactive_message node and has a
 * sourceHandle (button ID), creates a MapeamentoBotao record based on
 * the target node's type and data.
 */
async function syncFlowToButtonReactions(inboxId: string, canvas: FlowCanvas): Promise<void> {
	const prisma = getPrismaInstance();
	const nodesMap = new Map<string, FlowNode>();
	for (const node of canvas.nodes) {
		nodesMap.set(node.id, node as FlowNode);
	}

	// Aggregate all edge targets per buttonId into a single combined payload.
	// This is critical because MapeamentoBotao has @unique on buttonId —
	// multiple edges from the same button (e.g. text + emoji + tag) must be
	// merged into one record.
	const reactionMap = new Map<
		string,
		{
			buttonId: string;
			actionType: ActionType;
			actionPayload: Record<string, unknown>;
			descriptions: string[];
		}
	>();

	for (const edge of canvas.edges) {
		// Only process edges with a sourceHandle (= button ID)
		if (!edge.sourceHandle) continue;

		const sourceNode = nodesMap.get(edge.source);
		const targetNode = nodesMap.get(edge.target);
		if (!sourceNode || !targetNode) continue;

		// Source must be an interactive_message
		if (sourceNode.type !== "interactive_message") continue;

		const buttonId = edge.sourceHandle;
		const targetData = targetNode.data as unknown as Record<string, unknown>;

		// Get or create the aggregated entry for this buttonId
		let entry = reactionMap.get(buttonId);
		if (!entry) {
			entry = {
				buttonId,
				actionType: ActionType.BUTTON_REACTION,
				actionPayload: {},
				descriptions: [],
			};
			reactionMap.set(buttonId, entry);
		}

		switch (targetNode.type) {
			case "emoji_reaction":
				entry.actionPayload.emoji = targetData.emoji ?? null;
				entry.descriptions.push(`Emoji: ${targetData.emoji ?? ""}`);
				break;

			case "text_reaction":
				entry.actionPayload.textReaction = targetData.textReaction ?? null;
				entry.descriptions.push(String(targetData.textReaction ?? ""));
				break;

			case "text_message":
				entry.actionPayload.textReaction = targetData.text ?? null;
				entry.descriptions.push(String(targetData.text ?? ""));
				break;

			case "interactive_message":
				// Se tem messageId, é uma mensagem existente
				if (targetData.messageId) {
					entry.actionType = ActionType.SEND_TEMPLATE;
					entry.actionPayload.messageId = targetData.messageId;
					entry.descriptions.push(`Enviar: ${targetData.label ?? "mensagem"}`);
				} else {
					// Mensagem criada diretamente no flow - armazenar inline
					const rawElements = (targetData as { elements?: unknown }).elements;
					const elements = Array.isArray(rawElements) ? (rawElements as Array<Record<string, unknown>>) : null;

					const headerFromElements = elements?.find((e) => e.type === "header_text");
					const bodyFromElements = elements?.find((e) => e.type === "body");
					const footerFromElements = elements?.find((e) => e.type === "footer");
					const buttonsFromElements =
						elements
							?.filter((e) => e.type === "button")
							.map((e) => ({
								id: String(e.id ?? ""),
								title: String((e as any).title ?? ""),
								description: (e as any).description ? String((e as any).description) : undefined,
							})) ?? null;

					entry.actionPayload.inlineMessage = {
						label: targetData.label,
						elements: elements ?? undefined,
						header: (headerFromElements as any)?.text ?? (targetData as any).header,
						body: (bodyFromElements as any)?.text ?? (targetData as any).body,
						footer: (footerFromElements as any)?.text ?? (targetData as any).footer,
						buttons: buttonsFromElements ?? (targetData as any).buttons,
					};
					entry.descriptions.push(`Mensagem inline: ${targetData.label ?? "mensagem"}`);
				}
				break;

			case "handoff":
				entry.actionType = ActionType.ASSIGN_TO_AGENT;
				entry.actionPayload.targetTeam = targetData.targetTeam ?? null;
				entry.descriptions.push(`Transferir: ${targetData.targetTeam ?? ""}`);
				break;

			case "add_tag":
				// Merge tag into the combined payload (keeps actionType as BUTTON_REACTION)
				entry.actionPayload.tagName = targetData.tagName ?? null;
				entry.actionPayload.tagColor = targetData.tagColor ?? null;
				entry.descriptions.push(`Tag: ${targetData.tagName ?? ""}`);
				break;

			case "end":
				entry.actionPayload.action = "end_conversation";
				entry.actionPayload.endMessage = targetData.endMessage ?? null;
				entry.descriptions.push("Encerrar conversa");
				break;

			default:
				continue;
		}
	}

	const aggregatedReactions = Array.from(reactionMap.values());

	// Only sync if there are button reactions from interactive_message nodes
	if (aggregatedReactions.length === 0) return;

	// Collect all buttonIds managed by this flow
	const flowButtonIds = aggregatedReactions.map((r) => r.buttonId);

	await prisma.$transaction(async (tx) => {
		// Delete existing reactions for these buttonIds in this inbox
		await tx.mapeamentoBotao.deleteMany({
			where: {
				inboxId,
				buttonId: { in: flowButtonIds },
			},
		});

		// Create one aggregated record per buttonId
		for (const reaction of aggregatedReactions) {
			await tx.mapeamentoBotao.create({
				data: {
					buttonId: reaction.buttonId,
					inboxId,
					actionType: reaction.actionType,
					actionPayload: reaction.actionPayload as unknown as object,
					description: reaction.descriptions.filter(Boolean).join(" | "),
				},
			});
		}
	});

	console.log(
		`[flow-canvas] Synced ${aggregatedReactions.length} aggregated button reactions (from ${flowButtonIds.length} edges) for inbox ${inboxId}`,
	);
}

// =============================================================================
// SYNC Canvas → Flow Normalizado (para mapeamento de intenções)
// =============================================================================

/**
 * Mapeamento de tipos de nó do canvas visual para tipos do runtime
 */
const NODE_TYPE_MAP: Record<string, string> = {
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
};

/**
 * Extrai configuração específica de um nó para armazenar no banco
 */
function buildNodeConfig(node: FlowNode): object {
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
		case "end":
			return { endMessage: data.endMessage };
		case "start":
			return { label: data.label, triggerType: data.triggerType };
		default:
			return data;
	}
}

/**
 * Sincroniza o canvas visual com um Flow normalizado (tabelas Flow, FlowNode, FlowEdge).
 * Isso permite que o flow seja mapeado a intenções e executado pelo FlowOrchestrator.
 *
 * NOTA: Esta função é usada APENAS pela rota legacy (POST /flow-canvas).
 * Flows individuais salvam via PUT /flows/[flowId] diretamente no Flow.canvasJson.
 */
async function syncCanvasToNormalizedFlow(inboxId: string, canvas: FlowCanvas, flowName?: string): Promise<string> {
	const prisma = getPrismaInstance();

	return await prisma.$transaction(async (tx) => {
		// 1. Buscar Flow existente para esta inbox.
		// Se houver múltiplos flows, pegar o mais antigo (o "principal" legacy).
		// NUNCA deve sobrescrever um flow recém-criado que ainda não tem canvas.
		let flow = await tx.flow.findFirst({
			where: { inboxId },
			orderBy: { createdAt: "asc" },
		});

		// Extrair nome do nó START se disponível
		const startNode = canvas.nodes.find((n) => n.type === "start");
		const extractedName =
			flowName || ((startNode?.data as unknown as Record<string, unknown>)?.label as string) || null;

		if (!flow) {
			const inbox = await tx.chatwitInbox.findUnique({
				where: { id: inboxId },
				select: { nome: true },
			});
			flow = await tx.flow.create({
				data: {
					name: extractedName || `Flow - ${inbox?.nome || "Sem nome"}`,
					inboxId,
					isActive: true,
				},
			});
		} else if (extractedName && flow.name !== extractedName) {
			// Atualizar nome se mudou
			flow = await tx.flow.update({
				where: { id: flow.id },
				data: { name: extractedName },
			});
		}

		// 2. Deletar nodes e edges antigos
		await tx.flowEdge.deleteMany({ where: { flowId: flow.id } });
		await tx.flowNode.deleteMany({ where: { flowId: flow.id } });

		// 3. Criar novos nodes e mapear IDs (canvas ID → DB ID)
		const nodeIdMap = new Map<string, string>();

		for (const node of canvas.nodes) {
			const dbNode = await tx.flowNode.create({
				data: {
					flowId: flow.id,
					nodeType: NODE_TYPE_MAP[node.type] || node.type.toUpperCase(),
					config: buildNodeConfig(node),
					positionX: node.position.x,
					positionY: node.position.y,
				},
			});
			nodeIdMap.set(node.id, dbNode.id);
		}

		// 4. Criar edges com IDs mapeados
		for (const edge of canvas.edges) {
			const sourceId = nodeIdMap.get(edge.source);
			const targetId = nodeIdMap.get(edge.target);

			if (!sourceId || !targetId) continue;

			await tx.flowEdge.create({
				data: {
					flowId: flow.id,
					sourceNodeId: sourceId,
					targetNodeId: targetId,
					buttonId: edge.sourceHandle || null,
					conditionBranch: ((edge.data as Record<string, unknown> | undefined)?.conditionBranch as string) || null,
				},
			});
		}

		console.log(`[flow-canvas] Sincronizado Flow ${flow.id} (${flow.name}) com ${canvas.nodes.length} nós`);

		// 5. Salvar canvasJson no Flow para que GET /flows/[flowId] retorne correto
		await tx.flow.update({
			where: { id: flow.id },
			data: { canvasJson: canvas as unknown as Prisma.InputJsonValue },
		});

		return flow.id;
	});
}

// =============================================================================
// GET - Buscar canvas por inboxId
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
		const hasAccess = await verifyInboxAccess(inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Buscar canvas
		const canvas = await getPrismaInstance().inboxFlowCanvas.findUnique({
			where: { inboxId },
		});

		// Se não existir, retornar canvas vazio
		if (!canvas) {
			return NextResponse.json({
				success: true,
				data: null,
				message: "Nenhum canvas encontrado para esta caixa",
			});
		}

		return NextResponse.json({
			success: true,
			data: formatCanvasResponse(canvas),
		});
	} catch (error) {
		console.error("[flow-canvas] GET error:", error);
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
// POST - Criar ou atualizar canvas
// =============================================================================

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();

		// Validar payload
		const validation = SaveFlowCanvasSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{
					success: false,
					error: "Dados inválidos",
					details: validation.error.flatten(),
				},
				{ status: 400 },
			);
		}

		const { inboxId, canvas } = validation.data;

		// Verificar acesso
		const hasAccess = await verifyInboxAccess(inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Upsert canvas (criar ou atualizar)
		const existingCanvas = await getPrismaInstance().inboxFlowCanvas.findUnique({
			where: { inboxId },
		});

		let savedCanvas;

		if (existingCanvas) {
			// Atualizar existente - incrementa versão
			savedCanvas = await getPrismaInstance().inboxFlowCanvas.update({
				where: { inboxId },
				data: {
					canvas: canvas as unknown as object,
					version: { increment: 1 },
					updatedAt: new Date(),
				},
			});
		} else {
			// Criar novo
			savedCanvas = await getPrismaInstance().inboxFlowCanvas.create({
				data: {
					inboxId,
					canvas: canvas as unknown as object,
					version: 1,
					isActive: true,
				},
			});
		}

		// Sync flow edges → MapeamentoBotao (button reactions)
		try {
			await syncFlowToButtonReactions(inboxId, canvas as unknown as FlowCanvas);
		} catch (syncError) {
			console.error("[flow-canvas] Sync button reactions error (non-fatal):", syncError);
			// Non-fatal: canvas is saved, sync failed
		}

		// Sync canvas → Flow normalizado (para mapeamento de intenções)
		try {
			const flowId = await syncCanvasToNormalizedFlow(inboxId, canvas as unknown as FlowCanvas);
			console.log(`[flow-canvas] Flow normalizado criado/atualizado: ${flowId}`);
		} catch (syncError) {
			console.error("[flow-canvas] Sync Flow normalizado error (non-fatal):", syncError);
			// Non-fatal: canvas is saved, sync failed
		}

		return NextResponse.json({
			success: true,
			data: formatCanvasResponse(savedCanvas),
			message: existingCanvas ? "Canvas atualizado com sucesso" : "Canvas criado com sucesso",
		});
	} catch (error) {
		console.error("[flow-canvas] POST error:", error);
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
// DELETE - Remover canvas
// =============================================================================

export async function DELETE(request: NextRequest) {
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
		const hasAccess = await verifyInboxAccess(inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Verificar se existe
		const existingCanvas = await getPrismaInstance().inboxFlowCanvas.findUnique({
			where: { inboxId },
		});

		if (!existingCanvas) {
			return NextResponse.json({ success: false, error: "Canvas não encontrado" }, { status: 404 });
		}

		// Deletar canvas
		await getPrismaInstance().inboxFlowCanvas.delete({
			where: { inboxId },
		});

		return NextResponse.json({
			success: true,
			message: "Canvas removido com sucesso",
		});
	} catch (error) {
		console.error("[flow-canvas] DELETE error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}
