/**
 * SocialWise Flow Optimized Webhook Endpoint
 * Unified optimized flow with intelligent classification, performance bands,
 * concurrency control, and comprehensive monitoring
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { withPrismaReconnect } from '@/lib/connections';

// SocialWise Flow optimized components
import { processSocialWiseFlow, extractSessionId } from '@/lib/socialwise-flow/processor';
import { buildChannelResponse } from '@/lib/socialwise-flow/channel-formatting';
import { SocialWiseFlowPayloadSchema, SanitizedTextSchema, validateSocialWisePayloadWithPreprocessing, type SocialWiseFlowPayloadType, type SocialWiseChatwitData } from '@/lib/socialwise-flow/schemas/payload';
import { SocialWiseIdempotencyService } from '@/lib/socialwise-flow/services/idempotency';
import { SocialWiseRateLimiterService } from '@/lib/socialwise-flow/services/rate-limiter';
import { SocialWiseReplayProtectionService } from '@/lib/socialwise-flow/services/replay-protection';
import { recordSocialWiseQualitySample } from '@/lib/socialwise-flow/monitoring-dashboard';
import { recordWebhookMetrics } from '@/lib/monitoring/application-performance-monitor';
import { getAssistantForInbox } from '@/lib/socialwise/assistant';
// Template functions removed - now using full SocialWise Flow for all button processing

// 🔧 CORREÇÃO: Usar button-processor centralizado
import { handleButtonInteraction } from '@/lib/socialwise-flow/button-processor';

// Constants
const MAX_PAYLOAD_SIZE_KB = 256;
const WEBHOOK_TIMEOUT_MS = 400; // P95 SLA target

// Logger
const webhookLogger = createLogger('SocialwiseFlowWebhook');

/**
 * Helper function to safely access socialwise-chatwit data
 */
function getSocialWiseChatwitData(context: any): SocialWiseChatwitData | undefined {
  return context['socialwise-chatwit'] as SocialWiseChatwitData | undefined;
}

/**
 * Sanitize user input text
 */
function sanitizeUserText(text: string) {
  return SanitizedTextSchema.safeParse(text);
}

/**
 * Normalize intent text to a plain name (no prefixes) and a standard external id (intent:name)
 */
function normalizeIntentId(raw: string): { plain: string; standardId: string } {
  const original = String(raw || '').trim();
  let plain = original;
  if (plain.toLowerCase().startsWith('intent:')) plain = plain.slice('intent:'.length).trim();
  if (plain.startsWith('@')) plain = plain.slice(1).trim();
  plain = plain.replace(/\s+/g, ' ');
  return { plain, standardId: `intent:${plain}` };
}

/**
 * Build channel-specific response for legacy compatibility
 */
/**
 * Log humanizado da resposta final enviada para o Chatwit
 */
function logFinalResponse(responseData: any, status: number, traceId?: string) {
  const responseSize = JSON.stringify(responseData).length;
  const responseSizeKB = Math.round((responseSize / 1024) * 100) / 100;
  
  webhookLogger.info('📤 CHATWIT FINAL RESPONSE DEBUG', {
    timestamp: new Date().toISOString(),
    responseSizeKB,
    responseLength: responseSize,
    status,
    traceId,
    responseData: JSON.stringify(responseData, null, 2)
  });
}


/**
 * POST /api/integrations/webhooks/socialwiseflow
 * Optimized SocialWise Flow webhook endpoint with unified processing
 */
export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  const startTime = Date.now();
  let traceId: string | undefined;
  let correlationId: string | undefined;

  try {
    // Step 1: Bearer token authentication (required for SocialWise Flow)
    const expectedBearer = process.env.SOCIALWISEFLOW_ACCESS_TOKEN;
    if (expectedBearer) {
      const authz = request.headers.get('authorization') || '';
      if (!authz.toLowerCase().startsWith('bearer ') || authz.slice(7).trim() !== expectedBearer) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Step 2: Read and validate payload size
    const rawBody = await request.text();
    const payloadSizeKB = Buffer.byteLength(rawBody, 'utf8') / 1024;
    
    // 🐛 DEBUG: Log do payload RAW original exato que o Chatwit envia
    webhookLogger.info('🔍 CHATWIT ORIGINAL RAW PAYLOAD DEBUG', {
      timestamp: new Date().toISOString(),
      payloadSizeKB: Number(payloadSizeKB.toFixed(2)),
      rawBodyString: rawBody,
      rawBodyLength: rawBody.length,
      headers: {
        'content-type': request.headers.get('content-type'),
        'user-agent': request.headers.get('user-agent'),
        'x-forwarded-for': request.headers.get('x-forwarded-for'),
        authorization: request.headers.get('authorization') ? '[REDACTED]' : null,
      },
      method: request.method,
      url: request.url
    });
    
    if (payloadSizeKB > MAX_PAYLOAD_SIZE_KB) {
      webhookLogger.error('Payload too large', { 
        sizeKB: payloadSizeKB, 
        maxSizeKB: MAX_PAYLOAD_SIZE_KB 
      });
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      );
    }

    // Step 3: Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
      
      // 🐛 DEBUG: Log do payload JSON parseado para comparação
      webhookLogger.info('📋 CHATWIT PARSED JSON PAYLOAD DEBUG', {
        timestamp: new Date().toISOString(),
        parsedPayload: payload,
        payloadType: typeof payload,
        payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : null,
        hasContext: payload?.context ? true : false,
        hasMessage: payload?.context?.message ? true : false,
        hasSocialwiseChatwit: payload?.context?.['socialwise-chatwit'] ? true : false
      });
      
    } catch (error) {
      webhookLogger.error('Invalid JSON payload', { 
        error: error instanceof Error ? error.message : String(error),
        rawBodyPreview: rawBody.substring(0, 200) + (rawBody.length > 200 ? '...' : '')
      });
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Step 4: Validate SocialWise Flow payload structure with preprocessing
    const payloadValidation = validateSocialWisePayloadWithPreprocessing(payload);
    if (!payloadValidation.success) {
      webhookLogger.error('Invalid payload schema', { 
        errors: payloadValidation.error?.errors?.map(err => ({
          code: err.code,
          path: err.path,
          message: err.message,
          ...(err.code === 'invalid_type' && 'expected' in err && 'received' in err ? {
            expected: err.expected,
            received: err.received
          } : {})
        })),
        originalPayload: payload,
        preprocessedPayload: payloadValidation.preprocessed
      });
      return NextResponse.json(
        { error: 'Invalid payload structure', details: payloadValidation.error?.errors },
        { status: 400 }
      );
    }
    const validPayload = payloadValidation.data!;
    
    webhookLogger.debug('Payload validation successful', {
      originalHadNumbers: JSON.stringify(payload) !== JSON.stringify(payloadValidation.preprocessed),
      traceId
    });

    // Step 5: Generate trace ID for monitoring
    traceId = `sw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // Priority order: context.message.source_id > socialwise-chatwit.wamid > socialwise-chatwit.message_data.id > context.message.id
    const socialwiseDataForCorrelation = getSocialWiseChatwitData(validPayload.context);
    correlationId = String(
      validPayload.context.message?.source_id ||
      socialwiseDataForCorrelation?.wamid || 
      socialwiseDataForCorrelation?.message_data?.id ||
      validPayload.context.message?.id ||
      traceId
    );

    // Step 6: Initialize security services
    const socialWiseIdempotency = new SocialWiseIdempotencyService();
    const socialWiseRateLimit = new SocialWiseRateLimiterService();
    const socialWiseReplayProtection = new SocialWiseReplayProtectionService();

    // Step 7: Replay protection (when bearer token is active)
    if (expectedBearer) {
      const nonce = socialWiseReplayProtection.extractNonceFromRequest(request);
      if (nonce) {
        const replayResult = await socialWiseReplayProtection.checkAndMarkNonce(nonce);
        if (!replayResult.allowed) {
          webhookLogger.warn('Replay protection triggered', { 
            nonce, 
            error: replayResult.error,
            traceId 
          });
          return NextResponse.json(
            { error: 'Replay detected', details: replayResult.error },
            { status: 400 }
          );
        }
      }
    }

    // Step 8: Idempotency check
    const isDuplicate = await socialWiseIdempotency.isPayloadDuplicate(validPayload);
    if (isDuplicate) {
      const socialwiseDataForLog = getSocialWiseChatwitData(validPayload.context);
      webhookLogger.info('Duplicate message detected', {
        sessionId: validPayload.session_id,
        accountId: socialwiseDataForLog?.account_data?.id || validPayload.context.inbox?.account_id,
        inboxId: socialwiseDataForLog?.inbox_data?.id || validPayload.context.inbox?.id,
        traceId
      });
      const dedupResponse = { ok: true, dedup: true };
      logFinalResponse(dedupResponse, 200, traceId);
      return NextResponse.json(dedupResponse, { status: 200 });
    }

    // Step 9: Rate limiting
    const rateLimitResult = await socialWiseRateLimit.checkPayloadRateLimit(validPayload, request);
    if (!rateLimitResult.allowed) {
      const socialwiseDataForLog = getSocialWiseChatwitData(validPayload.context);
      webhookLogger.warn('Rate limit exceeded', {
        sessionId: validPayload.session_id,
        accountId: socialwiseDataForLog?.account_data?.id || validPayload.context.inbox?.account_id,
        inboxId: socialwiseDataForLog?.inbox_data?.id || validPayload.context.inbox?.id,
        scope: rateLimitResult.scope,
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        traceId
      });
      
      return NextResponse.json(
        { error: 'Rate limit exceeded', throttled: true },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
            'X-RateLimit-Scope': rateLimitResult.scope,
          }
        }
      );
    }

    // Step 10: Sanitize user input
    const sanitizedText = sanitizeUserText(validPayload.message);
    if (!sanitizedText.success) {
      webhookLogger.error('Input sanitization failed', { 
        error: sanitizedText.error,
        traceId 
      });
      return NextResponse.json(
        { error: 'Invalid message content', details: sanitizedText.error },
        { status: 400 }
      );
    }
    let textInput = sanitizedText.data!;

    // Step 10.1: Check for native handoff payloads BEFORE content processing
    const contentAttrs = (validPayload.context?.message?.content_attributes || {}) as any;
    const quickReplyPayload = contentAttrs.quick_reply_payload;
    const postbackPayload = contentAttrs.postback_payload;
    
    // Check quick_reply_payload for handoff
    if (quickReplyPayload && quickReplyPayload.toLowerCase() === '@falar_atendente') {
      webhookLogger.info('🚨 NATIVE HANDOFF detected in quick_reply_payload', {
        quickReplyPayload,
        messageContent: textInput,
        traceId
      });
      const handoffResponse = { action: 'handoff' };
      logFinalResponse(handoffResponse, 200, traceId);
      return NextResponse.json(handoffResponse, { status: 200 });
    }
    
    // Check postback_payload for handoff
    if (postbackPayload && postbackPayload.toLowerCase() === '@falar_atendente') {
      webhookLogger.info('🚨 NATIVE HANDOFF detected in postback_payload', {
        postbackPayload,
        messageContent: textInput,
        traceId
      });
      const handoffResponse = { action: 'handoff' };
      logFinalResponse(handoffResponse, 200, traceId);
      return NextResponse.json(handoffResponse, { status: 200 });
    }

    // Step 11: Extract context from validated payload
    const rootChannelType = validPayload.channel_type;
    const socialwiseData = getSocialWiseChatwitData(validPayload.context);
    const ctxChannelType = socialwiseData?.inbox_data?.channel_type || validPayload.context.inbox?.channel_type;
    const channelType = rootChannelType || ctxChannelType || 'unknown';
    const externalInboxNumeric = socialwiseData?.inbox_data?.id || validPayload.context.inbox?.id || 0;
    const chatwitAccountId = socialwiseData?.account_data?.id || validPayload.context.inbox?.account_id || 0;
    // Priority order: context.message.source_id > socialwise-chatwit.wamid > socialwise-chatwit.message_data.id
    const wamid = String(validPayload.context.message?.source_id ||
                  socialwiseData?.wamid || 
                  socialwiseData?.message_data?.id || '');
    
    // Extract contact information for variable resolution with fallbacks
    const contactName = socialwiseData?.contact_data?.name || 
                       validPayload.context.contact?.name ||
                       socialwiseData?.contact_name;
    const contactPhone = socialwiseData?.contact_data?.phone_number || 
                        validPayload.context.contact?.phone_number ||
                        socialwiseData?.contact_phone;

    // Step 12: Resolve inbox and user information
    const inboxRow = await withPrismaReconnect(async (prisma) => {
      return prisma.chatwitInbox.findFirst({
        where: {
          inboxId: String(externalInboxNumeric),
          usuarioChatwit: { chatwitAccountId: String(chatwitAccountId) || undefined },
        },
        select: {
          id: true,
          inboxId: true,
          nome: true,
          usuarioChatwit: { select: { appUserId: true, chatwitAccountId: true } },
        },
      });
    });
    
    const inboxId = String(inboxRow?.inboxId || externalInboxNumeric || '');
    const userId = (inboxRow as any)?.usuarioChatwit?.appUserId;

    webhookLogger.info('Processing SocialWise Flow request', { 
      channelType,
      inboxId,
      userId,
      textLength: textInput.length,
      traceId
    });

    // Step 13: Enhanced button interaction detection and processing
    const buttonReactionResponse = await handleButtonInteraction(
      validPayload,
      channelType,
      userId,
      wamid,
      traceId!
    );

    if (buttonReactionResponse) {
      webhookLogger.info('🎯 Button interaction processed successfully', {
        buttonId: buttonReactionResponse.buttonId,
        mappingFound: buttonReactionResponse.mappingFound,
        hasEmoji: !!buttonReactionResponse.emoji,
        hasText: !!buttonReactionResponse.text,
        traceId
      });

      logFinalResponse(buttonReactionResponse, 200, traceId);
      return NextResponse.json(buttonReactionResponse, { status: 200 });
    }

    // Check if this is an unmapped button click that should be processed by LLM
    const ca = (validPayload.context.message?.content_attributes || {}) as any;
    const socialwiseForButtons = getSocialWiseChatwitData(validPayload.context);
    const swInteractive = socialwiseForButtons?.message_data?.interactive_data || {};
    const swInstagram = socialwiseForButtons?.message_data?.instagram_data || {};
    
    // Detect unmapped button clicks
    let unmappedButtonId: string | null = null;
    if (channelType.toLowerCase().includes('whatsapp')) {
      unmappedButtonId = ca?.button_reply?.id || (validPayload.context as any)?.button_id || null;
    } else if (channelType.toLowerCase().includes('instagram') || channelType.toLowerCase().includes('facebook')) {
      // Meta Platforms (Instagram + Facebook) usam a mesma estrutura
      unmappedButtonId = ca?.postback_payload || ca?.quick_reply_payload || 
                        (validPayload.context as any)?.postback_payload || 
                        (validPayload.context as any)?.quick_reply_payload || null;
    }
    
    webhookLogger.debug('🔍 Debug unmapped button detection', {
      channelType,
      unmappedButtonId,
      caPostbackPayload: ca?.postback_payload,
      contextPostbackPayload: (validPayload.context as any)?.postback_payload,
      contextInteractionType: (validPayload.context as any)?.interaction_type,
      caInteractionType: ca?.interaction_type,
      traceId
    });
    
    // If it's an unmapped button, use the real button text (message field) as input for LLM
    const isWhatsAppButton = unmappedButtonId && (validPayload.context as any)?.interaction_type === 'button_reply';
    const isMetaButton = unmappedButtonId && (channelType.toLowerCase().includes('instagram') || channelType.toLowerCase().includes('facebook')) && 
                        (ca?.postback_payload || ca?.quick_reply_payload);
    
    if (unmappedButtonId && (isWhatsAppButton || isMetaButton)) {
      // Usar o campo 'message' que contém o texto real do botão
      // Isso é padronizado entre WhatsApp e Meta Platforms (Instagram/Facebook)
      const realButtonText = validPayload.message || validPayload.context?.message?.content;
      
      webhookLogger.debug('🔍 Debug button text extraction', {
        unmappedButtonId,
        isWhatsAppButton,
        isMetaButton,
        validPayloadMessage: validPayload.message,
        contextMessageContent: validPayload.context?.message?.content,
        realButtonText,
        currentTextInput: textInput,
        interactionType: (validPayload.context as any)?.interaction_type,
        traceId
      });
      
      if (realButtonText) {
        // Se temos o texto real do botão, usar ele (mesmo que seja igual ao textInput atual)
        textInput = realButtonText;
        
        webhookLogger.info('🔄 Unmapped button detected, using real button text for LLM processing', {
          originalButtonId: unmappedButtonId,
          realButtonText: realButtonText,
          traceId
        });
      } else {
        // Fallback: usar buttonId se não houver campo message
        const buttonText = unmappedButtonId.startsWith('@') ? unmappedButtonId.substring(1) : unmappedButtonId;
        textInput = buttonText;
        
        webhookLogger.info('🔄 Unmapped button detected, using buttonId as fallback for LLM processing', {
          originalButtonId: unmappedButtonId,
          fallbackText: buttonText,
          traceId
        });
      }
    }

    // Direct handoff for specific button IDs only - do not try direct intent mapping
    if (unmappedButtonId && unmappedButtonId.toLowerCase() === '@falar_atendente') {
      const handoffResponse = { action: 'handoff' };
      logFinalResponse(handoffResponse, 200, traceId);
      return NextResponse.json(handoffResponse, { status: 200 });
    }

    // For all other unmapped buttons, let them go through the full flow:
    // text input → direct alias hit → embedding → classification by bands
    // This ensures proper intent resolution through the complete SocialWise Flow

    // Legacy button processing para compatibilidade
    const interactionType: string | null =
      ca?.interaction_type ||
      swInteractive?.interaction_type ||
      swInstagram?.interaction_type ||
      null;

    const legacyButtonReply = ca?.button_reply || ca?.interactive_payload?.button_reply || {};
    const legacyDerivedButtonId: string | null =
      legacyButtonReply?.id ||
      swInteractive?.button_id ||
      ca?.postback_payload ||
      swInstagram?.postback_payload ||
      null;
    const legacyButtonTitle: string | null =
      legacyButtonReply?.title ||
      swInteractive?.button_title ||
      null;

    // Handle legacy button interactions (se não foi processado pelo novo sistema)
    // Allow handoff buttons to be processed by legacy even if detected as unmapped
    const isHandoffButton = unmappedButtonId === '@falar_atendente';
    if ((interactionType === 'button_reply' || interactionType === 'postback') && legacyDerivedButtonId && !buttonReactionResponse && (!unmappedButtonId || isHandoffButton)) {
      const idLower = String(legacyDerivedButtonId).toLowerCase();
      const titleLower = String(legacyButtonTitle || '').toLowerCase();
      
      // Direct automations: btn_* or ig_* or fb_*
      if (idLower.startsWith('btn_') || idLower.startsWith('ig_') || idLower.startsWith('fb_')) {
        // Handoff shortcuts
        if (idLower.includes('handoff') || titleLower.includes('falar') || 
            titleLower.includes('atendente') || titleLower.includes('humano')) {
          const handoffResponse = { action: 'handoff' };
        logFinalResponse(handoffResponse, 200, traceId);
        return NextResponse.json(handoffResponse, { status: 200 });
        }
        // No IA processing needed for direct automations
        const emptyResponse = {};
        logFinalResponse(emptyResponse, 200, traceId);
        return NextResponse.json(emptyResponse, { status: 200 });
      }
      
      // Intent mapping: intent:<name> or @<name>
      if (idLower.startsWith('intent:') || idLower.startsWith('@')) {
        // Direct handoff for specific button IDs only
        if (idLower === '@falar_atendente') {
          const handoffResponse = { action: 'handoff' };
          logFinalResponse(handoffResponse, 200, traceId);
          return NextResponse.json(handoffResponse, { status: 200 });
        }
        
        // For all other intent buttons, let them go through the full SocialWise Flow
        // This ensures proper direct alias hit → embedding → classification process
        const norm = normalizeIntentId(String(legacyDerivedButtonId));
        const rawIntent = norm.plain;
        
        // Use the raw intent text as input for the full flow processing
        textInput = rawIntent;
        
        webhookLogger.info('Legacy button will be processed through full SocialWise Flow', { 
          buttonId: legacyDerivedButtonId,
          rawIntent,
          channelType,
          traceId 
        });
        
        // Continue to Step 14 for full flow processing
      }
      
      // Conversational continuation: ia_* - treat button title as user message
      if (idLower.startsWith('ia_')) {
        const syntheticText = String(legacyButtonTitle || textInput || '').trim();
        // Process as regular text input through optimized flow
        textInput = syntheticText;
      }
    }

    // Step 14: Main SocialWise Flow Processing
    try {
      const processorContext = {
        userText: textInput,
        channelType,
        inboxId,
        chatwitAccountId: String(chatwitAccountId),
        userId,
        wamid,
        traceId,
        contactName,
        contactPhone: typeof contactPhone === 'string' ? contactPhone : undefined,
        originalPayload: payload, // For button reaction detection
        sessionId: extractSessionId(payload, channelType) // For conversational memory
      };

      // Get agent configuration for embedipreview setting
      const assistant = await getAssistantForInbox(inboxId, String(chatwitAccountId));
      const embedipreview = assistant?.embedipreview ?? true; // Default: embedding-first if assistant not found
      
      webhookLogger.info('Agent routing strategy configuration', {
        assistantId: assistant?.id || 'not-found',
        embedipreview,
        strategy: embedipreview ? 'embedding-first' : 'llm-first',
        traceId
      });

      webhookLogger.info('Starting SocialWise Flow processing', {
        userText: textInput,
        channelType,
        inboxId,
        userId,
        traceId
      });

      // Process through optimized SocialWise Flow
      const result = await processSocialWiseFlow(processorContext, embedipreview);
      
      const routeTotalMs = Date.now() - startTime;

      // Record performance metrics
      const coldStart = process.uptime() < 120; // 2 min pós-boot/deploy
        const aliasHit = result.metrics.band === 'HARD'
          && result.metrics.strategy === 'direct_map'
          && (result.metrics.embeddingMs ?? 0) <= 15
          && (result.metrics.score ?? 0) >= 0.95;

      recordWebhookMetrics({
        responseTime: routeTotalMs,
        timestamp: new Date(),
        correlationId: correlationId!,
        success: true,
        payloadSize: payloadSizeKB * 1024,
        interactionType: interactionType === 'button_reply' ? 'button_reply' : 'intent',
        // ↓ novos campos p/ filtragem e segmentação
        ts: Date.now(),
        coldStart,
        aliasHit,
        band: result.metrics.band,          // 'HARD' | 'SOFT' | 'ROUTER'
        strategy: result.metrics.strategy,  // 'direct_map' | 'router_llm' | ...
      });

      // Record quality sample (without PII)
      recordSocialWiseQualitySample({
        trace_id: traceId!,
        user_input: textInput, // Will be hashed by the monitoring system
        classification_result: result.metrics.strategy,
        generated_buttons: (() => {
          // Extract button titles safely from different message types
          if (result.response.whatsapp && 'interactive' in result.response.whatsapp) {
            return result.response.whatsapp.interactive?.action?.buttons?.map((b: any) => b.reply.title);
          }
          if (result.response.instagram && 'buttons' in result.response.instagram) {
            const instagramResponse = result.response.instagram as { buttons?: any[] };
            return instagramResponse.buttons?.map((b: any) => b.title);
          }
          return undefined;
        })(),
        response_time_ms: routeTotalMs,
        band: result.metrics.band,
        strategy: result.metrics.strategy
      });

      webhookLogger.info('SocialWise Flow completed successfully', {
        band: result.metrics.band,
        strategy: result.metrics.strategy,
        routeTotalMs: result.metrics.routeTotalMs,
        embeddingMs: result.metrics.embeddingMs,
        llmWarmupMs: result.metrics.llmWarmupMs,
        traceId
      });

      // Handle handoff action
      if (result.response.action === 'handoff') {
        const handoffResponse = { action: 'handoff' };
        logFinalResponse(handoffResponse, 200, traceId);
        return NextResponse.json(handoffResponse, { status: 200 });
      }

      // Log da resposta final exata que será retornada
      let finalResponse: any;
      if (result.response.whatsapp) {
        finalResponse = { whatsapp: result.response.whatsapp };
      } else if (result.response.instagram) {
        finalResponse = { instagram: result.response.instagram };
      } else {
        finalResponse = result.response;
      }

      webhookLogger.info('🎯 FINAL WEBHOOK RESPONSE', {
        finalResponse: JSON.stringify(finalResponse, null, 2),
        responseType: typeof finalResponse,
        hasWhatsApp: !!finalResponse.whatsapp,
        hasInstagram: !!finalResponse.instagram,
        messageFormat: finalResponse.instagram?.message_format,
        traceId
      });

      // Return channel-specific response
      if (result.response.whatsapp) {
        const whatsappResponse = { whatsapp: result.response.whatsapp };
        logFinalResponse(whatsappResponse, 200, traceId);
        return NextResponse.json(whatsappResponse, { status: 200 });
      } else if (result.response.instagram) {
        const instagramResponse = { instagram: result.response.instagram };
        logFinalResponse(instagramResponse, 200, traceId);
        return NextResponse.json(instagramResponse, { status: 200 });
      } else if (result.response.facebook) {
        const facebookResponse = { facebook: result.response.facebook };
        logFinalResponse(facebookResponse, 200, traceId);
        return NextResponse.json(facebookResponse, { status: 200 });
      } else if (result.response.text) {
        const textResponse = { text: result.response.text };
        logFinalResponse(textResponse, 200, traceId);
        return NextResponse.json(textResponse, { status: 200 });
      }

      // Ultimate fallback
      const fallbackResponse = buildChannelResponse(channelType, textInput);
      logFinalResponse(fallbackResponse, 200, traceId);
      return NextResponse.json(fallbackResponse, { status: 200 });

    } catch (processingError) {
      const routeTotalMs = Date.now() - startTime;
      
      webhookLogger.error('SocialWise Flow processing failed', {
        error: processingError instanceof Error ? processingError.message : String(processingError),
        routeTotalMs,
        traceId
      });

      // Record error metrics
      recordWebhookMetrics({
        responseTime: routeTotalMs,
        timestamp: new Date(),
        correlationId: correlationId!,
        success: false,
        error: processingError instanceof Error ? processingError.message : String(processingError),
        payloadSize: payloadSizeKB * 1024,
        interactionType: interactionType === 'button_reply' ? 'button_reply' : 'intent'
      });

      // Fallback to simple channel response
      const channelFallbackResponse = buildChannelResponse(channelType, textInput);
      logFinalResponse(channelFallbackResponse, 200, traceId);
      return NextResponse.json(channelFallbackResponse, { status: 200 });
    }

  } catch (error) {
    const routeTotalMs = Date.now() - startTime;
    
    webhookLogger.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : String(error),
      routeTotalMs,
      traceId
    });

    // Record critical error metrics
    if (correlationId) {
      recordWebhookMetrics({
        responseTime: routeTotalMs,
        timestamp: new Date(),
        correlationId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        payloadSize: 0,
        interactionType: 'intent'
      });
    }

    // Return 500 for unexpected errors
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/integrations/webhooks/socialwiseflow
 * Health check endpoint for SocialWise Flow
 */
export async function GET(): Promise<NextResponse> {
  try {
    const startTime = Date.now();
    
    // Basic health check - verify core services are available
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0-optimized',
      services: {
        database: 'healthy',
        redis: 'healthy',
        openai: 'healthy'
      },
      responseTime: Date.now() - startTime
    };

    // Quick database connectivity check
    try {
      await withPrismaReconnect(async (prisma) => {
        return prisma.$queryRaw`SELECT 1`;
      });
    } catch (dbError) {
      healthStatus.services.database = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    webhookLogger.info('Health check completed', {
      status: healthStatus.status,
      responseTime: healthStatus.responseTime
    });

    return NextResponse.json(healthStatus, {
      status: healthStatus.status === 'healthy' ? 200 : 503
    });
    
  } catch (error) {
    webhookLogger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        version: '2.0.0-optimized'
      },
      { status: 503 }
    );
  }
}
