/**
 * Chatwit Webhook Endpoint
 * Based on requirements 1.1, 12.1, 13.1, 13.2, 14.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHmacAuthService } from '@/lib/ai-integration/services/hmac-auth';
import { IdempotencyService } from '@/lib/ai-integration/services/idempotency';
import { RateLimiterService, parseRateLimitConfig } from '@/lib/ai-integration/services/rate-limiter';
import { PayloadNormalizerService } from '@/lib/ai-integration/services/payload-normalizer';
import { createMessageFormatter } from '@/lib/ai-integration/services/message-formatter';
import { getRedisInstance } from '@/lib/connections';
import { getAssistantForInbox } from '@/lib/socialwise/assistant';
import { classifyIntentWithAssistant } from '@/lib/socialwise/intent';
import { buildWhatsAppByIntentRaw, buildWhatsAppByGlobalIntent } from '@/lib/socialwise/templates';
import { ChatwitWebhookPayloadSchema, WebhookHeadersSchema } from '@/lib/ai-integration/schemas/webhook';
import { WebhookResponse } from '@/lib/ai-integration/types/webhook';
import { AiMessageJobData } from '@/lib/ai-integration/types/job-data';
import { z } from 'zod';
import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';

// Constants
const MAX_PAYLOAD_SIZE_KB = 256;
const FAST_ACK_TIMEOUT_MS = 150;

// Services will be initialized on demand
const webhookLogger = createLogger('SocialwiseFlowWebhook');

// Normalize intent text to a plain name (no prefixes) and a standard external id (intent:name)
function normalizeIntentId(raw: string): { plain: string; standardId: string } {
  const original = String(raw || '').trim();
  let plain = original;
  if (plain.toLowerCase().startsWith('intent:')) plain = plain.slice('intent:'.length).trim();
  if (plain.startsWith('@')) plain = plain.slice(1).trim();
  plain = plain.replace(/\s+/g, ' ');
  return { plain, standardId: `intent:${plain}` };
}

/**
 * POST /api/chatwit/webhook
 * Main webhook ingestion endpoint
 */
export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  const startTime = Date.now();
  let traceId: string | undefined;
  let accountId: number | undefined;
  let conversationId: number | undefined;
  let messageId: string | undefined;

  try {
    // New Socialwise Flow contract: Optional bearer validation
    const expectedBearer = process.env.SOCIALWISEFLOW_ACCESS_TOKEN;
    if (expectedBearer) {
      const authz = request.headers.get('authorization') || '';
      if (!authz.toLowerCase().startsWith('bearer ') || authz.slice(7).trim() !== expectedBearer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Initialize services on demand
    const hmacAuth = getHmacAuthService();
    const redis = getRedisInstance();
    const idempotencyService = new IdempotencyService(redis);
    const rateLimiterService = new RateLimiterService(redis, parseRateLimitConfig());
    const payloadNormalizer = new PayloadNormalizerService();

    // Step 1: Read raw body first to detect Socialwise Flow contract
    const rawBody = await request.text();
    // Debug: log do payload original (raw) recebido
    webhookLogger.debug('Payload original Chatwit recebido (raw)', rawBody);
    
    // Step 2: Validate payload size (4.4)
    if (!payloadNormalizer.validatePayloadSize(rawBody, MAX_PAYLOAD_SIZE_KB)) {
      const payloadSize = payloadNormalizer.getPayloadSize(rawBody);
      console.error('[WebhookIngestion] Payload too large:', {
        size: payloadSize,
        maxSize: MAX_PAYLOAD_SIZE_KB * 1024,
      });
      return NextResponse.json(
        { ok: false },
        { status: 413, statusText: 'Payload too large' }
      );
    }

    // Step 3: Parse payload JSON
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error('[WebhookIngestion] Invalid JSON payload:', error);
      return NextResponse.json({ ok: false }, { status: 400, statusText: 'Invalid JSON' });
    }

    // Socialwise Flow contract fast-path: if session_id/context present, skip legacy HMAC/header validation
    if (payload && typeof payload === 'object' && 'session_id' in payload && 'context' in payload) {
      // Extract basics
      const textInput = String(payload?.message || '').trim();
      const rootChannelType = String(payload?.channel_type || '');
      const ctxChannelType = String(payload?.context?.channel_type || payload?.context?.['socialwise-chatwit']?.inbox_data?.channel_type || '');
      const channelType = rootChannelType || ctxChannelType;
      const externalInboxNumeric = String(payload?.context?.['socialwise-chatwit']?.inbox_data?.id || payload?.context?.inbox_id || '');
      const chatwitAccountId = String(payload?.context?.['socialwise-chatwit']?.account_data?.id || payload?.context?.account_id || '');
      const inboxName = String(payload?.context?.['socialwise-chatwit']?.inbox_data?.name || '');
      const phoneNumberId = String(payload?.context?.['socialwise-chatwit']?.whatsapp_phone_number_id || '');
      const businessId = String(payload?.context?.['socialwise-chatwit']?.whatsapp_business_id || '');
      const wamid = String(payload?.context?.['socialwise-chatwit']?.wamid || payload?.context?.['socialwise-chatwit']?.message_data?.id || '');

      // Resolve ChatwitInbox da nossa base para obter o inboxId externo correto (string)
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
      webhookLogger.info('Resolved inbox', { externalInboxNumeric, chatwitAccountId, inboxRow: inboxRow ? { id: inboxRow.id, inboxId: inboxRow.inboxId, nome: inboxRow.nome, appUserId: (inboxRow as any)?.usuarioChatwit?.appUserId } : null });

      // Detect interactive/button metadata (WA + IG)
      const ca = payload?.context?.message?.content_attributes || {};
      const swInteractive = payload?.context?.['socialwise-chatwit']?.message_data?.interactive_data || {};
      const swInstagram = payload?.context?.['socialwise-chatwit']?.message_data?.instagram_data || {};
      const rootInteraction = payload?.context?.interaction_type || null;
      const rootPostback = payload?.context?.postback_payload || null;
      const rootQuickReply = payload?.context?.quick_reply_payload || null;
      const caQuickReply = ca?.quick_reply_payload || null;
      const caPostback = ca?.postback_payload || null;

      const interactionType: string | null =
        ca?.interaction_type ||
        swInteractive?.interaction_type ||
        swInstagram?.interaction_type ||
        rootInteraction ||
        null;

      const buttonReply = ca?.button_reply || ca?.interactive_payload?.button_reply || {};
      const derivedButtonId: string | null =
        buttonReply?.id ||
        swInteractive?.button_id ||
        caPostback ||
        swInstagram?.postback_payload ||
        rootPostback ||
        rootQuickReply ||
        caQuickReply ||
        null;
      const buttonTitle: string | null =
        buttonReply?.title ||
        swInteractive?.button_title ||
        (typeof payload?.message === 'string' ? payload.message : null) ||
        null;

      // Router: automation vs IA by prefix
      if ((interactionType === 'button_reply' || interactionType === 'postback') && derivedButtonId) {
        const idLower = String(derivedButtonId).toLowerCase();
        const titleLower = String(buttonTitle || '').toLowerCase();
        // Direct automations: btn_* or ig_*
        if (idLower.startsWith('btn_') || idLower.startsWith('ig_')) {
          // Handoff shortcuts
          if (idLower.includes('handoff') || titleLower.includes('falar') || titleLower.includes('atendente') || titleLower.includes('humano')) {
            return NextResponse.json({ action: 'handoff' }, { status: 200 });
          }
          // No IA, no reply needed (let Chatwit automations run). Return empty JSON.
          return NextResponse.json({}, { status: 200 });
        }
        // Intent mapping: intent:<name> (aceita @ e converte para padrão intent:name)
        if (idLower.startsWith('intent:') || idLower.startsWith('@')) {
          const norm = normalizeIntentId(String(derivedButtonId));
          const rawIntent = norm.plain;
          let mapped = await buildWhatsAppByIntentRaw(rawIntent, inboxId, wamid);
          if (!mapped) {
            mapped = await buildWhatsAppByGlobalIntent(rawIntent, inboxId, wamid);
          }
          webhookLogger.info('Button intent mapping', { intent: norm.standardId, found: !!mapped });
          if (mapped) {
            try { webhookLogger.info('Response to Chatwit (button intent)', mapped); } catch {}
            return NextResponse.json(mapped, { status: 200 });
          }
          // If no mapping, fall back to IA-style buttons for the channel
          return NextResponse.json(buildChannelResponse(channelType, titleLower || textInput), { status: 200 });
        }
        // Conversational continuation: ia_*
        if (idLower.startsWith('ia_')) {
          // Treat button title as latest user message
          const syntheticText = String(buttonTitle || textInput || '').trim();
          return NextResponse.json(buildChannelResponse(channelType, syntheticText), { status: 200 });
        }
      }

      // Plain text path: attempt LLM classification using Capitão (assistant) model + instructions
      try {
        const assistant = await getAssistantForInbox(inboxId, chatwitAccountId);
        if (assistant && textInput) {
          const intent = await classifyIntentWithAssistant(
            assistant.instructions || '',
            textInput,
            assistant.model || 'gpt-4o-mini',
            { userId: (inboxRow as any)?.usuarioChatwit?.appUserId, skipLlmFallback: true }
          );
          webhookLogger.info('IA classified intent', { intent, model: assistant.model, hasInstructions: !!assistant.instructions, inboxId });
          if (intent) {
            const norm = normalizeIntentId(intent);
            let mapped = await buildWhatsAppByIntentRaw(norm.plain, inboxId, wamid);
            if (!mapped) {
              mapped = await buildWhatsAppByGlobalIntent(norm.plain, inboxId, wamid);
            }
            webhookLogger.info('Intent mapping result', { intent: norm.standardId, mapped: !!mapped });
            if (mapped) return NextResponse.json(mapped, { status: 200 });
          }
          // Aquecimento: se não mapeou nada, sugerir top-K intenções como botões
          try {
            const g: any[] = (global as any).__AI_TOPK_CANDIDATES__;
            if (Array.isArray(g) && g.length > 0) {
              const top = g.filter((s: any) => typeof s?.score === 'number' && s.score >= 0.5).slice(0, 3);
              if (top.length === 0) {
                top.push(...g.slice(0, 2));
              }
              const hasGood = top.some((s: any) => (typeof s?.score === 'number' ? s.score : 0) >= 0.5);

              // WhatsApp buttons (ensure up to 3; include handoff if all < 0.5 or not enough)
              const waButtons: any[] = top.map((s: any) => ({
                type: 'reply',
                reply: { id: `intent:${String(s.name || '').toLowerCase()}`, title: String(s.shortTitle || s.name || '').slice(0, 24) }
              }));

              const handoffBtn = { type: 'reply', reply: { id: 'handoff:human', title: 'Falar com Humano' } };
              // If no good scores, ensure handoff is present (replace last if already 3)
              if (!hasGood) {
                if (waButtons.length >= 3) {
                  waButtons[waButtons.length - 1] = handoffBtn;
                } else if (!waButtons.find(b => b?.reply?.id === 'handoff:human')) {
                  waButtons.push(handoffBtn);
                }
              }
              // Ensure exactly 3 buttons by filling with handoff and (optionally) outros_assuntos
              if (waButtons.length < 3) {
                if (!waButtons.find(b => b?.reply?.id === 'handoff:human')) waButtons.push(handoffBtn);
              }
              if (waButtons.length < 3) {
                waButtons.push({ type: 'reply', reply: { id: 'intent:outros_assuntos', title: 'Outros assuntos' } });
              }
              if (waButtons.length > 3) waButtons.splice(3);

              const interactive = {
                type: 'button',
                body: { text: 'Posso ajudar com algum destes assuntos?' },
                action: { buttons: waButtons }
              };
              if ((channelType || '').toLowerCase().includes('whatsapp')) {
                const resp = { whatsapp: { type: 'interactive', interactive } };
                try {
                  webhookLogger.info('Response to Chatwit (warmup WA)', resp);
                  webhookLogger.info('Response to Chatwit (warmup WA) (pretty)\n' + JSON.stringify(resp, null, 2));
                } catch {}
                return NextResponse.json(resp, { status: 200 });
              }

              // Instagram (ensure exactly 3 using same policy)
              const igButtons: any[] = top.map((s: any) => ({
                type: 'postback',
                title: String(s.shortTitle || s.name || ''),
                payload: `intent:${String(s.name || '').toLowerCase()}`
              }));
              if (!hasGood) {
                if (igButtons.length >= 3) {
                  igButtons[igButtons.length - 1] = { type: 'postback', title: 'Falar com Humano', payload: 'handoff:human' };
                } else if (!igButtons.find(b => b?.payload === 'handoff:human')) {
                  igButtons.push({ type: 'postback', title: 'Falar com Humano', payload: 'handoff:human' });
                }
              }
              if (igButtons.length < 3) {
                if (!igButtons.find(b => b?.payload === 'handoff:human')) igButtons.push({ type: 'postback', title: 'Falar com Humano', payload: 'handoff:human' });
              }
              if (igButtons.length < 3) {
                igButtons.push({ type: 'postback', title: 'Outros assuntos', payload: 'intent:outros_assuntos' });
              }
              if (igButtons.length > 3) igButtons.splice(3);

              if ((channelType || '').toLowerCase().includes('instagram')) {
                const igPayload = {
                  template_type: 'button',
                  text: 'Posso ajudar com:',
                  buttons: igButtons
                };
                const resp = { instagram: { message: { attachment: { type: 'template', payload: igPayload } } } };
                try { webhookLogger.info('Response to Chatwit (warmup IG)', resp); } catch {}
                return NextResponse.json(resp, { status: 200 });
              }

              const textResp = { text: 'Sobre qual assunto você quer falar? ' + top.map((s: any) => s.name).join(' | ') };
              try { webhookLogger.info('Response to Chatwit (warmup TEXT)', textResp); } catch {}
              return NextResponse.json(textResp, { status: 200 });
            }
          } catch {}
        }
      } catch (e) {
        console.warn('[SocialwiseFlow] IA classification failed; falling back', e instanceof Error ? e.message : String(e));
      }

      // Plain text path: allow LLM-style classified outputs
      // If text looks like an intent by prefix (@ or intent:), normalize and try mapping
      if ((textInput.startsWith('@') || textInput.toLowerCase().startsWith('intent:')) && inboxId) {
        const norm = normalizeIntentId(textInput);
        let mapped = await buildWhatsAppByIntentRaw(norm.plain, inboxId, wamid);
        if (!mapped) {
          mapped = await buildWhatsAppByGlobalIntent(norm.plain, inboxId, wamid);
        }
        webhookLogger.info('Normalized plain-text intent mapping', { intent: norm.standardId, mapped: !!mapped });
        if (mapped) { try { webhookLogger.info('Response to Chatwit (normalized intent)', mapped); } catch {}; try { webhookLogger.info('Response to Chatwit (normalized intent) (pretty)\n' + JSON.stringify(mapped, null, 2)); } catch {}; return NextResponse.json(mapped, { status: 200 }); }
      }
      // If text is JSON containing intent.name
      try {
        const parsed = JSON.parse(textInput);
        const nameCandidate = parsed?.intent?.name || parsed?.intentName;
        if (typeof nameCandidate === 'string' && inboxId) {
          const norm = normalizeIntentId(nameCandidate);
          let mapped = await buildWhatsAppByIntentRaw(norm.plain, inboxId, wamid);
          if (!mapped) {
            mapped = await buildWhatsAppByGlobalIntent(norm.plain, inboxId, wamid);
          }
          webhookLogger.info('JSON intent mapping result', { intent: norm.standardId, mapped: !!mapped });
          if (mapped) { try { webhookLogger.info('Response to Chatwit (JSON intent)', mapped); } catch {}; try { webhookLogger.info('Response to Chatwit (JSON intent) (pretty)\n' + JSON.stringify(mapped, null, 2)); } catch {}; return NextResponse.json(mapped, { status: 200 }); }
        }
      } catch {}

      // Unknown interaction: heuristic and channel-specific reply
      const fallback = buildChannelResponse(channelType, textInput);
      try { webhookLogger.info('Response to Chatwit (fallback)', fallback); } catch {}
      try { webhookLogger.info('Response to Chatwit (fallback) (pretty)\n' + JSON.stringify(fallback, null, 2)); } catch {}
      return NextResponse.json(fallback, { status: 200 });
    }

    // ===== Legacy Chatwit path (expects HMAC headers) =====
    const rawHeaders = {
      'x-chatwit-signature': request.headers.get('x-chatwit-signature') || '',
      'x-chatwit-timestamp': request.headers.get('x-chatwit-timestamp') || '',
      'x-chatwit-signature-version': request.headers.get('x-chatwit-signature-version') || 'v1',
      'content-type': request.headers.get('content-type') || '',
    };

    const headerValidation = WebhookHeadersSchema.safeParse(rawHeaders);
    if (!headerValidation.success) {
      console.error('[WebhookIngestion] Invalid headers:', headerValidation.error.errors);
      return NextResponse.json(
        { ok: false },
        { status: 400, statusText: 'Invalid headers' }
      );
    }
    const validHeaders = headerValidation.data;

    // HMAC authentication
    const hmacResult = hmacAuth.validateSignature(
      rawBody,
      validHeaders['x-chatwit-signature'],
      validHeaders['x-chatwit-timestamp'],
      validHeaders['x-chatwit-signature-version']
    );

    if (!hmacResult.isValid) {
      console.error('[WebhookIngestion] HMAC validation failed:', hmacResult.error);
      return NextResponse.json(
        { ok: false },
        { status: 401, statusText: 'Unauthorized' }
      );
    }

    const payloadValidation = ChatwitWebhookPayloadSchema.safeParse(payload);
    if (!payloadValidation.success) {
      console.error('[WebhookIngestion] Invalid payload schema:', payloadValidation.error.errors);
      return NextResponse.json(
        { ok: false },
        { status: 400, statusText: 'Invalid payload schema' }
      );
    }

    const validPayload = payloadValidation.data;
    
    // Extract identifiers for logging and processing
    accountId = validPayload.account_id;
    conversationId = validPayload.conversation.id;
    messageId = validPayload.message.id.toString();
    traceId = `wh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Step 6: Skip outgoing messages (only process incoming)
    if (validPayload.message.message_type !== 'incoming') {
      console.log('[WebhookIngestion] Skipping outgoing message:', {
        accountId,
        conversationId,
        messageId,
        messageType: validPayload.message.message_type,
        traceId,
      });
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Step 7: Normalize payload and check if should skip (4.6)
    const normalizedPayload = payloadNormalizer.normalizePayload(validPayload);
    
    if (payloadNormalizer.shouldSkipPayload(normalizedPayload)) {
      console.log('[WebhookIngestion] Skipping media-only message:', {
        accountId,
        conversationId,
        messageId,
        hasMedia: normalizedPayload.hasMedia,
        hasText: !!normalizedPayload.text,
        traceId,
      });
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Step 8: Idempotency check (4.2)
    const idempotencyKey = {
      accountId,
      conversationId: conversationId,
      messageId,
    };

    const isDuplicate = await idempotencyService.isDuplicate(idempotencyKey);
    if (isDuplicate) {
      console.log('[WebhookIngestion] Duplicate message detected:', {
        accountId,
        conversationId,
        messageId,
        traceId,
      });
      return NextResponse.json({ ok: true, dedup: true });
    }

    // Step 9: Rate limiting check (4.2, 4.5)
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    const contactId = validPayload.message.sender?.id?.toString() || 'unknown';
    
    const rateLimitResult = await rateLimiterService.checkRateLimit(
      conversationId.toString(),
      accountId.toString(),
      contactId,
      clientIp
    );

    if (!rateLimitResult.allowed) {
      console.warn('[WebhookIngestion] Rate limit exceeded:', {
        accountId,
        conversationId,
        messageId,
        scope: rateLimitResult.scope,
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        traceId,
      });
      
      // Increment rate limit metrics
      // TODO: Add metrics collection here
      
      return NextResponse.json(
        { ok: false, throttled: true },
        { 
          status: 202,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
            'X-RateLimit-Scope': rateLimitResult.scope,
          }
        }
      );
    }

    // Step 10: Extract provider correlation fields (4.8)
    const providerFields = payloadNormalizer.extractProviderFields(validPayload);

    // Step 11: Prepare job data (4.3)
    const jobData: AiMessageJobData = {
      accountId,
      conversationId,
      messageId,
      text: normalizedPayload.text,
      contentAttributes: normalizedPayload.originalContentAttributes || {},
      channel: validPayload.channel,
      traceId,
      sourceId: providerFields.sourceId,
      providerTimestamp: providerFields.providerTimestamp,
      enqueuedAt: Date.now(),
      // TODO: Add feature flags based on account/inbox configuration
      featureFlags: {
        intentsEnabled: process.env.FF_INTENTS_ENABLED === 'true',
        dynamicLlmEnabled: process.env.FF_DYNAMIC_LLM_ENABLED === 'true',
        interactiveMessagesEnabled: process.env.FF_INTERACTIVE_MESSAGES_ENABLED === 'true',
        economicModeEnabled: process.env.FF_ECONOMIC_MODE_ENABLED === 'true',
        budgetControlEnabled: process.env.FF_BUDGET_CONTROL_ENABLED === 'true',
      },
    };

    // Step 12: Inline AI processing and direct response to Chatwit (deliver via webhook response)
    // Build a quick intent/LLM-like reply without external calls to keep latency low
    const formatter = createMessageFormatter();

    // Very fast heuristic intent selection (can be replaced by real classifier later)
    const lowerText = (normalizedPayload.text || '').toLowerCase();
    let content = '';
    let interactiveData: any | undefined = undefined;

    if (lowerText.includes('rastrear') || lowerText.includes('pedido') || lowerText.includes('entrega')) {
      content = 'Posso ajudar a rastrear seu pedido. Quer continuar?';
      interactiveData = {
        body: content,
        buttons: [
          { title: 'Sim, rastrear', id: 'intent:track_order' },
          { title: 'Falar com atendente', id: 'handoff:human' },
        ],
      };
    } else if (lowerText.includes('pagar') || lowerText.includes('pagamento') || lowerText.includes('cobran')) {
      content = 'Sobre pagamentos, selecione uma opção:';
      interactiveData = {
        body: content,
        buttons: [
          { title: '2ª via de boleto', id: 'intent:payment_second_copy' },
          { title: 'Falar com atendente', id: 'handoff:human' },
        ],
      };
    } else {
      content = 'Como posso ajudar você hoje?';
      interactiveData = {
        body: content,
        buttons: [
          { title: 'Rastrear pedido', id: 'intent:track_order' },
          { title: 'Pagamento', id: 'intent:payment_help' },
          { title: 'Falar com atendente', id: 'handoff:human' },
        ],
      };
    }

    const formatted = formatter.formatMessage({
      content,
      channel: validPayload.channel,
      interactiveData,
      traceId: traceId!,
      accountId: accountId!,
      conversationId: conversationId!,
    });

    // Transform to Chatwit expected keys (snake_case) in webhook response
    const responsePayload: any = {
      content: formatted.content,
      message_type: 'outgoing',
      additional_attributes: formatted.additionalAttributes,
    };
    if (formatted.contentAttributes) {
      responsePayload.content_attributes = formatted.contentAttributes;
    }

    return NextResponse.json(responsePayload, { status: 200 });

  } catch (error) {
    const ingestDurationMs = Date.now() - startTime;
    
    console.error('[WebhookIngestion] Unexpected error:', error, {
      accountId,
      conversationId,
      messageId,
      ingestDurationMs,
      traceId,
    });

    // Return 500 for unexpected errors
    return NextResponse.json(
      { ok: false },
      { status: 500, statusText: 'Internal server error' }
    );
  }
}

// Helper: build channel-specific response for Socialwise Flow contract
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
 * GET /api/chatwit/webhook
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Healthcheck simples para o endpoint (sem fila)
    return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[WebhookIngestion] Health check failed:', error);
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}