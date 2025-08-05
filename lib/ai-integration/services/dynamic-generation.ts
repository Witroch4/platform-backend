/**
 * Dynamic Generation Service
 * Implements requirements 3.3, 3.4, 7.4
 */

import { z } from 'zod';
import { OpenAIStructuredClient, createOpenAIClient } from './openai-client';
import { SmallTalkCache, createSmallTalkCache } from './small-talk-cache';
import { 
  DynamicResponseSchema, 
  ChannelSchemaValidator,
  getChannelSchema,
  type DynamicResponse,
  type WhatsAppInteractiveMessage,
  type InstagramQuickReplyMessage,
  type InstagramButtonTemplateMessage
} from '../schemas/channel-schemas';
import { LlmPromptContext, LlmResponse } from '../types/llm';

interface DynamicGenerationOptions {
  context: LlmPromptContext;
  economicMode?: boolean;
  maxRetries?: number;
}

interface ChannelAdaptedResponse {
  success: boolean;
  data?: WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage | { text: string };
  error?: string;
  tokensUsed: number;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
}

export class DynamicGenerationService {
  private openaiClient: OpenAIStructuredClient;
  private smallTalkCache: SmallTalkCache;
  private degradationConfig: {
    highLatencyThreshold: number;
    maxConsecutiveFailures: number;
    degradationDuration: number;
  };
  private performanceMetrics: {
    consecutiveFailures: number;
    lastFailureTime: number;
    averageLatency: number[];
    degradedUntil: number;
  };

  constructor(openaiClient?: OpenAIStructuredClient, smallTalkCache?: SmallTalkCache) {
    this.openaiClient = openaiClient || createOpenAIClient();
    this.smallTalkCache = smallTalkCache || createSmallTalkCache();
    
    this.degradationConfig = {
      highLatencyThreshold: parseInt(process.env.LLM_HIGH_LATENCY_THRESHOLD || '8000'), // 8s
      maxConsecutiveFailures: parseInt(process.env.LLM_MAX_CONSECUTIVE_FAILURES || '3'),
      degradationDuration: parseInt(process.env.LLM_DEGRADATION_DURATION || '300000'), // 5 min
    };

    this.performanceMetrics = {
      consecutiveFailures: 0,
      lastFailureTime: 0,
      averageLatency: [],
      degradedUntil: 0,
    };
  }

  /**
   * Generate dynamic response for a specific channel
   */
  async generateChannelResponse(options: DynamicGenerationOptions): Promise<ChannelAdaptedResponse> {
    const startTime = Date.now();
    let tokensUsed = 0;
    let fallbackUsed = false;

    // Check for cached small-talk response first
    const cachedResponse = this.smallTalkCache.getCachedResponse(
      options.context.userMessage,
      options.context.channel,
      options.context.accountId
    );

    if (cachedResponse) {
      const adaptedResponse = await this.adaptToChannel(
        {
          text: cachedResponse.text,
          buttons: cachedResponse.buttons,
        },
        options.context.channel
      );

      return {
        success: true,
        data: adaptedResponse,
        tokensUsed: 0,
        model: 'small-talk-cache',
        latencyMs: Date.now() - startTime,
        fallbackUsed: false,
      };
    }

    // Check if we're in degraded mode
    const isDegraded = this.isDegradedMode();
    const circuitBreakerState = this.openaiClient.getCircuitBreakerState();
    
    // If circuit breaker is open or we're in degraded mode, use template/fallback
    if (circuitBreakerState.state === 'OPEN' || isDegraded) {
      return this.createDegradedResponse(options.context, startTime, 'degraded_mode');
    }

    try {
      // Apply economic mode if needed
      const economicMode = options.economicMode || options.context.economicMode || isDegraded;
      
      // Generate structured response
      const llmResponse = await this.generateStructuredResponse({
        ...options,
        economicMode,
      });
      
      const latency = Date.now() - startTime;
      tokensUsed = llmResponse.tokensUsed;

      // Track performance metrics
      this.updatePerformanceMetrics(llmResponse.success, latency);

      if (!llmResponse.success || !llmResponse.result) {
        // Fallback to simple text response
        return this.createFallbackResponse(options.context, startTime, tokensUsed);
      }

      // Check for high latency and trigger degradation if needed
      if (latency > this.degradationConfig.highLatencyThreshold) {
        this.triggerDegradation('high_latency');
      }

      // Adapt response to channel format
      const adaptedResponse = await this.adaptToChannel(llmResponse.result, options.context.channel);
      
      // Cache small-talk responses for future use
      if (this.smallTalkCache.isSmallTalk(options.context.userMessage)) {
        this.smallTalkCache.cacheResponse(
          options.context.userMessage,
          options.context.channel,
          options.context.accountId,
          {
            text: llmResponse.result.text,
            buttons: llmResponse.result.buttons,
          }
        );
      }
      
      return {
        success: true,
        data: adaptedResponse,
        tokensUsed,
        model: economicMode ? 'gpt-4o-mini-economic' : 'gpt-4o-mini',
        latencyMs: latency,
        fallbackUsed,
      };

    } catch (error) {
      // Track failure and potentially trigger degradation
      this.updatePerformanceMetrics(false, Date.now() - startTime);
      
      // Fallback on any error
      return this.createFallbackResponse(
        options.context, 
        startTime, 
        tokensUsed, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Generate structured response using OpenAI
   */
  private async generateStructuredResponse(options: DynamicGenerationOptions): Promise<LlmResponse<DynamicResponse>> {
    const systemPrompt = this.buildSystemPrompt(options.context);
    const userPrompt = this.buildUserPrompt(options.context);

    return this.openaiClient.generateStructuredOutput({
      schema: DynamicResponseSchema,
      systemPrompt,
      userPrompt,
      context: options.context,
      economicMode: options.economicMode,
    });
  }

  /**
   * Build system prompt with guardrails
   */
  private buildSystemPrompt(context: LlmPromptContext): string {
    const basePrompt = `Você é um assistente virtual inteligente para atendimento ao cliente.

REGRAS IMPORTANTES:
- Responda SEMPRE em português brasileiro
- Seja conciso, útil e profissional
- NÃO forneça informações sensíveis (senhas, dados pessoais, etc.)
- NÃO faça promessas ou compromissos fora do canal
- NÃO inclua links externos não autorizados
- NÃO use markdown ou formatação especial
- Mantenha o tom amigável mas profissional

FORMATO DE RESPOSTA:
- Texto principal: máximo ${context.economicMode ? '200' : '500'} caracteres
- Botões (opcional): máximo 3 botões com títulos únicos e concisos
- Use botões para ações comuns: "Falar com atendente", "Rastrear pedido", "Ver produtos"

CANAL: ${context.channel.toUpperCase()}
${context.channel === 'whatsapp' ? '- Use botões de resposta rápida quando apropriado' : ''}
${context.channel === 'instagram' ? '- Prefira quick replies para múltiplas opções' : ''}`;

    return basePrompt;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(context: LlmPromptContext): string {
    let prompt = `Mensagem do usuário: "${context.userMessage}"`;

    // Add conversation history if available
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-3); // Last 3 messages
      prompt += `\n\nHistórico recente da conversa:\n${recentHistory.join('\n')}`;
    }

    prompt += `\n\nGere uma resposta útil e apropriada para esta mensagem.`;

    if (context.economicMode) {
      prompt += ` (Modo econômico: resposta curta e direta)`;
    }

    return prompt;
  }

  /**
   * Adapt generic response to channel-specific format
   */
  private async adaptToChannel(
    response: DynamicResponse, 
    channel: 'whatsapp' | 'instagram' | 'messenger'
  ): Promise<WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage | { text: string }> {
    
    // If no buttons, return simple text
    if (!response.buttons || response.buttons.length === 0) {
      return { text: response.text };
    }

    switch (channel) {
      case 'whatsapp':
        return this.adaptToWhatsApp(response);
      
      case 'instagram':
        // Decide between quick reply and button template
        const hasWebUrls = response.buttons.some(btn => btn.type === 'url' && btn.url);
        return hasWebUrls ? 
          this.adaptToInstagramButtonTemplate(response) : 
          this.adaptToInstagramQuickReply(response);
      
      case 'messenger':
        // Messenger uses similar format to Instagram
        return this.adaptToInstagramQuickReply(response);
      
      default:
        return { text: response.text };
    }
  }

  /**
   * Adapt to WhatsApp interactive format
   */
  private adaptToWhatsApp(response: DynamicResponse): WhatsAppInteractiveMessage | { text: string } {
    const whatsappData = {
      body: response.text,
      buttons: response.buttons!.map(btn => ({
        type: 'reply' as const,
        title: btn.title,
        id: btn.id,
      })),
      header: response.header,
      footer: response.footer,
    };

    const validation = ChannelSchemaValidator.validateWhatsApp(whatsappData);
    
    if (validation.valid && validation.data) {
      return validation.data;
    }

    // Fallback to simple text if validation fails
    return { text: response.text };
  }

  /**
   * Adapt to Instagram quick reply format
   */
  private adaptToInstagramQuickReply(response: DynamicResponse): InstagramQuickReplyMessage | { text: string } {
    const instagramData = {
      text: response.text,
      quick_replies: response.buttons!.map(btn => ({
        content_type: 'text' as const,
        title: btn.title,
        payload: btn.id,
      })),
    };

    const validation = ChannelSchemaValidator.validateInstagramQuickReply(instagramData);
    
    if (validation.valid && validation.data) {
      return validation.data;
    }

    // Fallback to simple text if validation fails
    return { text: response.text };
  }

  /**
   * Adapt to Instagram button template format
   */
  private adaptToInstagramButtonTemplate(response: DynamicResponse): InstagramButtonTemplateMessage | { text: string } {
    const instagramData = {
      text: response.text,
      buttons: response.buttons!.map(btn => {
        if (btn.type === 'url' && btn.url) {
          return {
            type: 'web_url' as const,
            title: btn.title,
            url: btn.url,
          };
        } else {
          return {
            type: 'postback' as const,
            title: btn.title,
            payload: btn.id,
          };
        }
      }),
    };

    const validation = ChannelSchemaValidator.validateInstagramButtonTemplate(instagramData);
    
    if (validation.valid && validation.data) {
      return validation.data;
    }

    // Fallback to simple text if validation fails
    return { text: response.text };
  }

  /**
   * Create fallback response when LLM fails
   */
  private createFallbackResponse(
    context: LlmPromptContext, 
    startTime: number, 
    tokensUsed: number,
    error?: string
  ): ChannelAdaptedResponse {
    const fallbackText = this.getFallbackText(context);
    
    let fallbackData: any = { text: fallbackText };

    // Add "Falar com atendente" button for interactive channels
    if (context.channel === 'whatsapp') {
      fallbackData = {
        body: fallbackText,
        buttons: [{
          type: 'reply',
          title: 'Falar com atendente',
          id: 'human_handoff',
        }],
      };
    } else if (context.channel === 'instagram') {
      fallbackData = {
        text: fallbackText,
        quick_replies: [{
          content_type: 'text',
          title: 'Falar com atendente',
          payload: 'human_handoff',
        }],
      };
    }

    return {
      success: true,
      data: fallbackData,
      error,
      tokensUsed,
      model: 'fallback',
      latencyMs: Date.now() - startTime,
      fallbackUsed: true,
    };
  }

  /**
   * Get appropriate fallback text based on context
   */
  private getFallbackText(context: LlmPromptContext): string {
    const fallbackMessages = [
      'Obrigado pela sua mensagem! Vou conectar você com um de nossos atendentes.',
      'Recebi sua mensagem. Um atendente especializado irá ajudá-lo em breve.',
      'Sua mensagem é importante para nós. Acionei um atendente para melhor ajudá-lo.',
    ];

    // Simple hash to pick consistent fallback for same conversation
    const hash = context.conversationId % fallbackMessages.length;
    return fallbackMessages[hash];
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.openaiClient.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState() {
    return this.openaiClient.getCircuitBreakerState();
  }

  /**
   * Check if system is in degraded mode
   */
  private isDegradedMode(): boolean {
    return Date.now() < this.performanceMetrics.degradedUntil;
  }

  /**
   * Update performance metrics and check for degradation triggers
   */
  private updatePerformanceMetrics(success: boolean, latency: number): void {
    // Update latency tracking (keep last 10 measurements)
    this.performanceMetrics.averageLatency.push(latency);
    if (this.performanceMetrics.averageLatency.length > 10) {
      this.performanceMetrics.averageLatency.shift();
    }

    if (success) {
      // Reset consecutive failures on success
      this.performanceMetrics.consecutiveFailures = 0;
    } else {
      // Track consecutive failures
      this.performanceMetrics.consecutiveFailures++;
      this.performanceMetrics.lastFailureTime = Date.now();

      // Trigger degradation if too many consecutive failures
      if (this.performanceMetrics.consecutiveFailures >= this.degradationConfig.maxConsecutiveFailures) {
        this.triggerDegradation('consecutive_failures');
      }
    }
  }

  /**
   * Trigger degradation mode
   */
  private triggerDegradation(reason: 'high_latency' | 'consecutive_failures' | '429_errors' | '5xx_errors'): void {
    this.performanceMetrics.degradedUntil = Date.now() + this.degradationConfig.degradationDuration;
    
    // Log degradation trigger (in production, this would be a proper log)
    console.warn(`LLM degradation triggered: ${reason}. Degraded until: ${new Date(this.performanceMetrics.degradedUntil).toISOString()}`);
  }

  /**
   * Create degraded response (short template-based response)
   */
  private createDegradedResponse(
    context: LlmPromptContext,
    startTime: number,
    reason: string
  ): ChannelAdaptedResponse {
    const degradedTemplates = this.getDegradedTemplates(context.channel);
    
    // Simple hash to pick consistent template for same conversation
    const templateIndex = context.conversationId % degradedTemplates.length;
    const template = degradedTemplates[templateIndex];

    let degradedData: any;

    if (context.channel === 'whatsapp') {
      degradedData = {
        body: template.text,
        buttons: template.buttons?.map(btn => ({
          type: 'reply',
          title: btn.title,
          id: btn.id,
        })) || [{
          type: 'reply',
          title: 'Falar com atendente',
          id: 'human_handoff',
        }],
      };
    } else if (context.channel === 'instagram') {
      degradedData = {
        text: template.text,
        quick_replies: template.buttons?.map(btn => ({
          content_type: 'text',
          title: btn.title,
          payload: btn.id,
        })) || [{
          content_type: 'text',
          title: 'Falar com atendente',
          payload: 'human_handoff',
        }],
      };
    } else {
      degradedData = { text: template.text };
    }

    return {
      success: true,
      data: degradedData,
      error: `Degraded mode: ${reason}`,
      tokensUsed: 0,
      model: 'degraded-template',
      latencyMs: Date.now() - startTime,
      fallbackUsed: true,
    };
  }

  /**
   * Get degraded mode templates by channel
   */
  private getDegradedTemplates(channel: string) {
    const templates = [
      {
        text: 'Obrigado pela mensagem! Um atendente irá ajudá-lo em breve.',
        buttons: [
          { title: 'Urgente', id: 'priority_high' },
          { title: 'Normal', id: 'priority_normal' },
        ],
      },
      {
        text: 'Recebi sua mensagem. Como posso ajudar?',
        buttons: [
          { title: 'Suporte', id: 'support' },
          { title: 'Vendas', id: 'sales' },
        ],
      },
      {
        text: 'Olá! Estou aqui para ajudar.',
        buttons: [
          { title: 'Ajuda', id: 'help' },
          { title: 'Contato', id: 'contact' },
        ],
      },
    ];

    return templates;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const avgLatency = this.performanceMetrics.averageLatency.length > 0
      ? this.performanceMetrics.averageLatency.reduce((a, b) => a + b, 0) / this.performanceMetrics.averageLatency.length
      : 0;

    return {
      consecutiveFailures: this.performanceMetrics.consecutiveFailures,
      lastFailureTime: this.performanceMetrics.lastFailureTime,
      averageLatency: Math.round(avgLatency),
      isDegraded: this.isDegradedMode(),
      degradedUntil: this.performanceMetrics.degradedUntil,
      circuitBreakerState: this.openaiClient.getCircuitBreakerState(),
    };
  }

  /**
   * Force degradation mode (for testing/admin)
   */
  forceDegradation(durationMs: number = this.degradationConfig.degradationDuration): void {
    this.performanceMetrics.degradedUntil = Date.now() + durationMs;
  }

  /**
   * Clear degradation mode
   */
  clearDegradation(): void {
    this.performanceMetrics.degradedUntil = 0;
    this.performanceMetrics.consecutiveFailures = 0;
  }

  /**
   * Get small-talk cache statistics
   */
  getSmallTalkCacheStats() {
    return this.smallTalkCache.getStats();
  }

  /**
   * Clear small-talk cache
   */
  clearSmallTalkCache(): void {
    this.smallTalkCache.clear();
  }
}

/**
 * Factory function to create dynamic generation service
 */
export function createDynamicGenerationService(
  openaiClient?: OpenAIStructuredClient,
  smallTalkCache?: SmallTalkCache
): DynamicGenerationService {
  return new DynamicGenerationService(openaiClient, smallTalkCache);
}