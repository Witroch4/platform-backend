/**
 * Types for Chatwit API integration
 */

export interface ChatwitMessagePayload {
  content: string;
  message_type: 'outgoing';
  private?: boolean;
  content_attributes?: {
    interactive?: WhatsAppInteractiveContent;
    ig?: InstagramContent;
  };
  additional_attributes: {
    provider: 'meta';
    channel: 'whatsapp' | 'instagram' | 'messenger';
    schema_version: '1.0.0';
    trace_id?: string;
    handoff_reason?: string;
    assign_to_team?: string;
    conversation_tags?: string[];
    conversation_status?: 'open' | 'resolved' | 'pending';
  };
}

export interface WhatsAppInteractiveContent {
  type: 'button';
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    link?: string;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action: {
    buttons: Array<{
      type: 'reply';
      reply: {
        id: string;
        title: string;
      };
    }>;
  };
}

export interface InstagramContent {
  quick_replies?: Array<{
    title: string;
    payload: string;
  }>;
  button_template?: {
    text: string;
    buttons: Array<{
      type: 'postback' | 'web_url';
      title: string;
      payload?: string;
      url?: string;
    }>;
  };
}

export interface ChatwitApiResponse {
  id: number;
  content: string;
  message_type: string;
  created_at: string;
  conversation_id: number;
  account_id: number;
}

export interface ChatwitApiError {
  message: string;
  errors?: Record<string, string[]>;
  status: number;
}

export interface PostMessageParams {
  accountId: number;
  conversationId: number;
  content: string;
  contentAttributes?: Record<string, any>;
  channel: 'whatsapp' | 'instagram' | 'messenger';
  traceId: string;
  additionalAttributes?: Partial<ChatwitMessagePayload['additional_attributes']>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
  nonRetryableStatuses: number[];
}

export interface ChatwitApiClientConfig {
  baseUrl: string;
  accessToken: string;
  timeout: number;
  retryConfig: RetryConfig;
}

export type RetryDecision = 
  | { shouldRetry: false; reason: string }
  | { shouldRetry: true; delay: number; reason: string };

export interface ApiCallMetrics {
  duration: number;
  status: number;
  retryCount: number;
  finalOutcome: 'success' | 'failure' | 'dlq';
}