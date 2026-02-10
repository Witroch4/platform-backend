/**
 * Flow Builder Types
 * Tipos para o sistema visual de construção de fluxos de mensagens interativas.
 */

import type { InteractiveMessage } from './interactive-messages';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Tipos de nós suportados no Flow Builder
 */
export enum FlowNodeType {
  // Triggers
  START = 'start',

  // Messages
  INTERACTIVE_MESSAGE = 'interactive_message',
  TEXT_MESSAGE = 'text_message',

  // Reactions
  EMOJI_REACTION = 'emoji_reaction',
  TEXT_REACTION = 'text_reaction',

  // Actions
  HANDOFF = 'handoff',
  ADD_TAG = 'add_tag',
  END_CONVERSATION = 'end',

  // Logic
  CONDITION = 'condition',
  DELAY = 'delay',

  // Media
  MEDIA = 'media',
}

/**
 * Status de execução de um nó
 */
export type FlowNodeExecutionStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'error'
  | 'waiting';

// =============================================================================
// NODE DATA INTERFACES
// =============================================================================

/**
 * Dados base para todos os nós
 */
export interface FlowNodeDataBase {
  label: string;
  isConfigured: boolean;
  execution?: {
    status: FlowNodeExecutionStatus;
    message?: string;
  };
}

/**
 * Dados específicos para nó START
 */
export interface StartNodeData extends FlowNodeDataBase {
  triggerType?: 'manual' | 'webhook' | 'scheduled';
}

/**
 * Dados específicos para nó de mensagem interativa
 */
export interface InteractiveMessageNodeData extends FlowNodeDataBase {
  /** ID da mensagem existente (se vinculada) */
  messageId?: string;
  /** Mensagem completa (se vinculada a existente) */
  message?: InteractiveMessage;
  /** IDs dos botões disponíveis para conexão */
  buttonIds?: string[];

  // -------------------------------------------------------------------------
  // Arquitetura modular (Typebot/Flowise-like)
  // -------------------------------------------------------------------------

  /** Elementos (blocos) ordenados dentro da “casca” da Mensagem Interativa */
  elements?: InteractiveMessageElement[];

  // -------------------------------------------------------------------------
  // Campos legados (compatibilidade com flows antigos)
  // Preferir `elements` para novos fluxos
  // -------------------------------------------------------------------------

  /** @deprecated Use `elements` (header_text) */
  header?: string;
  /** @deprecated Use `elements` (body) */
  body?: string;
  /** @deprecated Use `elements` (footer) */
  footer?: string;
  /** @deprecated Use `elements` (button) */
  buttons?: Array<{ id: string; title: string; description?: string }>;
}

// =============================================================================
// INTERACTIVE MESSAGE ELEMENTS (Blocos)
// =============================================================================

export type InteractiveMessageElementType =
  | 'header_text'
  | 'header_image'
  | 'body'
  | 'footer'
  | 'button';

export interface InteractiveMessageElementBase {
  id: string;
  type: InteractiveMessageElementType;
}

export interface InteractiveMessageHeaderTextElement
  extends InteractiveMessageElementBase {
  type: 'header_text';
  text: string;
}

export interface InteractiveMessageHeaderImageElement
  extends InteractiveMessageElementBase {
  type: 'header_image';
  url?: string;
  caption?: string;
}

export interface InteractiveMessageBodyElement extends InteractiveMessageElementBase {
  type: 'body';
  text: string;
}

export interface InteractiveMessageFooterElement
  extends InteractiveMessageElementBase {
  type: 'footer';
  text: string;
}

export interface InteractiveMessageButtonElement
  extends InteractiveMessageElementBase {
  type: 'button';
  title: string;
  description?: string;
}

export type InteractiveMessageElement =
  | InteractiveMessageHeaderTextElement
  | InteractiveMessageHeaderImageElement
  | InteractiveMessageBodyElement
  | InteractiveMessageFooterElement
  | InteractiveMessageButtonElement;

// =============================================================================
// ELEMENT PALETTE
// =============================================================================

export const FLOWBUILDER_ELEMENT_MIME = 'application/flowbuilder-element';

export interface ElementPaletteItem {
  type: InteractiveMessageElementType;
  icon: string;
  label: string;
  description: string;
}

export const INTERACTIVE_MESSAGE_ELEMENT_ITEMS: ElementPaletteItem[] = [
  {
    type: 'header_text',
    icon: '🏷️',
    label: 'Header (texto)',
    description: 'Título acima do corpo da mensagem',
  },
  {
    type: 'header_image',
    icon: '🖼️',
    label: 'Header (imagem)',
    description: 'Imagem no topo da mensagem',
  },
  {
    type: 'body',
    icon: '📝',
    label: 'Body',
    description: 'Texto principal (obrigatório)',
  },
  {
    type: 'footer',
    icon: '📎',
    label: 'Footer',
    description: 'Texto de rodapé',
  },
  {
    type: 'button',
    icon: '🔘',
    label: 'Botão',
    description: 'Um botão (ponto de conexão)',
  },
];

/**
 * Dados específicos para nó de mensagem de texto simples
 */
export interface TextMessageNodeData extends FlowNodeDataBase {
  text: string;
}

/**
 * Dados específicos para nó de reação com emoji
 */
export interface EmojiReactionNodeData extends FlowNodeDataBase {
  emoji: string;
}

/**
 * Dados específicos para nó de reação com texto
 */
export interface TextReactionNodeData extends FlowNodeDataBase {
  textReaction: string;
}

/**
 * Dados específicos para nó de handoff
 */
export interface HandoffNodeData extends FlowNodeDataBase {
  targetTeam?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Dados específicos para nó de adicionar tag
 */
export interface AddTagNodeData extends FlowNodeDataBase {
  tagName: string;
  tagColor?: string;
}

/**
 * Dados específicos para nó de fim de conversa
 */
export interface EndConversationNodeData extends FlowNodeDataBase {
  endMessage?: string;
}

/**
 * Dados específicos para nó de delay/espera
 */
export interface DelayNodeData extends FlowNodeDataBase {
  /** Tempo de espera em segundos (1-30) */
  delaySeconds: number;
}

/**
 * Tipo de mídia suportado
 */
export type MediaType = 'image' | 'video' | 'document' | 'audio';

/**
 * Dados específicos para nó de mídia
 */
export interface MediaNodeData extends FlowNodeDataBase {
  /** Tipo de mídia */
  mediaType: MediaType;
  /** URL do arquivo no MinIO */
  mediaUrl?: string;
  /** Nome do arquivo */
  filename?: string;
  /** MIME type */
  mimeType?: string;
  /** Legenda/caption (para imagens e vídeos) */
  caption?: string;
}

/**
 * União de todos os tipos de dados de nós
 */
export type FlowNodeData =
  | StartNodeData
  | InteractiveMessageNodeData
  | TextMessageNodeData
  | EmojiReactionNodeData
  | TextReactionNodeData
  | HandoffNodeData
  | AddTagNodeData
  | EndConversationNodeData
  | DelayNodeData
  | MediaNodeData;

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

/**
 * Nó de início tipado
 */
export type StartNode = FlowNode<StartNodeData>;

/**
 * Nó de mensagem interativa tipado
 */
export type InteractiveMessageNode = FlowNode<InteractiveMessageNodeData>;

/**
 * Nó de reação com emoji tipado
 */
export type EmojiReactionNode = FlowNode<EmojiReactionNodeData>;

/**
 * Nó de reação com texto tipado
 */
export type TextReactionNode = FlowNode<TextReactionNodeData>;

/**
 * Nó de handoff tipado
 */
export type HandoffNode = FlowNode<HandoffNodeData>;

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
  status?: 'idle' | 'active' | 'success' | 'error';
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
  type?: 'default' | 'smoothstep' | 'step' | 'straight' | 'button';
  /** Se a edge está animada */
  animated?: boolean;
  /** Se a edge está selecionada */
  selected?: boolean;
}

// =============================================================================
// CANVAS INTERFACES
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
// CONVERSION INTERFACES (Flow <-> MapeamentoBotao)
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
  actionType: 'BUTTON_REACTION' | 'SEND_TEMPLATE' | 'ASSIGN_TO_AGENT' | 'ADD_TAG';
}

// =============================================================================
// PALETTE INTERFACES
// =============================================================================

/**
 * Item da paleta de nós
 */
export interface PaletteItem {
  type: FlowNodeType;
  icon: string;
  label: string;
  description: string;
  category: 'trigger' | 'message' | 'reaction' | 'action' | 'logic';
}

/**
 * Itens disponíveis na paleta de nós
 */
export const PALETTE_ITEMS: PaletteItem[] = [
  // Triggers
  {
    type: FlowNodeType.START,
    icon: '🚀',
    label: 'Início',
    description: 'Ponto de entrada do fluxo',
    category: 'trigger',
  },

  // Messages
  {
    type: FlowNodeType.INTERACTIVE_MESSAGE,
    icon: '📩',
    label: 'Mensagem Interativa',
    description: 'Mensagem com botões ou lista',
    category: 'message',
  },
  {
    type: FlowNodeType.TEXT_MESSAGE,
    icon: '💬',
    label: 'Texto Simples',
    description: 'Mensagem de texto sem botões',
    category: 'message',
  },
  {
    type: FlowNodeType.MEDIA,
    icon: '📎',
    label: 'Mídia',
    description: 'Enviar imagem, vídeo, PDF ou documento',
    category: 'message',
  },

  // Logic
  {
    type: FlowNodeType.DELAY,
    icon: '⏳',
    label: 'Esperar',
    description: 'Aguardar X segundos antes de continuar',
    category: 'logic',
  },

  // Reactions
  {
    type: FlowNodeType.EMOJI_REACTION,
    icon: '😊',
    label: 'Emoji',
    description: 'Reagir com emoji',
    category: 'reaction',
  },
  {
    type: FlowNodeType.TEXT_REACTION,
    icon: '✏️',
    label: 'Resposta de Texto',
    description: 'Responder com texto',
    category: 'reaction',
  },

  // Actions
  {
    type: FlowNodeType.HANDOFF,
    icon: '👤',
    label: 'Transferir',
    description: 'Transferir para agente humano',
    category: 'action',
  },
  {
    type: FlowNodeType.ADD_TAG,
    icon: '🏷️',
    label: 'Adicionar Tag',
    description: 'Adiciona tag ao contato',
    category: 'action',
  },
  {
    type: FlowNodeType.END_CONVERSATION,
    icon: '✅',
    label: 'Finalizar',
    description: 'Encerrar conversa',
    category: 'action',
  },
];

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Limites de caracteres por canal (WhatsApp vs Instagram/Facebook)
 * Referência: docs/interative_message_flow_builder.md
 */
export const CHANNEL_CHAR_LIMITS = {
  whatsapp: {
    body: 1024,
    headerText: 60,
    footer: 60,
    buttonTitle: 20,
    payloadId: 256,
    maxButtons: 3,
    listItemTitle: 24,
    listItemDescription: 72,
  },
  instagram: {
    body: 1000,
    headerText: null, // N/A
    footer: null, // N/A
    buttonTitle: 20,
    payloadId: 1000,
    maxButtons: 3, // Para BT (botões); QR pode ter até 13
    maxQuickReplies: 13,
    carousel: 10,
    buttonTemplateBody: 640,
  },
} as const;

/**
 * Tipo do canal para limites de caracteres
 */
export type ChannelType = keyof typeof CHANNEL_CHAR_LIMITS;

/**
 * Retorna o limite de caracteres para um campo específico
 * Por padrão usa WhatsApp que é mais restritivo
 */
export function getCharLimit(
  field: 'body' | 'headerText' | 'footer' | 'buttonTitle' | 'listItemTitle' | 'listItemDescription',
  channel: ChannelType = 'whatsapp'
): number | null {
  const limits = CHANNEL_CHAR_LIMITS[channel];
  return limits[field as keyof typeof limits] ?? null;
}

/**
 * Constantes do canvas
 */
export const FLOW_CANVAS_CONSTANTS = {
  GRID_SIZE: 20,
  DEFAULT_NODE_WIDTH: 280,
  DEFAULT_NODE_HEIGHT: 120,
  NODE_SPACING_X: 200,
  NODE_SPACING_Y: 150,
  MIN_ZOOM: 0.3,
  MAX_ZOOM: 2,
  DEFAULT_ZOOM: 1,
  DEFAULT_VIEWPORT: { x: 0, y: 0, zoom: 1 },
} as const;

/**
 * Cores para diferentes tipos de nós
 */
export const NODE_COLORS = {
  [FlowNodeType.START]: {
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-500',
    icon: 'text-green-600',
  },
  [FlowNodeType.INTERACTIVE_MESSAGE]: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-500',
    icon: 'text-blue-600',
  },
  [FlowNodeType.TEXT_MESSAGE]: {
    bg: 'bg-slate-50 dark:bg-slate-950',
    border: 'border-slate-500',
    icon: 'text-slate-600',
  },
  [FlowNodeType.EMOJI_REACTION]: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    border: 'border-yellow-500',
    icon: 'text-yellow-600',
  },
  [FlowNodeType.TEXT_REACTION]: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-500',
    icon: 'text-purple-600',
  },
  [FlowNodeType.HANDOFF]: {
    bg: 'bg-orange-50 dark:bg-orange-950',
    border: 'border-orange-500',
    icon: 'text-orange-600',
  },
  [FlowNodeType.ADD_TAG]: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    border: 'border-pink-500',
    icon: 'text-pink-600',
  },
  [FlowNodeType.END_CONVERSATION]: {
    bg: 'bg-red-50 dark:bg-red-950',
    border: 'border-red-500',
    icon: 'text-red-600',
  },
  [FlowNodeType.CONDITION]: {
    bg: 'bg-indigo-50 dark:bg-indigo-950',
    border: 'border-indigo-500',
    icon: 'text-indigo-600',
  },
  [FlowNodeType.DELAY]: {
    bg: 'bg-cyan-50 dark:bg-cyan-950',
    border: 'border-cyan-500',
    icon: 'text-cyan-600',
  },
  [FlowNodeType.MEDIA]: {
    bg: 'bg-teal-50 dark:bg-teal-950',
    border: 'border-teal-500',
    icon: 'text-teal-600',
  },
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Cria um nó com valores padrão
 */
export function createFlowNode(
  type: FlowNodeType,
  position: { x: number; y: number },
  data: Partial<FlowNodeData> = {}
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

/**
 * Retorna o label padrão para um tipo de nó
 */
function getDefaultLabel(type: FlowNodeType): string {
  const item = PALETTE_ITEMS.find((p) => p.type === type);
  return item?.label ?? 'Nó';
}

/**
 * Cria uma edge entre dois nós
 */
export function createFlowEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  data?: FlowEdgeData
): FlowEdge {
  const id = `edge_${source}_${target}_${sourceHandle ?? 'default'}_${Date.now()}`;

  return {
    id,
    source,
    target,
    sourceHandle,
    data,
    type: 'smoothstep',
    animated: false,
  };
}

/**
 * Valida se um canvas é válido
 *
 * Regras:
 * - O fluxo pode começar com START ou diretamente com INTERACTIVE_MESSAGE
 * - Nós raiz (sem conexão de entrada) devem ser START ou INTERACTIVE_MESSAGE
 * - Nós não raiz devem ter pelo menos uma conexão de entrada
 * - Todos os nós (exceto START) devem estar configurados
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

  // Nós raiz válidos: START ou INTERACTIVE_MESSAGE
  const validRootTypes = [FlowNodeType.START, FlowNodeType.INTERACTIVE_MESSAGE];
  const invalidRootNodes = rootNodes.filter((n) => !validRootTypes.includes(n.type as FlowNodeType));

  if (rootNodes.length === 0) {
    errors.push('O fluxo deve ter pelo menos um ponto de início');
  }

  if (invalidRootNodes.length > 0) {
    errors.push(
      `${invalidRootNodes.length} nó(s) sem conexão de entrada não são válidos como início de fluxo`
    );
  }

  // Verificar múltiplos START (warning, não erro)
  const startNodes = canvas.nodes.filter((n) => n.type === FlowNodeType.START);
  if (startNodes.length > 1) {
    warnings.push('O fluxo tem múltiplos nós de início');
  }

  // Verificar nós órfãos (nós que não são raiz válidos e não têm conexão de entrada)
  const orphanNodes = canvas.nodes.filter(
    (n) =>
      !validRootTypes.includes(n.type as FlowNodeType) &&
      !nodesWithIncomingEdges.has(n.id)
  );
  if (orphanNodes.length > 0) {
    errors.push(
      `Existem ${orphanNodes.length} nó(s) sem conexão de entrada`
    );
  }

  // Verificar nós não configurados
  const unconfiguredNodes = canvas.nodes.filter(
    (n) => n.type !== FlowNodeType.START && !n.data.isConfigured
  );
  if (unconfiguredNodes.length > 0) {
    warnings.push(
      `Existem ${unconfiguredNodes.length} nó(s) não configurado(s)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Cria um canvas vazio com nó START inicial
 */
export function createEmptyFlowCanvas(): FlowCanvas {
  const startNode = createFlowNode(FlowNodeType.START, { x: 250, y: 50 });
  startNode.data.isConfigured = true;

  return {
    nodes: [startNode],
    edges: [],
    viewport: { ...FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT },
  };
}
