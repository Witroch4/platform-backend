/**
 * Flow Engine Types
 *
 * Interfaces e tipos para o motor de execução de flows (runtime).
 * Separa responsabilidades: `flow-builder.ts` = canvas visual,
 * `flow-engine.ts` = execução em tempo real + entrega.
 */

// =============================================================================
// NODE TYPES (runtime — superset do builder)
// =============================================================================

export type FlowNodeType =
  | 'START'
  | 'END'
  | 'TEXT_MESSAGE'
  | 'INTERACTIVE_MESSAGE'
  | 'MEDIA'
  | 'DELAY'
  | 'CONDITION'
  | 'SET_VARIABLE'
  | 'HTTP_REQUEST'
  | 'ADD_TAG'
  | 'REMOVE_TAG'
  | 'TRANSFER'
  | 'REACTION';

// =============================================================================
// SESSION
// =============================================================================

export type FlowSessionStatus =
  | 'ACTIVE'
  | 'WAITING_INPUT'
  | 'COMPLETED'
  | 'ERROR';

export interface FlowSessionData {
  id: string;
  flowId: string;
  conversationId: string;
  contactId: string;
  inboxId: string;
  status: FlowSessionStatus;
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  executionLog: ExecutionLogEntry[];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface ExecutionLogEntry {
  nodeId: string;
  nodeType: FlowNodeType;
  timestamp: number;
  durationMs: number;
  deliveryMode: 'sync' | 'async';
  result: 'ok' | 'error' | 'skipped';
  detail?: string;
}

// =============================================================================
// DELIVERY CONTEXT — informação da conversa que carrega por todo o flow
// =============================================================================

export interface DeliveryContext {
  accountId: number;
  conversationId: number;
  inboxId: number;
  contactId: number;
  contactName: string;
  contactPhone: string;
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  sourceMessageId?: string;
  /** Token da API Chatwit (ex.: `UsuarioChatwit.chatwitAccessToken`) */
  chatwitAccessToken: string;
  /** Base URL da instância Chatwit (ex.: `https://app.chatwit.io`) */
  chatwitBaseUrl: string;
}

// =============================================================================
// DELIVERY PAYLOAD — o que cada nó entrega
// =============================================================================

export interface DeliveryPayload {
  type: 'text' | 'media' | 'interactive';
  content?: string;
  mediaUrl?: string;
  filename?: string;
  interactivePayload?: Record<string, unknown>;
  /** Se `true`, envia como nota interna (private note) */
  private?: boolean;
}

// =============================================================================
// SYNCHRONOUS RESPONSE — resposta acumulada para a ponte HTTP
// =============================================================================

export interface SynchronousResponse {
  content?: string;
  type?: 'interactive';
  payload?: Record<string, unknown>;
}

// =============================================================================
// FLOW GRAPH (runtime view — carregado do Prisma)
// =============================================================================

export interface RuntimeFlowNode {
  id: string;
  nodeType: FlowNodeType;
  config: Record<string, unknown>;
}

export interface RuntimeFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Se sai de um botão específico */
  buttonId?: string | null;
  /** "true" | "false" para nós CONDITION */
  conditionBranch?: string | null;
}

export interface RuntimeFlow {
  id: string;
  name: string;
  inboxId: string;
  nodes: RuntimeFlowNode[];
  edges: RuntimeFlowEdge[];
}

// =============================================================================
// WEBHOOK PAYLOAD — entrada do FlowOrchestrator
// =============================================================================

/**
 * Payload do webhook que chega ao FlowOrchestrator.
 * Suporta tanto o formato original do Chatwit quanto o formato adaptado do SocialWise Flow.
 */
export interface ChatwitWebhookPayload {
  /** Tipo de evento que veio do Chatwit (opcional no formato SocialWise) */
  event?: 'message_created' | 'message_updated';

  /** Dados da mensagem recebida (formato Chatwit) */
  message?: {
    id?: number;
    content?: string;
    content_type?: string;
    content_attributes?: Record<string, unknown>;
    message_type?: 'incoming' | 'outgoing';
    conversation_id?: number;
    account_id?: number;
  };

  /** Dados do contato */
  contact?: {
    id?: number;
    name?: string;
    phone_number?: string;
  };

  /** Dados da conversa */
  conversation?: {
    id?: number;
    inbox_id?: number;
    contact_id?: number;
    account_id?: number;
    status?: string;
  };

  /** Dados de clique de botão (se aplicável) */
  content_attributes?: {
    button_reply?: {
      id: string;
      title?: string;
    };
    list_reply?: {
      id: string;
      title?: string;
    };
  };

  // --- Campos do formato SocialWise Flow ---

  /** Session ID do contato (formato SocialWise) */
  session_id?: string;

  /** Texto da mensagem (formato SocialWise) */
  text?: string;

  /** Tipo de canal (formato SocialWise) */
  channel_type?: string;

  /** Idioma (formato SocialWise) */
  language?: string;

  /** Metadata adicional (formato SocialWise) */
  metadata?: Record<string, unknown>;

  /** Intent detectado pelo classificador (para mapeamento) */
  intent_name?: string;
  detected_intent?: string;
}

// =============================================================================
// CONDITION NODE
// =============================================================================

export interface ConditionConfig {
  /** Variável a avaliar */
  variable: string;
  /** Operador */
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'exists' | 'not_exists';
  /** Valor esperado */
  value: string;
}

// =============================================================================
// HTTP REQUEST NODE
// =============================================================================

export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Variável onde salvar o resultado */
  responseVariable?: string;
  timeoutMs?: number;
}

// =============================================================================
// DELAY NODE
// =============================================================================

export interface DelayConfig {
  delayMs: number;
}

// =============================================================================
// SET VARIABLE NODE
// =============================================================================

export interface SetVariableConfig {
  variableName: string;
  /** Expressão — pode conter `{{variáveis}}` */
  expression: string;
}

// =============================================================================
// TRANSFER NODE
// =============================================================================

export interface TransferConfig {
  /** ID do time ou agente destino */
  assigneeId?: string;
  assigneeType?: 'team' | 'agent';
  /** Nota interna (opcional) */
  internalNote?: string;
}

// =============================================================================
// TAG NODES
// =============================================================================

export interface TagConfig {
  /** Nome da tag */
  tagName: string;
}

// =============================================================================
// MEDIA NODE
// =============================================================================

export interface MediaConfig {
  /** URL do arquivo (MinIO ou externo) */
  mediaUrl: string;
  /** Nome do arquivo (para PDF, etc.) */
  filename?: string;
  /** Caption (texto que acompanha o arquivo) */
  caption?: string;
}
