import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { canvasToN8nFormat } from "@/lib/flow-builder/exportImport";
import type { FlowCanvas } from "@/types/flow-builder";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Mapeamento reverso de tipos de nó (runtime → canvas visual)
 */
const NODE_TYPE_REVERSE_MAP: Record<string, string> = {
	START: "start",
	INTERACTIVE_MESSAGE: "interactive_message",
	TEXT_MESSAGE: "text_message",
	REACTION: "emoji_reaction",
	TRANSFER: "handoff",
	ADD_TAG: "add_tag",
	END: "end",
	CONDITION: "condition",
	DELAY: "delay",
	MEDIA: "media",
};

/**
 * Converte Flow normalizado (nodes/edges do DB) para FlowCanvas visual
 */
function flowToCanvas(flow: {
	id: string;
	name: string;
	nodes: Array<{
		id: string;
		nodeType: string;
		config: unknown;
		positionX: number;
		positionY: number;
	}>;
	edges: Array<{
		id: string;
		sourceNodeId: string;
		targetNodeId: string;
		buttonId: string | null;
		conditionBranch: string | null;
	}>;
}): FlowCanvas {
	const nodeIdMap = new Map<string, string>();

	const canvasNodes = flow.nodes.map((node) => {
		const canvasId = `${NODE_TYPE_REVERSE_MAP[node.nodeType] || node.nodeType.toLowerCase()}_${node.id.slice(0, 8)}`;
		nodeIdMap.set(node.id, canvasId);

		const config = node.config as Record<string, unknown> | null;

		let nodeType = NODE_TYPE_REVERSE_MAP[node.nodeType] || node.nodeType.toLowerCase();
		if (node.nodeType === "REACTION" && config) {
			if (config.emoji) {
				nodeType = "emoji_reaction";
			} else if (config.text || config.textReaction) {
				nodeType = "text_reaction";
			}
		}

		const nodeData: Record<string, unknown> = {
			label: config?.label || flow.name,
			isConfigured: true,
			...(config || {}),
		};

		if (node.nodeType === "DELAY" && config?.delayMs) {
			nodeData.delaySeconds = Math.round((config.delayMs as number) / 1000);
		}

		return {
			id: canvasId,
			type: nodeType,
			position: { x: node.positionX, y: node.positionY },
			data: nodeData,
		};
	});

	const canvasEdges = flow.edges.map((edge) => {
		const sourceId = nodeIdMap.get(edge.sourceNodeId) || edge.sourceNodeId;
		const targetId = nodeIdMap.get(edge.targetNodeId) || edge.targetNodeId;

		return {
			id: `edge_${sourceId}_${targetId}_${edge.buttonId || "default"}`,
			source: sourceId,
			target: targetId,
			sourceHandle: edge.buttonId || undefined,
			data: edge.buttonId ? { buttonId: edge.buttonId } : undefined,
			type: "smoothstep" as const,
			animated: false,
		};
	});

	return {
		nodes: canvasNodes,
		edges: canvasEdges,
		viewport: { x: 0, y: 0, zoom: 1 },
	} as unknown as FlowCanvas;
}

// =============================================================================
// GET - Exportar flow como JSON n8n-style
// =============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
		}

		const { flowId } = await params;

		if (!flowId) {
			return NextResponse.json({ success: false, error: "flowId é obrigatório" }, { status: 400 });
		}

		// Buscar flow com verificação de acesso
		const flow = await getPrismaInstance().flow.findFirst({
			where: {
				id: flowId,
				inbox: {
					usuarioChatwit: {
						appUserId: session.user.id,
					},
				},
			},
			include: {
				nodes: true,
				edges: true,
			},
		});

		if (!flow) {
			return NextResponse.json({ success: false, error: "Flow não encontrado ou acesso negado" }, { status: 404 });
		}

		// Determinar fonte do canvas
		let canvas: FlowCanvas;

		// Prioridade 1: canvasJson do próprio Flow
		if (flow.canvasJson) {
			canvas = flow.canvasJson as unknown as FlowCanvas;
		} else {
			// Prioridade 2: InboxFlowCanvas (legado)
			const inboxCanvas = await getPrismaInstance().inboxFlowCanvas.findUnique({
				where: { inboxId: flow.inboxId },
			});

			if (inboxCanvas?.canvas) {
				canvas = inboxCanvas.canvas as unknown as FlowCanvas;
			} else if (flow.nodes.length > 0) {
				// Prioridade 3: Reconstruir a partir de nodes/edges normalizados
				canvas = flowToCanvas(flow);
			} else {
				// Flow vazio
				canvas = {
					nodes: [],
					edges: [],
					viewport: { x: 0, y: 0, zoom: 1 },
				};
			}
		}

		// Converter para formato n8n
		const exportData = canvasToN8nFormat(canvas, {
			flowId: flow.id,
			flowName: flow.name,
			inboxId: flow.inboxId,
		});

		// Gerar nome de arquivo seguro
		const safeName = flow.name
			.replace(/[^a-zA-Z0-9\-_]/g, "-")
			.replace(/-+/g, "-")
			.slice(0, 50);
		const filename = `flow-${safeName}-${Date.now()}.json`;

		// Retornar como download
		return new NextResponse(JSON.stringify(exportData, null, 2), {
			headers: {
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"Cache-Control": "no-cache, no-store, must-revalidate",
			},
		});
	} catch (error) {
		console.error("[flows/export] GET error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}
