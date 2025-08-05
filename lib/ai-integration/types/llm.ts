/**
 * LLM and dynamic generation types
 * Based on requirements 13.1, 13.2
 */

export interface LlmAudit {
  id: string;
  conversationId: string;
  messageId: string;
  mode: 'INTENT_CLASSIFY' | 'DYNAMIC_GENERATE';
  inputText: string; // PII mascarado
  resultJson: any;
  score?: number;
  traceId?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface DynamicGenerationResult {
  text: string;
  buttons?: Array<{
    type: 'reply';
    title: string;
    id: string;
  }>;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    link?: string;
  };
  footer?: string;
}

export interface LlmPromptContext {
  userMessage: string;
  conversationHistory?: string[];
  channel: 'whatsapp' | 'instagram' | 'messenger';
  accountId: number;
  conversationId: number;
  economicMode: boolean;
}

export interface LlmResponse<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  tokensUsed: number;
  model: string;
  latencyMs: number;
  cached: boolean;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export interface LlmConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  retryAttempts: number;
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringWindow: number;
  };
}

export interface ConversationContext {
  conversationId: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  ttl: number;
  lastUpdated: Date;
}