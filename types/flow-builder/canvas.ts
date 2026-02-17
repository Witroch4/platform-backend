/**
 * Flow Builder - Canvas & Graph Structure
 *
 * Tipos para o canvas visual (React Flow), nós, edges e viewport.
 */

import type { FlowNodeType } from "./enums";
import type { FlowNodeData } from "./nodes";

// =============================================================================
// NODE INTERFACES
// =============================================================================

/**
 * Estrutura de um nó no Flow Builder
 */
export interface FlowNode<T extends FlowNodeData = FlowNodeData> {
	id: string;
	type: FlowNodeType;
	position: { x: number; y: number };
	data: T;
	/** Dimensões opcionais do nó */
	width?: number;
	height?: number;
	/** Se o nó está selecionado */
	selected?: boolean;
	/** Se o nó está sendo arrastado */
	dragging?: boolean;
}

// =============================================================================
// EDGE INTERFACES
// =============================================================================

/**
 * Dados de uma edge (conexão entre nós)
 */
export interface FlowEdgeData {
	/** ID do botão que dispara esta conexão (para edges de mensagens interativas) */
	buttonId?: string;
	/** Label do botão (para exibição) */
	buttonLabel?: string;
	/** Status da edge */
	status?: "idle" | "active" | "success" | "error";
}

/**
 * Estrutura de uma edge no Flow Builder
 */
export interface FlowEdge {
	id: string;
	/** ID do nó de origem */
	source: string;
	/** ID do nó de destino */
	target: string;
	/** Handle específico de origem (ex: buttonId) */
	sourceHandle?: string;
	/** Handle específico de destino */
	targetHandle?: string;
	/** Dados adicionais da edge */
	data?: FlowEdgeData;
	/** Tipo de edge para renderização customizada */
	type?: "default" | "smoothstep" | "step" | "straight" | "button";
	/** Se a edge está animada */
	animated?: boolean;
	/** Se a edge está selecionada */
	selected?: boolean;
}

// =============================================================================
// VIEWPORT & CANVAS
// =============================================================================

/**
 * Estado do viewport do canvas
 */
export interface FlowViewport {
	x: number;
	y: number;
	zoom: number;
}

/**
 * Estrutura completa do canvas de fluxo
 */
export interface FlowCanvas {
	nodes: FlowNode[];
	edges: FlowEdge[];
	viewport: FlowViewport;
}

/**
 * Estado persistido do canvas (armazenado no banco)
 */
export interface FlowCanvasState {
	id?: string;
	inboxId: string;
	canvas: FlowCanvas;
	version: number;
	isActive: boolean;
	createdAt?: Date;
	updatedAt?: Date;
}

// =============================================================================
// API INTERFACES
// =============================================================================

/**
 * Request para criar/atualizar canvas
 */
export interface SaveFlowCanvasRequest {
	inboxId: string;
	canvas: FlowCanvas;
}

/**
 * Response de operações no canvas
 */
export interface FlowCanvasResponse {
	success: boolean;
	data?: FlowCanvasState;
	error?: string;
}

// =============================================================================
// CONVERSION INTERFACES
// =============================================================================

/**
 * Payload de reação de botão para sincronização
 */
export interface ButtonReactionPayload {
	buttonId: string;
	emoji?: string;
	textReaction?: string;
	action?: string;
	messageId?: string;
	actionType: "BUTTON_REACTION" | "SEND_TEMPLATE" | "ASSIGN_TO_AGENT" | "ADD_TAG";
}

// =============================================================================
// TYPED NODE ALIASES
// =============================================================================

import type {
	StartNodeData,
	InteractiveMessageNodeData,
	EmojiReactionNodeData,
	TextReactionNodeData,
	HandoffNodeData,
} from "./nodes";

/** Nó de início tipado */
export type StartNode = FlowNode<StartNodeData>;

/** Nó de mensagem interativa tipado */
export type InteractiveMessageNode = FlowNode<InteractiveMessageNodeData>;

/** Nó de reação com emoji tipado */
export type EmojiReactionNode = FlowNode<EmojiReactionNodeData>;

/** Nó de reação com texto tipado */
export type TextReactionNode = FlowNode<TextReactionNodeData>;

/** Nó de handoff tipado */
export type HandoffNode = FlowNode<HandoffNodeData>;
