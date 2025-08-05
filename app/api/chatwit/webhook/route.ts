/**
 * Chatwit Webhook Endpoint
 * Based on requirements 1.1, 12.1, 13.1, 13.2, 14.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHmacAuthService } from '@/lib/ai-integration/services/hmac-auth';
import { IdempotencyService } from '@/lib/ai-integration/services/idempotency';
import { RateLimiterService, parseRateLimitConfig } from '@/lib/ai-integration/services/rate-limiter';
import { PayloadNormalizerService } from '@/lib/ai-integration/services/payload-normalizer';
import { getAiMessageQueueService } from '@/lib/ai-integration/services/ai-message-queue';
import { getRedisInstance } from '@/lib/connections';
import { ChatwitWebhookPayloadSchema, WebhookHeadersSchema } from '@/lib/ai-integration/schemas/webhook';
import { WebhookResponse } from '@/lib/ai-integration/types/webhook';
import { AiMessageJobData } from '@/lib/ai-integration/types/job-data';
import { z } from 'zod';

// Constants
const MAX_PAYLOAD_SIZE_KB = 256;
const FAST_ACK_TIMEOUT_MS = 150;

// Services will be initialized on demand

/**
 * POST /api/chatwit/webhook
 * Main webhook ingestion endpoint
 */
export async function POST(request: NextRequest): Promise<NextResponse<WebhookResponse>> {
  const startTime = Date.now();
  let traceId: string | undefined;
  let accountId: number | undefined;
  let conversationId: number | undefined;
  let messageId: string | undefined;

  try {
    // Initialize services on demand
    const hmacAuth = getHmacAuthService();
    const redis = getRedisInstance();
    const idempotencyService = new IdempotencyService(redis);
    const rateLimiterService = new RateLimiterService(redis, parseRateLimitConfig());
    const payloadNormalizer = new PayloadNormalizerService();
    const aiMessageQueue = getAiMessageQueueService();
    // Step 1: Extract and validate headers (4.1, 4.7)
    const rawHeaders = {
      'x-chatwit-signature': request.headers.get('x-chatwit-signature') || '',
      'x-chatwit-timestamp': request.headers.get('x-chatwit-timestamp') || '',
      'x-chatwit-signature-version': request.headers.get('x-chatwit-signature-version') || 'v1',
      'content-type': request.headers.get('content-type') || '',
    };

    // Validate header schema
    const headerValidation = WebhookHeadersSchema.safeParse(rawHeaders);
    if (!headerValidation.success) {
      console.error('[WebhookIngestion] Invalid headers:', headerValidation.error.errors);
      return NextResponse.json(
        { ok: false },
        { status: 400, statusText: 'Invalid headers' }
      );
    }

    const validHeaders = headerValidation.data;

    // Step 2: Get raw body for HMAC validation (4.7)
    const rawBody = await request.text();
    
    // Step 3: Validate payload size (4.4)
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

    // Step 4: HMAC authentication (4.1)
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

    // Step 5: Parse and validate payload (4.2)
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error('[WebhookIngestion] Invalid JSON payload:', error);
      return NextResponse.json(
        { ok: false },
        { status: 400, statusText: 'Invalid JSON' }
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

    // Step 12: Enqueue job (4.3)
    const priority = normalizedPayload.isButtonClick ? 10 : 0; // Higher priority for button clicks
    
    await aiMessageQueue.enqueueMessage(jobData, {
      priority,
      attempts: 3,
    });

    // Step 13: Fast ACK response (4.4)
    const ingestDurationMs = Date.now() - startTime;
    
    console.log('[WebhookIngestion] Message enqueued successfully:', {
      accountId,
      conversationId,
      messageId,
      channel: validPayload.channel,
      textLength: normalizedPayload.text.length,
      isButtonClick: normalizedPayload.isButtonClick,
      buttonPayload: normalizedPayload.buttonPayload,
      hasMedia: normalizedPayload.hasMedia,
      ingestDurationMs,
      traceId,
    });

    // Log performance warning if ingestion took too long
    if (ingestDurationMs > FAST_ACK_TIMEOUT_MS) {
      console.warn('[WebhookIngestion] Slow ingestion detected:', {
        ingestDurationMs,
        threshold: FAST_ACK_TIMEOUT_MS,
        accountId,
        conversationId,
        messageId,
        traceId,
      });
    }

    return NextResponse.json({ ok: true });

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

/**
 * GET /api/chatwit/webhook
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Initialize services on demand
    const aiMessageQueue = getAiMessageQueueService();
    
    // Basic health checks
    const queueMetrics = await aiMessageQueue.getMetrics();
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      queue: {
        waiting: queueMetrics.waiting,
        active: queueMetrics.active,
        failed: queueMetrics.failed,
        paused: queueMetrics.paused,
      },
    });
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