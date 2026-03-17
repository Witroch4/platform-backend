/**
 * Flow Builder - Helper Functions
 *
 * Funções utilitárias para criação e validação de fluxos.
 */

import { FlowNodeType } from "./enums";
import type { FlowNodeDataBase, FlowNodeData } from "./nodes";
import type { FlowNode, FlowEdge, FlowEdgeData, FlowCanvas } from "./canvas";
import { FLOW_CANVAS_CONSTANTS } from "./constants";
import { getDefaultLabel } from "./palette";

// =============================================================================
// NODE CREATION
// =============================================================================

/**
 * Cria um nó com valores padrão
 */
export function createFlowNode(
	type: FlowNodeType,
	position: { x: number; y: number },
	data: Partial<FlowNodeData> = {},
): FlowNode {
	const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	const baseData: FlowNodeDataBase = {
		label: getDefaultLabel(type),
		isConfigured: false,
		...data,
	};

	return {
		id,
		type,
		position,
		data: baseData as FlowNodeData,
	};
}

// =============================================================================
// EDGE CREATION
// =============================================================================

/**
 * Cria uma edge entre dois nós
 */
export function createFlowEdge(source: string, target: string, sourceHandle?: string, data?: FlowEdgeData): FlowEdge {
	const id = `edge_${source}_${target}_${sourceHandle ?? "default"}_${Date.now()}`;

	return {
		id,
		source,
		target,
		sourceHandle,
		data,
		type: "smoothstep",
		animated: false,
	};
}

// =============================================================================
// CANVAS CREATION
// =============================================================================

/**
 * Cria um canvas vazio com nó inicial.
 * Todos os flows (normais e de campanha) começam com START.
 * O nó START pode ser expandido com outros nós como WHATSAPP_TEMPLATE ou INTERACTIVE_MESSAGE.
 */
export function createEmptyFlowCanvas(options?: { isCampaign?: boolean }): FlowCanvas {
	const initialNode = createFlowNode(FlowNodeType.START, { x: 250, y: 50 });
	initialNode.data.isConfigured = true;

	return {
		nodes: [initialNode],
		edges: [],
		viewport: { ...FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT },
	};
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Valida se um canvas é válido
 *
 * Regras:
 * - O fluxo deve ter pelo menos um ponto de início (START ou mensagem raiz)
 * - Nós soltos (sem conexão de entrada) são permitidos — simplesmente não serão executados
 * - Todos os nós (exceto START) devem estar configurados (warning)
 */
export function validateFlowCanvas(canvas: FlowCanvas): {
	valid: boolean;
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Identificar nós raiz (sem conexão de entrada)
	const nodesWithIncomingEdges = new Set(canvas.edges.map((e) => e.target));
	const rootNodes = canvas.nodes.filter((n) => !nodesWithIncomingEdges.has(n.id));

	// Nós raiz válidos: START, INTERACTIVE_MESSAGE, QUICK_REPLIES ou CAROUSEL
	const validRootTypes = [
		FlowNodeType.START,
		FlowNodeType.INTERACTIVE_MESSAGE,
		FlowNodeType.QUICK_REPLIES,
		FlowNodeType.CAROUSEL,
	];

	if (rootNodes.length === 0) {
		errors.push("O fluxo deve ter pelo menos um ponto de início");
	}

	// Verificar se existe pelo menos um ponto de início válido
	const validRoots = rootNodes.filter((n) => validRootTypes.includes(n.type as FlowNodeType));
	if (rootNodes.length > 0 && validRoots.length === 0) {
		errors.push("O fluxo deve ter pelo menos um nó START ou mensagem como ponto de início");
	}

	// Verificar múltiplos START (warning, não erro)
	const startNodes = canvas.nodes.filter((n) => n.type === FlowNodeType.START);
	if (startNodes.length > 1) {
		warnings.push("O fluxo tem múltiplos nós de início");
	}

	// Nós soltos são apenas um aviso — não serão executados pelo flow engine
	const disconnectedNodes = canvas.nodes.filter(
		(n) => !validRootTypes.includes(n.type as FlowNodeType) && !nodesWithIncomingEdges.has(n.id),
	);
	if (disconnectedNodes.length > 0) {
		warnings.push(`${disconnectedNodes.length} nó(s) solto(s) não serão executados (sem conexão de entrada)`);
	}

	// Verificar nós não configurados
	const unconfiguredNodes = canvas.nodes.filter((n) => n.type !== FlowNodeType.START && !n.data.isConfigured);
	if (unconfiguredNodes.length > 0) {
		warnings.push(`Existem ${unconfiguredNodes.length} nó(s) não configurado(s)`);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
