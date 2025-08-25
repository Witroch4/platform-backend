/**
 * SocialWise Flow Optimized Webhook Endpoint
 * Unified optimized flow with intelligent classification, performance bands,
 * concurrency control, and comprehensive monitoring
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';

// SocialWise Flow optimized components
import { processSocialWiseFlow } from '@/lib/socialwise-flow/processor';
import { validateSocialWisePayloadWithPreprocessing, sanitizeUserText } from '@/lib/socialwise-flow/schemas/payload';
import { SocialWiseIdempotencyService } from '@/lib/socialwise-flow/services/idempotency';
import { SocialWiseRateLimiterService } from '@/lib/socialwise-flow/services/rate-limiter';
import { SocialWiseReplayProtectionService } from '@/lib/socialwise-flow/services/replay-protection';
import { recordSocialWiseQualitySample } from '@/lib/socialwise-flow/monitoring-dashboard';
import { recordWebhookMetrics } from '@/lib/monitoring/application-performance-monitor';
import { getAssistantForInbox } from '@/lib/socialwise/assistant';
import { buildWhatsAppByIntentRaw, buildWhatsAppByGlobalIntent, buildInstagramByIntentRaw, buildInstagramByGlobalIntent } from '@/lib/socialwise/templates';

// 🔧 CORREÇÃO: Usar button-processor centralizado
import { handleButtonInteraction } from '@/lib/socialwise-flow/button-processor';

// Constants
const MAX_PAYLOAD_SIZE_KB = 256;
const WEBHOOK_TIMEOUT_MS = 400; // P95 SLA target

// Logger
const webhookLogger = createLogger('SocialwiseFlowWebhook');

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
function buildChannelResponse(channelType: string, text: string) {
  const lower = (text || '').toLowerCase();
  const ch = (channelType || '').toLowerCase();

  // Handoff keywords in plain text
  if (lower.includes('atendente') || lower.includes('humano')) {
    return { action: 'handoff' };
  }

  if (ch.includes('whatsapp')) {
    const content = text || 'Como posso ajudar você hoje?';
    const interactive = {
      type: 'button',
      body: { text: content },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'ia_recurso_oab', title: 'Recurso OAB' } },
          { type: 'reply', reply: { id: 'ia_inscricao', title: 'Inscrição' } },
          { type: 'reply', reply: { id: 'handoff:human', title: 'Falar com atendente' } },
        ],
      },
    };
    return { whatsapp: { type: 'interactive', interactive } };
  }

  if (ch.includes('instagram')) {
    const igPayload = {
      template_type: 'button',
      text: text || 'Posso ajudar com:',
      buttons: [
        { type: 'postback', title: 'Recurso OAB', payload: 'ia_recurso_oab' },
        { type: 'postback', title: 'Inscrição', payload: 'ia_inscricao' },
      ],
    };
    return { instagram: { message: { attachment: { type: 'template', payload: igPayload } } } };
  }

  if (ch.includes('facebook') || ch.includes('messenger')) {
    return { facebook: { message: { text: text || 'Como posso ajudar?' } } };
  }

  return { text: text || 'Como posso ajudar?' };
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
    } catch (error) {
      webhookLogger.error('Invalid JSON payload', { 
        error: error instanceof Error ? error.message : String(error) 
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
        errors: payloadValidation.error?.errors,
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
    // Priority order: context.message.source_id > socialwise-chatwit.wamid > socialwise-chatwit.message_data.id
    correlationId = validPayload.context.message?.source_id ||
                   validPayload.context['socialwise-chatwit'].wamid || 
                   validPayload.context['socialwise-chatwit'].message_data?.id || 
                   traceId;

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
      webhookLogger.info('Duplicate message detected', {
        sessionId: validPayload.session_id,
        accountId: validPayload.context['socialwise-chatwit'].account_data.id,
        inboxId: validPayload.context['socialwise-chatwit'].inbox_data.id,
        traceId
      });
      return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
    }

    // Step 9: Rate limiting
    const rateLimitResult = await socialWiseRateLimit.checkPayloadRateLimit(validPayload, request);
    if (!rateLimitResult.allowed) {
      webhookLogger.warn('Rate limit exceeded', {
        sessionId: validPayload.session_id,
        accountId: validPayload.context['socialwise-chatwit'].account_data.id,
        inboxId: validPayload.context['socialwise-chatwit'].inbox_data.id,
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

    // Step 11: Extract context from validated payload
    const rootChannelType = validPayload.channel_type;
    const ctxChannelType = validPayload.context['socialwise-chatwit'].inbox_data.channel_type;
    const channelType = rootChannelType || ctxChannelType;
    const externalInboxNumeric = validPayload.context['socialwise-chatwit'].inbox_data.id;
    const chatwitAccountId = validPayload.context['socialwise-chatwit'].account_data.id;
    // Priority order: context.message.source_id > socialwise-chatwit.wamid > socialwise-chatwit.message_data.id
    const wamid = validPayload.context.message?.source_id ||
                  validPayload.context['socialwise-chatwit'].wamid || 
                  validPayload.context['socialwise-chatwit'].message_data?.id || '';

    // Step 12: Resolve inbox and user information
    const prisma = getPrismaInstance();
    const inboxRow = await prisma.chatwitInbox.findFirst({
      where: {
        inboxId: externalInboxNumeric,
        usuarioChatwit: { chatwitAccountId: chatwitAccountId || undefined },
      },
      select: {
        id: true,
        inboxId: true,
        nome: true,
        usuarioChatwit: { select: { appUserId: true, chatwitAccountId: true } },
      },
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

      return NextResponse.json(buttonReactionResponse, { status: 200 });
    }

    // Legacy button processing para compatibilidade (manter variáveis necessárias)
    const ca = validPayload.context.message?.content_attributes || {};
    const swInteractive = validPayload.context['socialwise-chatwit'].message_data?.interactive_data || {};
    const swInstagram = validPayload.context['socialwise-chatwit'].message_data?.instagram_data || {};

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
    if ((interactionType === 'button_reply' || interactionType === 'postback') && legacyDerivedButtonId && !buttonReactionResponse) {
      const idLower = String(legacyDerivedButtonId).toLowerCase();
      const titleLower = String(legacyButtonTitle || '').toLowerCase();
      
      // Direct automations: btn_* or ig_*
      if (idLower.startsWith('btn_') || idLower.startsWith('ig_')) {
        // Handoff shortcuts
        if (idLower.includes('handoff') || titleLower.includes('falar') || 
            titleLower.includes('atendente') || titleLower.includes('humano')) {
          return NextResponse.json({ action: 'handoff' }, { status: 200 });
        }
        // No IA processing needed for direct automations
        return NextResponse.json({}, { status: 200 });
      }
      
      // Intent mapping: intent:<name> or @<name>
      if (idLower.startsWith('intent:') || idLower.startsWith('@')) {
        const norm = normalizeIntentId(String(legacyDerivedButtonId));
        const rawIntent = norm.plain;
        let mapped: any = null;
        
        // Try mapping based on channel type
        if (channelType.toLowerCase().includes('whatsapp')) {
          mapped = await buildWhatsAppByIntentRaw(rawIntent, inboxId, wamid);
          if (!mapped) {
            mapped = await buildWhatsAppByGlobalIntent(rawIntent, inboxId, wamid);
          }
        } else if (channelType.toLowerCase().includes('instagram')) {
          mapped = await buildInstagramByIntentRaw(rawIntent, inboxId);
          if (!mapped) {
            mapped = await buildInstagramByGlobalIntent(rawIntent, inboxId);
          }
        }
        
        webhookLogger.info('Button intent mapping', { 
          intent: norm.standardId, 
          found: !!mapped,
          channelType,
          traceId 
        });
        
        if (mapped) {
          return NextResponse.json(mapped, { status: 200 });
        }
        // Fall back to conversational flow if no mapping found
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
        chatwitAccountId,
        userId,
        wamid,
        traceId,
        originalPayload: payload // For button reaction detection
      };

      // Get agent configuration for embedipreview setting
      const assistant = await getAssistantForInbox(inboxId, chatwitAccountId);
      const embedipreview = true; // Default: embedding-first (TODO: Get from agent config when implemented)

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
          if (result.response.instagram && 'message' in result.response.instagram && 'attachment' in result.response.instagram.message) {
            return result.response.instagram.message.attachment?.payload?.buttons?.map((b: any) => b.title);
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
        return NextResponse.json({ action: 'handoff' }, { status: 200 });
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
        return NextResponse.json({ whatsapp: result.response.whatsapp }, { status: 200 });
      } else if (result.response.instagram) {
        return NextResponse.json({ instagram: result.response.instagram }, { status: 200 });
      } else if (result.response.facebook) {
        return NextResponse.json({ facebook: result.response.facebook }, { status: 200 });
      } else if (result.response.text) {
        return NextResponse.json({ text: result.response.text }, { status: 200 });
      }

      // Ultimate fallback
      return NextResponse.json(buildChannelResponse(channelType, textInput), { status: 200 });

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
      return NextResponse.json(buildChannelResponse(channelType, textInput), { status: 200 });
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
      const prisma = getPrismaInstance();
      await prisma.$queryRaw`SELECT 1`;
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