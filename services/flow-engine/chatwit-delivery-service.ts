/**
 * ChatwitDeliveryService — Entrega de mensagens via API Chatwit
 *
 * Responsável por enviar mensagens (texto, mídia, interactive) através
 * da API REST do Chatwit quando a ponte síncrona não é mais viável.
 *
 * Usa `api_access_token` do Agent Bot configurado no Chatwit.
 *
 * @see docs/interative_message_flow_builder.md §14.3
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import log from '@/lib/log';
import type { DeliveryContext, DeliveryPayload } from '@/types/flow-engine';

// =============================================================================
// Config
// =============================================================================

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

// =============================================================================
// Types
// =============================================================================

export interface DeliveryResult {
  success: boolean;
  messageId?: number;
  error?: string;
  attempts: number;
}

interface ChatwitMessagePayload {
  content?: string;
  content_type?: string;
  content_attributes?: Record<string, unknown>;
  message_type: 'outgoing';
  private?: boolean;
  /** Para mídia */
  attachments?: Array<{
    content: string; // URL
    data_type: string; // 'image', 'file', etc.
    file_type?: string;
  }>;
}

// =============================================================================
// Service
// =============================================================================

export class ChatwitDeliveryService {
  private client: AxiosInstance;

  constructor(baseUrl: string, accessToken: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'api_access_token': accessToken,
        'Content-Type': 'application/json',
        'User-Agent': 'SocialWise-FlowEngine/1.0',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Entrega genérica — decide o método com base no `payload.type`.
   */
  async deliver(
    ctx: DeliveryContext,
    payload: DeliveryPayload,
  ): Promise<DeliveryResult> {
    switch (payload.type) {
      case 'text':
        return this.deliverText(ctx, payload.content ?? '', payload.private);
      case 'media':
        return this.deliverMedia(
          ctx,
          payload.mediaUrl ?? '',
          payload.filename,
          payload.content,
        );
      case 'interactive':
        return this.deliverInteractive(
          ctx,
          payload.interactivePayload ?? {},
        );
      default:
        log.warn('[ChatwitDelivery] Tipo de payload desconhecido', { type: payload.type });
        return { success: false, error: `Tipo desconhecido: ${payload.type}`, attempts: 0 };
    }
  }

  /**
   * Envia mensagem de texto simples.
   */
  async deliverText(
    ctx: DeliveryContext,
    content: string,
    isPrivate?: boolean,
  ): Promise<DeliveryResult> {
    const body: ChatwitMessagePayload = {
      content,
      message_type: 'outgoing',
      private: isPrivate ?? false,
    };

    return this.postMessage(ctx, body);
  }

  /**
   * Envia arquivo/mídia (PDF, imagem, áudio, etc.).
   */
  async deliverMedia(
    ctx: DeliveryContext,
    mediaUrl: string,
    filename?: string,
    caption?: string,
  ): Promise<DeliveryResult> {
    const ext = (filename ?? mediaUrl).split('.').pop()?.toLowerCase() ?? '';
    const dataType = this.resolveDataType(ext);

    const body: ChatwitMessagePayload = {
      content: caption ?? '',
      message_type: 'outgoing',
      attachments: [
        {
          content: mediaUrl,
          data_type: dataType,
          file_type: ext,
        },
      ],
    };

    return this.postMessage(ctx, body);
  }

  /**
   * Envia mensagem interativa (botões, lista, etc.).
   * Requer que o Chatwit suporte `content_type: interactive`.
   */
  async deliverInteractive(
    ctx: DeliveryContext,
    interactivePayload: Record<string, unknown>,
  ): Promise<DeliveryResult> {
    const body: ChatwitMessagePayload = {
      content: '',
      content_type: 'interactive',
      content_attributes: interactivePayload,
      message_type: 'outgoing',
    };

    return this.postMessage(ctx, body);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async postMessage(
    ctx: DeliveryContext,
    body: ChatwitMessagePayload,
  ): Promise<DeliveryResult> {
    const url = `/api/v1/accounts/${ctx.accountId}/conversations/${ctx.conversationId}/messages`;

    let lastError = '';
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const res = await this.client.post(url, body);
        const messageId = res.data?.id ?? res.data?.data?.id;

        log.debug('[ChatwitDelivery] Mensagem enviada', {
          messageId,
          conversationId: ctx.conversationId,
          type: body.content_type ?? 'text',
          attempt,
        });

        return { success: true, messageId, attempts: attempt };
      } catch (err) {
        const axiosErr = err as AxiosError;
        lastError = axiosErr.message;
        const status = axiosErr.response?.status;

        // Não tentar de novo para erros 4xx (exceto 429 rate limit)
        if (status && status >= 400 && status < 500 && status !== 429) {
          log.error('[ChatwitDelivery] Erro não-retriable', {
            status,
            message: lastError,
            url,
          });
          return { success: false, error: lastError, attempts: attempt };
        }

        // Exponential backoff
        if (attempt < RETRY_ATTEMPTS) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          log.warn('[ChatwitDelivery] Retry', { attempt, delay, error: lastError });
          await this.sleep(delay);
        }
      }
    }

    log.error('[ChatwitDelivery] Todas as tentativas falharam', {
      url,
      attempts: RETRY_ATTEMPTS,
      lastError,
    });

    return { success: false, error: lastError, attempts: RETRY_ATTEMPTS };
  }

  private resolveDataType(ext: string): string {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'opus'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi'];

    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (videoExts.includes(ext)) return 'video';
    return 'file';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Cria instância a partir do DeliveryContext.
 */
export function createDeliveryService(ctx: DeliveryContext): ChatwitDeliveryService {
  return new ChatwitDeliveryService(ctx.chatwitBaseUrl, ctx.chatwitAccessToken);
}
