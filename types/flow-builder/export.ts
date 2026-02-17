/**
 * Flow Builder - N8N-Style Export/Import Types
 *
 * Tipos para exportação e importação de fluxos no estilo n8n.
 */

import type { FlowNode, FlowViewport } from "./canvas";

// =============================================================================
// EXPORT METADATA
// =============================================================================

/**
 * Metadata para flow exportado
 */
export interface FlowExportMeta {
	/** Versão do formato de exportação */
	version: string;
	/** Data/hora da exportação (ISO 8601) */
	exportedAt: string;
	/** ID original do flow (opcional, para referência) */
	flowId?: string;
	/** Nome do flow */
	flowName: string;
	/** ID da inbox original (opcional) */
	inboxId?: string;
}

// =============================================================================
// N8N-STYLE CONNECTIONS
// =============================================================================

/**
 * Target de conexão no estilo n8n
 */
export interface N8nConnectionTarget {
	/** ID do nó de destino */
	node: string;
	/** Tipo de conexão (sempre 'main' por ora) */
	type: "main";
	/** Índice do input no nó destino (geralmente 0) */
	index: number;
}

/**
 * Mapa de conexões no estilo n8n
 *
 * Para interactive_message: cada botão = 1 output (índice = ordem do botão)
 * Para condition: 2 outputs (0=true, 1=false)
 * Para demais nodes: 1 output (default)
 */
export interface N8nConnectionsMap {
	[sourceNodeId: string]: {
		main: N8nConnectionTarget[][];
	};
}

// =============================================================================
// EXPORT FORMAT
// =============================================================================

/**
 * Node estendido para exportação (inclui contagem de outputs)
 */
export interface FlowNodeExport extends FlowNode {
	/** Número de outputs do nó (botões para interactive_message, branches para condition) */
	outputs?: number;
}

/**
 * Formato completo de exportação no estilo n8n
 */
export interface FlowExportFormat {
	/** Metadata do flow */
	meta: FlowExportMeta;
	/** Lista de nós com outputs calculados */
	nodes: FlowNodeExport[];
	/** Mapa de conexões no estilo n8n */
	connections: N8nConnectionsMap;
	/** Estado do viewport */
	viewport: FlowViewport;
}

// =============================================================================
// IMPORT VALIDATION
// =============================================================================

/**
 * Resultado de validação de importação
 */
export interface FlowImportValidation {
	/** Se a estrutura é válida para importação */
	valid: boolean;
	/** Erros que impedem a importação */
	errors: string[];
	/** Avisos que não impedem mas merecem atenção */
	warnings: string[];
	/** Número de nós no flow */
	nodeCount: number;
	/** Número total de conexões */
	connectionCount: number;
}
