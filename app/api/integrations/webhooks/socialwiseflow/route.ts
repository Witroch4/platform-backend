/**
 * SocialWise Flow Optimized Webhook Endpoint
 * Unified optimized flow with intelligent classification, performance bands,
 * concurrency control, and comprehensive monitoring
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/utils/logger";
import { withPrismaReconnect, getPrismaInstance, getRedisInstance } from "@/lib/connections";

// SocialWise Flow optimized components
import { processSocialWiseFlow, extractSessionId } from "@/lib/socialwise-flow/processor";
import { buildChannelResponse } from "@/lib/socialwise-flow/channel-formatting";
import { handleRetryWithDegradation } from "@/lib/socialwise-flow/processor-components/retry-handler";
import { isDebounceEnabled, addToDebounceBuffer, getDebounceConfig } from "@/lib/socialwise-flow/message-debouncer";
import {
	SocialWiseFlowPayloadSchema,
	SanitizedTextSchema,
	validateSocialWisePayloadWithPreprocessing,
	type SocialWiseFlowPayloadType,
	type SocialWiseChatwitData,
} from "@/lib/socialwise-flow/schemas/payload";
import { SocialWiseIdempotencyService } from "@/lib/socialwise-flow/services/idempotency";
import { SocialWiseRateLimiterService } from "@/lib/socialwise-flow/services/rate-limiter";
import { SocialWiseReplayProtectionService } from "@/lib/socialwise-flow/services/replay-protection";
import { recordSocialWiseQualitySample } from "@/lib/socialwise-flow/monitoring-dashboard";
import { recordWebhookMetrics } from "@/lib/monitoring/application-performance-monitor";
import { getAssistantForInbox } from "@/lib/socialwise/assistant";
// Template functions removed - now using full SocialWise Flow for all button processing

// 🔧 CORREÇÃO: Usar button-processor centralizado
import { handleButtonInteraction, detectButtonClick } from "@/lib/socialwise-flow/button-processor";

// Flow Engine para execução de flows visuais
import { FlowOrchestrator } from "@/services/flow-engine";
import { saveChatwitSystemConfig } from "@/lib/chatwit/system-config";

// Prefixo de botões do Flow Builder (para priorização)
import { FLOW_BUTTON_PREFIX } from "@/lib/flow-builder/interactiveMessageElements";
import type { ChatwitWebhookPayload, DeliveryContext } from "@/types/flow-engine";

// Lead e Message services para persistência de histórico
import { leadService } from "@/lib/services/lead-service";
import { messageService } from "@/lib/services/message-service";

// Payment handler for payment.confirmed events from Chatwit/InfinitePay
import { handlePaymentConfirmed, type PaymentConfirmedPayload } from "@/lib/leads/payment-handler";

// Constants
const MAX_PAYLOAD_SIZE_KB = 256;
const WEBHOOK_TIMEOUT_MS = 400; // P95 SLA target

// Logger
const webhookLogger = createLogger("SocialwiseFlowWebhook");

/**
 * Helper function to safely access socialwise-chatwit data
 */
function getSocialWiseChatwitData(context: any): SocialWiseChatwitData | undefined {
	return context["socialwise-chatwit"] as SocialWiseChatwitData | undefined;
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
	const original = String(raw || "").trim();
	let plain = original;
	if (plain.toLowerCase().startsWith("intent:")) plain = plain.slice("intent:".length).trim();
	if (plain.startsWith("@")) plain = plain.slice(1).trim();
	plain = plain.replace(/\s+/g, " ");
	return { plain, standardId: `intent:${plain}` };
}

/**
 * Extract text content from channel response for message history
 */
function extractResponseText(response: any): string | null {
	if (!response) return null;

	// WhatsApp interactive message
	if (response.whatsapp?.interactive?.body?.text) {
		return response.whatsapp.interactive.body.text;
	}

	// WhatsApp text message
	if (response.whatsapp?.text?.body) {
		return response.whatsapp.text.body;
	}

	// Instagram message
	if (response.instagram?.text) {
		return response.instagram.text;
	}

	// Facebook message
	if (response.facebook?.text) {
		return response.facebook.text;
	}

	// Plain text
	if (response.text) {
		return response.text;
	}

	return null;
}

/**
 * Extract button/quick-reply titles from channel response
 * Supports WhatsApp buttons, list sections, and Instagram quick replies
 */
function extractButtonTitles(response: any): string[] | undefined {
	if (!response) return undefined;

	const titles: string[] = [];

	// WhatsApp interactive buttons
	const buttons = response.whatsapp?.interactive?.action?.buttons;
	if (Array.isArray(buttons)) {
		for (const btn of buttons) {
			const title = btn?.reply?.title;
			if (typeof title === "string" && title.trim()) {
				titles.push(title.trim());
			}
		}
	}

	// WhatsApp interactive list sections
	const sections = response.whatsapp?.interactive?.action?.sections;
	if (Array.isArray(sections)) {
		for (const section of sections) {
			if (Array.isArray(section?.rows)) {
				for (const row of section.rows) {
					const title = row?.title;
					if (typeof title === "string" && title.trim()) {
						titles.push(title.trim());
					}
				}
			}
		}
	}

	// Instagram quick replies
	const quickReplies = response.instagram?.quick_replies;
	if (Array.isArray(quickReplies)) {
		for (const qr of quickReplies) {
			const title = qr?.title || qr?.content_type === "text" ? qr?.title : undefined;
			if (typeof title === "string" && title.trim()) {
				titles.push(title.trim());
			}
		}
	}

	return titles.length > 0 ? titles : undefined;
}

/**
 * Log humanizado da resposta final enviada para o Chatwit
 */
function logFinalResponse(responseData: any, status: number, traceId?: string) {
	const responseSize = JSON.stringify(responseData).length;
	const responseSizeKB = Math.round((responseSize / 1024) * 100) / 100;

	webhookLogger.info("📤 CHATWIT FINAL RESPONSE DEBUG", {
		timestamp: new Date().toISOString(),
		responseSizeKB,
		responseLength: responseSize,
		status,
		traceId,
		responseData: JSON.stringify(responseData, null, 2),
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
			const authz = request.headers.get("authorization") || "";
			if (!authz.toLowerCase().startsWith("bearer ") || authz.slice(7).trim() !== expectedBearer) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
			}
		}

		// Step 2: Read and validate payload size
		const rawBody = await request.text();
		const payloadSizeKB = Buffer.byteLength(rawBody, "utf8") / 1024;

		// 🐛 DEBUG: Log do payload RAW original exato que o Chatwit envia
		webhookLogger.info("🔍 CHATWIT ORIGINAL RAW PAYLOAD DEBUG", {
			timestamp: new Date().toISOString(),
			payloadSizeKB: Number(payloadSizeKB.toFixed(2)),
			rawBodyString: rawBody,
			rawBodyLength: rawBody.length,
			headers: {
				"content-type": request.headers.get("content-type"),
				"user-agent": request.headers.get("user-agent"),
				"x-forwarded-for": request.headers.get("x-forwarded-for"),
				authorization: request.headers.get("authorization") ? "[REDACTED]" : null,
			},
			method: request.method,
			url: request.url,
		});

		if (payloadSizeKB > MAX_PAYLOAD_SIZE_KB) {
			webhookLogger.error("Payload too large", {
				sizeKB: payloadSizeKB,
				maxSizeKB: MAX_PAYLOAD_SIZE_KB,
			});
			return NextResponse.json({ error: "Payload too large" }, { status: 413 });
		}

		// Step 3: Parse JSON payload
		let payload: any;
		try {
			payload = JSON.parse(rawBody);

			// 🐛 DEBUG: Log do payload JSON parseado para comparação
			webhookLogger.info("📋 CHATWIT PARSED JSON PAYLOAD DEBUG", {
				timestamp: new Date().toISOString(),
				parsedPayload: payload,
				payloadType: typeof payload,
				payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
				hasContext: payload?.context ? true : false,
				hasMessage: payload?.context?.message ? true : false,
				hasSocialwiseChatwit: payload?.context?.["socialwise-chatwit"] ? true : false,
			});
		} catch (error) {
			webhookLogger.error("Invalid JSON payload", {
				error: error instanceof Error ? error.message : String(error),
				rawBodyPreview: rawBody.substring(0, 200) + (rawBody.length > 200 ? "..." : ""),
			});
			return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
		}

		// Step 4: Validate SocialWise Flow payload structure with preprocessing
		const payloadValidation = validateSocialWisePayloadWithPreprocessing(payload);
		if (!payloadValidation.success) {
			webhookLogger.error("Invalid payload schema", {
				errors: payloadValidation.error?.errors?.map((err) => ({
					code: err.code,
					path: err.path,
					message: err.message,
					...(err.code === "invalid_type" && "expected" in err && "received" in err
						? {
							expected: err.expected,
							received: err.received,
						}
						: {}),
				})),
				originalPayload: payload,
				preprocessedPayload: payloadValidation.preprocessed,
			});
			return NextResponse.json(
				{ error: "Invalid payload structure", details: payloadValidation.error?.errors },
				{ status: 400 },
			);
		}
		const validPayload = payloadValidation.data!;

		webhookLogger.debug("Payload validation successful", {
			originalHadNumbers: JSON.stringify(payload) !== JSON.stringify(payloadValidation.preprocessed),
			traceId,
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
			traceId,
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
					webhookLogger.warn("Replay protection triggered", {
						nonce,
						error: replayResult.error,
						traceId,
					});
					return NextResponse.json({ error: "Replay detected", details: replayResult.error }, { status: 400 });
				}
			}
		}

		// Step 8: Idempotency check
		const isDuplicate = await socialWiseIdempotency.isPayloadDuplicate(validPayload);
		if (isDuplicate) {
			const socialwiseDataForLog = getSocialWiseChatwitData(validPayload.context);
			webhookLogger.info("Duplicate message detected", {
				sessionId: validPayload.session_id,
				accountId: socialwiseDataForLog?.account_data?.id || validPayload.context.inbox?.account_id,
				inboxId: socialwiseDataForLog?.inbox_data?.id || validPayload.context.inbox?.id,
				traceId,
			});
			const dedupResponse = { ok: true, dedup: true };
			logFinalResponse(dedupResponse, 200, traceId);
			return NextResponse.json(dedupResponse, { status: 200 });
		}

		// Step 9: Rate limiting
		const rateLimitResult = await socialWiseRateLimit.checkPayloadRateLimit(validPayload, request);
		if (!rateLimitResult.allowed) {
			const socialwiseDataForLog = getSocialWiseChatwitData(validPayload.context);
			webhookLogger.warn("Rate limit exceeded", {
				sessionId: validPayload.session_id,
				accountId: socialwiseDataForLog?.account_data?.id || validPayload.context.inbox?.account_id,
				inboxId: socialwiseDataForLog?.inbox_data?.id || validPayload.context.inbox?.id,
				scope: rateLimitResult.scope,
				limit: rateLimitResult.limit,
				remaining: rateLimitResult.remaining,
				traceId,
			});

			return NextResponse.json(
				{ error: "Rate limit exceeded", throttled: true },
				{
					status: 429,
					headers: {
						"X-RateLimit-Limit": rateLimitResult.limit.toString(),
						"X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
						"X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
						"X-RateLimit-Scope": rateLimitResult.scope,
					},
				},
			);
		}

		// Step 9.5: Handle system events (payment.confirmed from Chatwit/InfinitePay)
		const rawPayload = validPayload as any;
		if (rawPayload.event_type === "payment.confirmed" && rawPayload.data) {
			webhookLogger.info("💰 PAYMENT CONFIRMED event received", {
				orderNsu: rawPayload.data?.order_nsu,
				amountCents: rawPayload.data?.amount_cents,
				contactPhone: rawPayload.data?.contact?.phone_number,
				traceId,
			});
			try {
				const paymentResult = await handlePaymentConfirmed(rawPayload as PaymentConfirmedPayload, traceId);
				const paymentResponse = { ...paymentResult, ok: true, event: "payment.confirmed" };
				logFinalResponse(paymentResponse, 200, traceId);
				return NextResponse.json(paymentResponse, { status: 200 });
			} catch (err) {
				webhookLogger.error("Payment confirmed handler error", { error: String(err), traceId });
				return NextResponse.json({ ok: true, event: "payment.confirmed", error: "processing_failed" }, { status: 200 });
			}
		}

		// Step 10: Sanitize user input
		const sanitizedText = sanitizeUserText(validPayload.message);
		if (!sanitizedText.success) {
			webhookLogger.error("Input sanitization failed", {
				error: sanitizedText.error,
				traceId,
			});
			return NextResponse.json({ error: "Invalid message content", details: sanitizedText.error }, { status: 400 });
		}
		let textInput = sanitizedText.data!;

		// Step 10.1: Check for native handoff payloads BEFORE content processing
		const contentAttrs = (validPayload.context?.message?.content_attributes || {}) as any;
		const quickReplyPayload = contentAttrs.quick_reply_payload;
		const postbackPayload = contentAttrs.postback_payload;

		// Check quick_reply_payload for handoff
		if (quickReplyPayload && quickReplyPayload.toLowerCase() === "@falar_atendente") {
			webhookLogger.info("🚨 NATIVE HANDOFF detected in quick_reply_payload", {
				quickReplyPayload,
				messageContent: textInput,
				traceId,
			});
			const handoffResponse = { action: "handoff" };
			logFinalResponse(handoffResponse, 200, traceId);
			return NextResponse.json(handoffResponse, { status: 200 });
		}

		// Check postback_payload for handoff
		if (postbackPayload && postbackPayload.toLowerCase() === "@falar_atendente") {
			webhookLogger.info("🚨 NATIVE HANDOFF detected in postback_payload", {
				postbackPayload,
				messageContent: textInput,
				traceId,
			});
			const handoffResponse = { action: "handoff" };
			logFinalResponse(handoffResponse, 200, traceId);
			return NextResponse.json(handoffResponse, { status: 200 });
		}

		// Check for @recomecar (restart conversation)
		if (
			(quickReplyPayload && quickReplyPayload.toLowerCase() === "@recomecar") ||
			(postbackPayload && postbackPayload.toLowerCase() === "@recomecar")
		) {
			webhookLogger.info("🔄 RESTART detected", {
				payload: quickReplyPayload || postbackPayload,
				traceId,
			});
			const restartResponse = {
				whatsapp: {
					type: "text",
					text: {
						body: "Olá! Vamos começar novamente. Como posso ajudar você hoje?",
					},
				},
				instagram: {
					text: "Olá! Vamos começar novamente. Como posso ajudar você hoje?",
				},
			};
			logFinalResponse(restartResponse, 200, traceId);
			return NextResponse.json(restartResponse, { status: 200 });
		}

		// Check for @sair (end conversation)
		if (
			(quickReplyPayload && quickReplyPayload.toLowerCase() === "@sair") ||
			(postbackPayload && postbackPayload.toLowerCase() === "@sair")
		) {
			webhookLogger.info("👋 EXIT detected", {
				payload: quickReplyPayload || postbackPayload,
				traceId,
			});
			const exitResponse = {
				whatsapp: {
					type: "text",
					text: {
						body: "Até logo! Se precisar de ajuda novamente, é só enviar uma mensagem. 👋",
					},
				},
				instagram: {
					text: "Até logo! Se precisar de ajuda novamente, é só enviar uma mensagem. 👋",
				},
			};
			logFinalResponse(exitResponse, 200, traceId);
			return NextResponse.json(exitResponse, { status: 200 });
		}

		// Check for @retry (retry with degraded model after LLM timeout)
		// WhatsApp buttons send button_id at root level, not in content_attributes
		const rootButtonId = (payload as any)?.button_id as string | undefined;
		if (
			(quickReplyPayload && quickReplyPayload.toLowerCase() === "@retry") ||
			(postbackPayload && postbackPayload.toLowerCase() === "@retry") ||
			(rootButtonId && rootButtonId.toLowerCase() === "@retry")
		) {
			// Extract channel type early (before Step 11) for @retry handling
			const retryChannelType =
				validPayload.channel_type ||
				validPayload.context?.inbox?.channel_type ||
				"Channel::Whatsapp";

			webhookLogger.info("🔄 RETRY detected - processing with degraded model", {
				payload: quickReplyPayload || postbackPayload,
				channelType: retryChannelType,
				traceId,
			});

			const retryResult = await handleRetryWithDegradation(validPayload, retryChannelType, traceId);

			if (retryResult.success && retryResult.response) {
				webhookLogger.info("🔄 RETRY successful", {
					reason: retryResult.reason,
					traceId,
				});
				logFinalResponse(retryResult.response, 200, traceId);
				return NextResponse.json(retryResult.response, { status: 200 });
			}

			if (retryResult.forceHandoff) {
				webhookLogger.info("🔄 RETRY exceeded max attempts - forcing handoff", {
					reason: retryResult.reason,
					traceId,
				});
				const handoffResponse = { action: "handoff" };
				logFinalResponse(handoffResponse, 200, traceId);
				return NextResponse.json(handoffResponse, { status: 200 });
			}

			// Fallback: return generic response
			const fallbackResponse = buildChannelResponse(
				retryChannelType,
				"Desculpe, não conseguimos processar sua solicitação no momento.\n\nSe nenhum botão atender, digite sua solicitação",
				[{ title: "Atendimento Humano", payload: "@falar_atendente" }],
			);
			logFinalResponse(fallbackResponse, 200, traceId);
			return NextResponse.json(fallbackResponse, { status: 200 });
		}

		// Step 11: Extract context from validated payload
		const rootChannelType = validPayload.channel_type;
		const socialwiseData = getSocialWiseChatwitData(validPayload.context);
		const ctxChannelType = socialwiseData?.inbox_data?.channel_type || validPayload.context.inbox?.channel_type;
		const channelType = rootChannelType || ctxChannelType || "unknown";
		const externalInboxNumeric = socialwiseData?.inbox_data?.id || validPayload.context.inbox?.id || 0;
		const chatwitAccountId = socialwiseData?.account_data?.id || validPayload.context.inbox?.account_id || 0;
		// Priority order: context.message.source_id > socialwise-chatwit.wamid > socialwise-chatwit.message_data.id
		const wamid = String(
			validPayload.context.message?.source_id || socialwiseData?.wamid || socialwiseData?.message_data?.id || "",
		);

		// Extract contact information for variable resolution with fallbacks
		const igUserName =
			validPayload.context?.contact?.additional_attributes?.social_instagram_user_name ||
			validPayload.context?.contact?.additional_attributes?.social_profiles?.instagram;
		const contactName =
			socialwiseData?.contact_data?.name ||
			validPayload.context?.contact?.name ||
			igUserName ||
			socialwiseData?.contact_name;
		const contactPhone =
			socialwiseData?.contact_data?.phone_number ||
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

		const inboxId = String(inboxRow?.inboxId || externalInboxNumeric || "");
		const userId = (inboxRow as any)?.usuarioChatwit?.appUserId;

		// 🚨 ALERTA CRÍTICO: userId não encontrado - sistema vai usar fallback genérico
		if (!userId) {
			webhookLogger.error("🚨 CONFIGURAÇÃO INCOMPLETA: userId não encontrado para inbox", {
				problema: "Inbox não está vinculada a um usuário válido no sistema",
				impacto: "Sistema vai usar FALLBACK GENÉRICO ao invés de IA inteligente (embedding/LLM)",
				solucao: {
					passo1: "Verificar se a inbox existe no banco: ChatwitInbox onde inboxId=%s",
					passo2: "Verificar se existe UsuarioChatwit com chatwitAccountId=%s",
					passo3: "Vincular inbox ao usuário através de usuarioChatwit.appUserId",
					passo4: "Conferir se Account com id correspondente existe no banco",
				},
				dados: {
					externalInboxNumeric,
					chatwitAccountId,
					inboxId,
					inboxRowFound: !!inboxRow,
					hasUsuarioChatwit: !!(inboxRow as any)?.usuarioChatwit,
					appUserId: (inboxRow as any)?.usuarioChatwit?.appUserId || null,
				},
				channelType,
				traceId,
			});
		}

		webhookLogger.info("Processing SocialWise Flow request", {
			channelType,
			inboxId,
			userId,
			userIdStatus: userId ? "✅ OK" : "❌ MISSING - FALLBACK MODE",
			textLength: textInput.length,
			traceId,
		});

		// Step 13: Enhanced button interaction detection and processing
		// 🔥 PRIORIDADE: Botões do Flow Builder (prefixo flow_) são processados pelo FlowOrchestrator
		const buttonDetection = detectButtonClick(validPayload, channelType);
		let isFlowBuilderButton =
			buttonDetection.isButtonClick && buttonDetection.buttonId?.startsWith(FLOW_BUTTON_PREFIX);

		// Fallback: se o botão não tem prefixo flow_ mas existe em FlowEdge, é um botão de flow
		// (cobre flows importados antes da correção de regeneração de IDs)
		if (buttonDetection.isButtonClick && buttonDetection.buttonId && !isFlowBuilderButton) {
			const edgeMatch = await getPrismaInstance().flowEdge.findFirst({
				where: { buttonId: buttonDetection.buttonId },
				select: { id: true },
			});
			if (edgeMatch) {
				isFlowBuilderButton = true;
				webhookLogger.info("🔀 Legacy button ID found in FlowEdge, routing to FlowOrchestrator", {
					buttonId: buttonDetection.buttonId,
					traceId,
				});
			}
		}

		// Se NÃO for botão do Flow Builder, usar processamento legado de button reactions
		let buttonReactionResponse = null;
		if (!isFlowBuilderButton) {
			buttonReactionResponse = await handleButtonInteraction(validPayload, channelType, userId, wamid, traceId!);
		} else {
			webhookLogger.info("🚀 Flow Builder button detected, routing to FlowOrchestrator", {
				buttonId: buttonDetection.buttonId,
				channelType,
				traceId,
			});
		}

		if (buttonReactionResponse) {
			webhookLogger.info("🎯 Button interaction processed successfully", {
				buttonId: buttonReactionResponse.buttonId,
				mappingFound: buttonReactionResponse.mappingFound,
				hasEmoji: !!buttonReactionResponse.emoji,
				hasText: !!buttonReactionResponse.text,
				traceId,
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
		if (channelType.toLowerCase().includes("whatsapp")) {
			unmappedButtonId = ca?.button_reply?.id || (validPayload.context as any)?.button_id || null;
		} else if (channelType.toLowerCase().includes("instagram") || channelType.toLowerCase().includes("facebook")) {
			// Meta Platforms (Instagram + Facebook) usam a mesma estrutura
			unmappedButtonId =
				ca?.postback_payload ||
				ca?.quick_reply_payload ||
				(validPayload.context as any)?.postback_payload ||
				(validPayload.context as any)?.quick_reply_payload ||
				null;
		}

		webhookLogger.debug("🔍 Debug unmapped button detection", {
			channelType,
			unmappedButtonId,
			caPostbackPayload: ca?.postback_payload,
			contextPostbackPayload: (validPayload.context as any)?.postback_payload,
			contextInteractionType: (validPayload.context as any)?.interaction_type,
			caInteractionType: ca?.interaction_type,
			traceId,
		});

		// If it's an unmapped button, use the real button text (message field) as input for LLM
		const isWhatsAppButton = unmappedButtonId && (validPayload.context as any)?.interaction_type === "button_reply";
		const isMetaButton =
			unmappedButtonId &&
			(channelType.toLowerCase().includes("instagram") || channelType.toLowerCase().includes("facebook")) &&
			(ca?.postback_payload || ca?.quick_reply_payload);

		if (unmappedButtonId && (isWhatsAppButton || isMetaButton)) {
			// Usar o campo 'message' que contém o texto real do botão
			// Isso é padronizado entre WhatsApp e Meta Platforms (Instagram/Facebook)
			const realButtonText = validPayload.message || validPayload.context?.message?.content;

			webhookLogger.debug("🔍 Debug button text extraction", {
				unmappedButtonId,
				isWhatsAppButton,
				isMetaButton,
				validPayloadMessage: validPayload.message,
				contextMessageContent: validPayload.context?.message?.content,
				realButtonText,
				currentTextInput: textInput,
				interactionType: (validPayload.context as any)?.interaction_type,
				traceId,
			});

			if (realButtonText) {
				// Se temos o texto real do botão, usar ele (mesmo que seja igual ao textInput atual)
				textInput = realButtonText;

				webhookLogger.info("🔄 Unmapped button detected, using real button text for LLM processing", {
					originalButtonId: unmappedButtonId,
					realButtonText: realButtonText,
					traceId,
				});
			} else {
				// Fallback: usar buttonId se não houver campo message
				const buttonText = unmappedButtonId.startsWith("@") ? unmappedButtonId.substring(1) : unmappedButtonId;
				textInput = buttonText;

				webhookLogger.info("🔄 Unmapped button detected, using buttonId as fallback for LLM processing", {
					originalButtonId: unmappedButtonId,
					fallbackText: buttonText,
					traceId,
				});
			}
		}

		// Direct handoff for specific button IDs only - do not try direct intent mapping
		if (unmappedButtonId && unmappedButtonId.toLowerCase() === "@falar_atendente") {
			const handoffResponse = { action: "handoff" };
			logFinalResponse(handoffResponse, 200, traceId);
			return NextResponse.json(handoffResponse, { status: 200 });
		}

		// Check for @retry (retry with degraded model) via unmapped button
		if (unmappedButtonId && unmappedButtonId.toLowerCase() === "@retry") {
			const retryChannelType =
				validPayload.channel_type ||
				validPayload.context?.inbox?.channel_type ||
				"Channel::Whatsapp";

			webhookLogger.info("🔄 RETRY detected via unmapped button - processing with degraded model", {
				unmappedButtonId,
				channelType: retryChannelType,
				traceId,
			});

			const retryResult = await handleRetryWithDegradation(validPayload, retryChannelType, traceId);

			if (retryResult.success && retryResult.response) {
				webhookLogger.info("🔄 RETRY successful", { reason: retryResult.reason, traceId });
				logFinalResponse(retryResult.response, 200, traceId);
				return NextResponse.json(retryResult.response, { status: 200 });
			}

			if (retryResult.forceHandoff) {
				webhookLogger.info("🔄 RETRY exceeded max attempts - forcing handoff", { reason: retryResult.reason, traceId });
				const handoffResponse = { action: "handoff" };
				logFinalResponse(handoffResponse, 200, traceId);
				return NextResponse.json(handoffResponse, { status: 200 });
			}

			const fallbackResponse = buildChannelResponse(
				retryChannelType,
				"Desculpe, não conseguimos processar sua solicitação no momento.\n\nSe nenhum botão atender, digite sua solicitação",
				[{ title: "Atendimento Humano", payload: "@falar_atendente" }],
			);
			logFinalResponse(fallbackResponse, 200, traceId);
			return NextResponse.json(fallbackResponse, { status: 200 });
		}

		// Check for @recomecar (restart)
		if (unmappedButtonId && unmappedButtonId.toLowerCase() === "@recomecar") {
			webhookLogger.info("🔄 RESTART via unmapped button", { unmappedButtonId, traceId });
			const restartResponse = {
				whatsapp: {
					type: "text",
					text: {
						body: "Olá! Vamos começar novamente. Como posso ajudar você hoje?",
					},
				},
				instagram: {
					text: "Olá! Vamos começar novamente. Como posso ajudar você hoje?",
				},
			};
			logFinalResponse(restartResponse, 200, traceId);
			return NextResponse.json(restartResponse, { status: 200 });
		}

		// Check for @sair (exit)
		if (unmappedButtonId && unmappedButtonId.toLowerCase() === "@sair") {
			webhookLogger.info("👋 EXIT via unmapped button", { unmappedButtonId, traceId });
			const exitResponse = {
				whatsapp: {
					type: "text",
					text: {
						body: "Até logo! Se precisar de ajuda novamente, é só enviar uma mensagem. 👋",
					},
				},
				instagram: {
					text: "Até logo! Se precisar de ajuda novamente, é só enviar uma mensagem. 👋",
				},
			};
			logFinalResponse(exitResponse, 200, traceId);
			return NextResponse.json(exitResponse, { status: 200 });
		}

		// For all other unmapped buttons, let them go through the full flow:
		// text input → direct alias hit → embedding → classification by bands
		// This ensures proper intent resolution through the complete SocialWise Flow

		// Legacy button processing para compatibilidade
		const interactionType: string | null =
			ca?.interaction_type || swInteractive?.interaction_type || swInstagram?.interaction_type || null;

		const legacyButtonReply = ca?.button_reply || ca?.interactive_payload?.button_reply || {};
		const legacyDerivedButtonId: string | null =
			legacyButtonReply?.id ||
			swInteractive?.button_id ||
			ca?.postback_payload ||
			swInstagram?.postback_payload ||
			null;
		const legacyButtonTitle: string | null = legacyButtonReply?.title || swInteractive?.button_title || null;

		// Handle legacy button interactions (se não foi processado pelo novo sistema)
		// Allow handoff buttons to be processed by legacy even if detected as unmapped
		const isHandoffButton = unmappedButtonId === "@falar_atendente";
		if (
			(interactionType === "button_reply" || interactionType === "postback") &&
			legacyDerivedButtonId &&
			!buttonReactionResponse &&
			(!unmappedButtonId || isHandoffButton)
		) {
			const idLower = String(legacyDerivedButtonId).toLowerCase();
			const titleLower = String(legacyButtonTitle || "").toLowerCase();

			// Direct automations: btn_* or ig_* or fb_*
			if (idLower.startsWith("btn_") || idLower.startsWith("ig_") || idLower.startsWith("fb_")) {
				// Handoff shortcuts
				if (
					idLower.includes("handoff") ||
					titleLower.includes("falar") ||
					titleLower.includes("atendente") ||
					titleLower.includes("humano")
				) {
					const handoffResponse = { action: "handoff" };
					logFinalResponse(handoffResponse, 200, traceId);
					return NextResponse.json(handoffResponse, { status: 200 });
				}
				// No IA processing needed for direct automations
				const emptyResponse = {};
				logFinalResponse(emptyResponse, 200, traceId);
				return NextResponse.json(emptyResponse, { status: 200 });
			}

			// Intent mapping: intent:<name> or @<name>
			if (idLower.startsWith("intent:") || idLower.startsWith("@")) {
				// Direct handoff for specific button IDs only
				if (idLower === "@falar_atendente") {
					const handoffResponse = { action: "handoff" };
					logFinalResponse(handoffResponse, 200, traceId);
					return NextResponse.json(handoffResponse, { status: 200 });
				}

				// For all other intent buttons, let them go through the full SocialWise Flow
				// This ensures proper direct alias hit → embedding → classification process
				const norm = normalizeIntentId(String(legacyDerivedButtonId));
				const rawIntent = norm.plain;

				// Use the raw intent text as input for the full flow processing
				textInput = rawIntent;

				webhookLogger.info("Legacy button will be processed through full SocialWise Flow", {
					buttonId: legacyDerivedButtonId,
					rawIntent,
					channelType,
					traceId,
				});

				// Continue to Step 14 for full flow processing
			}

			// Conversational continuation: ia_* - treat button title as user message
			if (idLower.startsWith("ia_")) {
				const syntheticText = String(legacyButtonTitle || textInput || "").trim();
				// Process as regular text input through optimized flow
				textInput = syntheticText;
			}
		}

		// Step 13.5: Message Debounce (aggregates rapid-fire messages)
		const sessionIdForDebounce = extractSessionId(payload, channelType);

		if (isDebounceEnabled() && sessionIdForDebounce && !unmappedButtonId) {
			// Only debounce regular text messages, not button interactions
			const debounceConfig = getDebounceConfig();

			webhookLogger.info("Debounce check", {
				sessionId: sessionIdForDebounce,
				debounceMs: debounceConfig.debounceMs,
				isButtonInteraction: !!unmappedButtonId,
				traceId,
			});

			const debounceResult = await addToDebounceBuffer(
				sessionIdForDebounce,
				{
					text: textInput,
					timestamp: Date.now(),
					messageId: String(validPayload.context.message?.id || correlationId),
					wamid,
					traceId,
				},
				{
					channelType,
					inboxId,
					chatwitAccountId: String(chatwitAccountId),
					userId,
					contactName,
					contactPhone: typeof contactPhone === "string" ? contactPhone : undefined,
					originalPayload: payload,
				},
			);

			if (!debounceResult.shouldProcess) {
				// This message was debounced - another request will process it
				webhookLogger.info("Message debounced, awaiting aggregation", {
					sessionId: sessionIdForDebounce,
					isDebounced: debounceResult.isDebounced,
					messageCount: debounceResult.messageCount,
					traceId,
				});

				// Return 202 Accepted to indicate the message was received but processing is deferred
				const debouncedResponse = {
					ok: true,
					debounced: true,
					message: "Mensagem recebida, aguardando agregação",
				};
				logFinalResponse(debouncedResponse, 202, traceId);
				return NextResponse.json(debouncedResponse, { status: 202 });
			}

			// This request should process the aggregated messages
			if (debounceResult.isDebounced && debounceResult.aggregatedText) {
				webhookLogger.info("Processing debounced messages", {
					sessionId: sessionIdForDebounce,
					messageCount: debounceResult.messageCount,
					originalText: textInput,
					aggregatedTextLength: debounceResult.aggregatedText.length,
					traceId,
				});

				// Use aggregated text instead of single message
				textInput = debounceResult.aggregatedText;
			}
		}

		// Step 13.6: Flow Engine - Resume de sessões para botões do Flow Builder (prefixo flow_)
		// NOTA: Flows ativados por intent mapping são executados em band-handlers.ts, NÃO aqui.
		if (isFlowBuilderButton) {
			// Dedup: Chatwit pode reenviar o mesmo clique de botão (retry/reprocessamento).
			// Sem dedup, o FlowOrchestrator encontra a sessão WAITING_INPUT e re-executa o flow,
			// causando mensagens duplicadas + fall-through para LLM.
			const flowBtnDedupKey = `sw:flow_btn:${validPayload.session_id}:${buttonDetection.buttonId}`;
			try {
				const redis = getRedisInstance();
				const isNewClick = await redis.set(flowBtnDedupKey, traceId || "1", "EX", 30, "NX");
				if (!isNewClick) {
					webhookLogger.info("[FlowEngine] Duplicate flow button click detected, skipping", {
						buttonId: buttonDetection.buttonId,
						sessionId: validPayload.session_id,
						traceId,
					});
					return NextResponse.json({ status: "accepted", dedup: true }, { status: 200 });
				}
			} catch (dedupErr) {
				// Redis falhou — prosseguir sem dedup (fail-open)
				webhookLogger.warn("[FlowEngine] Flow button dedup check failed, continuing", {
					error: dedupErr instanceof Error ? dedupErr.message : String(dedupErr),
				});
			}

			try {
				const flowOrchestrator = new FlowOrchestrator();

				// Extrair metadata do payload para contexto de entrega
				const socialwiseMetadata = getSocialWiseChatwitData(validPayload.context);

				// Obter chatwitBaseUrl do metadata (enviado pelo Chatwit no payload)
				const chatwitBaseUrl =
					((socialwiseMetadata as Record<string, unknown>)?.chatwit_base_url as string) ||
					((validPayload.metadata as Record<string, unknown>)?.chatwit_base_url as string) ||
					process.env.CHATWIT_BASE_URL ||
					"";

				// Token do Agent Bot para entrega async
				const chatwitAccessToken =
					((validPayload.metadata as Record<string, unknown>)?.chatwit_agent_bot_token as string) ||
					process.env.CHATWIT_AGENT_BOT_TOKEN ||
					"";

				// Fire-and-forget: persistir bot token + URL no SystemConfig (para campanhas)
				const metaBotToken = (validPayload.metadata as Record<string, unknown>)?.chatwit_agent_bot_token as string | undefined;
				const metaBaseUrl = (validPayload.metadata as Record<string, unknown>)?.chatwit_base_url as string | undefined;
				if (metaBotToken && metaBaseUrl) {
					saveChatwitSystemConfig({ botToken: metaBotToken, baseUrl: metaBaseUrl }).catch(() => {});
				}

				// Tenta obter conversation_display_id (essencial para API async)
				const conversationDisplayId =
					Number(
						(validPayload.metadata as Record<string, unknown>)?.conversation_display_id ||
						(validPayload.context?.conversation as Record<string, unknown>)?.display_id,
					) || undefined;

				// Construir DeliveryContext para o FlowOrchestrator
				const deliveryContext: DeliveryContext = {
					accountId: Number(chatwitAccountId) || 0,
					conversationId:
						Number(socialwiseMetadata?.conversation_data?.id || validPayload.context?.conversation?.id) || 0,
					conversationDisplayId,
					inboxId: Number(inboxRow?.inboxId || externalInboxNumeric) || 0,
					contactId: Number(socialwiseMetadata?.contact_data?.id || validPayload.context?.contact?.id) || 0,
					contactName: contactName || "",
					contactPhone: (typeof contactPhone === "string" ? contactPhone : "") || "",
					channelType: channelType.toLowerCase().includes("whatsapp")
						? "whatsapp"
						: channelType.toLowerCase().includes("instagram")
							? "instagram"
							: channelType.toLowerCase().includes("facebook")
								? "facebook"
								: "whatsapp",
					sourceMessageId: wamid || undefined,
					prismaInboxId: inboxRow?.id || undefined,
					chatwitAccessToken,
					chatwitBaseUrl,
				};

				webhookLogger.info("🔧 CHATWIT CONFIG RESOLVED (Flow Builder button)", {
					chatwitBaseUrl,
					hasAccessToken: !!chatwitAccessToken,
					accountId: deliveryContext.accountId,
					conversationId: deliveryContext.conversationId,
					buttonId: buttonDetection.buttonId,
				});

				// Construir payload para o FlowOrchestrator (somente para resume de botão)
				const flowPayload: ChatwitWebhookPayload = {
					session_id: validPayload.session_id,
					text: textInput,
					channel_type: validPayload.channel_type,
					language: validPayload.language,
					metadata: {
						...(validPayload.metadata as Record<string, unknown>),
						...(socialwiseMetadata as Record<string, unknown>),
						button_id: buttonDetection.buttonId,
						chatwit_base_url: chatwitBaseUrl,
						chatwit_agent_bot_token: chatwitAccessToken,
					},
					content_attributes: validPayload.context?.message?.content_attributes as {
						button_reply?: { id: string; title?: string };
						list_reply?: { id: string; title?: string };
					},
					message: {
						content: textInput,
						content_attributes: validPayload.context?.message?.content_attributes as Record<string, unknown>,
					},
				};

				const flowResult = await flowOrchestrator.handle(flowPayload, deliveryContext);

				if (flowResult.error) {
					webhookLogger.warn("[FlowEngine] Erro ao processar botão do flow", {
						error: flowResult.error,
						buttonId: buttonDetection.buttonId,
						traceId,
					});
					// Continua para Flash Intent como fallback
				} else if (flowResult.syncResponse) {
					webhookLogger.info("[FlowEngine] Flow button resumido com sucesso (sync)", {
						waitingInput: flowResult.waitingInput,
						traceId,
					});
					logFinalResponse(flowResult.syncResponse, 200, traceId);
					return NextResponse.json(flowResult.syncResponse, { status: 200 });
				} else if (flowResult.waitingInput) {
					webhookLogger.info("[FlowEngine] Flow aguardando input (async)", { traceId });
					const asyncResponse = { status: "accepted", async: true };
					logFinalResponse(asyncResponse, 200, traceId);
					return NextResponse.json(asyncResponse, { status: 200 });
				} else {
					// Flow processado com sucesso (entrega async, sem payload sync).
					// IMPORTANTE: retornar aqui para NÃO cair no pipeline de LLM.
					webhookLogger.info("[FlowEngine] Flow button processado (async-only, sem sync response)", { traceId });
					const asyncResponse = { status: "accepted", async: true };
					logFinalResponse(asyncResponse, 200, traceId);
					return NextResponse.json(asyncResponse, { status: 200 });
				}
			} catch (flowError) {
				webhookLogger.error("[FlowEngine] Erro crítico no FlowOrchestrator (button resume)", {
					error: flowError instanceof Error ? flowError.message : String(flowError),
					buttonId: buttonDetection.buttonId,
					traceId,
				});
				// Continua para Flash Intent como fallback
			}
		}

		// Step 13.7: Template QUICK_REPLY text-match fallback
		// Quando o Chatwit não parseia o payload de botões QUICK_REPLY de template,
		// a mensagem chega como texto puro. Tentamos match pelo FlowOrchestrator
		// ANTES do pipeline de classificação para evitar que o LLM processe o clique.
		if (!isFlowBuilderButton && !buttonReactionResponse && textInput && channelType.toLowerCase().includes("whatsapp")) {
			try {
				const flowOrchestrator = new FlowOrchestrator();

				const socialwiseMetadata = getSocialWiseChatwitData(validPayload.context);
				const chatwitBaseUrl =
					((socialwiseMetadata as Record<string, unknown>)?.chatwit_base_url as string) ||
					((validPayload.metadata as Record<string, unknown>)?.chatwit_base_url as string) ||
					process.env.CHATWIT_BASE_URL ||
					"";
				const chatwitAccessToken =
					((validPayload.metadata as Record<string, unknown>)?.chatwit_agent_bot_token as string) ||
					process.env.CHATWIT_AGENT_BOT_TOKEN ||
					"";
				const conversationDisplayId =
					Number(
						(validPayload.metadata as Record<string, unknown>)?.conversation_display_id ||
						(validPayload.context?.conversation as Record<string, unknown>)?.display_id,
					) || undefined;

				const deliveryContext: DeliveryContext = {
					accountId: Number(chatwitAccountId) || 0,
					conversationId:
						Number(socialwiseMetadata?.conversation_data?.id || validPayload.context?.conversation?.id) || 0,
					conversationDisplayId,
					inboxId: Number(inboxRow?.inboxId || externalInboxNumeric) || 0,
					contactId: Number(socialwiseMetadata?.contact_data?.id || validPayload.context?.contact?.id) || 0,
					contactName: contactName || "",
					contactPhone: (typeof contactPhone === "string" ? contactPhone : "") || "",
					channelType: "whatsapp",
					sourceMessageId: wamid || undefined,
					prismaInboxId: inboxRow?.id || undefined,
					chatwitAccessToken,
					chatwitBaseUrl,
				};

				const flowPayload: ChatwitWebhookPayload = {
					session_id: validPayload.session_id,
					text: textInput,
					channel_type: validPayload.channel_type,
					language: validPayload.language,
					metadata: {
						...(validPayload.metadata as Record<string, unknown>),
						chatwit_base_url: chatwitBaseUrl,
						chatwit_agent_bot_token: chatwitAccessToken,
					},
					message: {
						content: textInput,
						content_attributes: validPayload.context?.message?.content_attributes as Record<string, unknown>,
					},
				};

				const flowResult = await flowOrchestrator.handle(flowPayload, deliveryContext);

				if (flowResult.syncResponse) {
					webhookLogger.info("[FlowEngine] Template QUICK_REPLY resumido via text-match (sync)", {
						messageText: textInput,
						traceId,
					});
					logFinalResponse(flowResult.syncResponse, 200, traceId);
					return NextResponse.json(flowResult.syncResponse, { status: 200 });
				} else if (flowResult.waitingInput || flowResult.handled) {
					webhookLogger.info("[FlowEngine] Template QUICK_REPLY resumido via text-match (async)", { traceId });
					const asyncResponse = { status: "accepted", async: true };
					logFinalResponse(asyncResponse, 200, traceId);
					return NextResponse.json(asyncResponse, { status: 200 });
				}
				// Se flowResult não foi handled, não houve match → continua para LLM
			} catch (flowError) {
				webhookLogger.warn("[FlowEngine] Erro no text-match fallback (não-bloqueante)", {
					error: flowError instanceof Error ? flowError.message : String(flowError),
					traceId,
				});
				// Continua para pipeline de classificação
			}
		}

		// Step 13.8: WAIT_FOR_REPLY free-text collection (all channels)
		// Se o usuário mandou texto livre e há sessão WAITING_INPUT com _waitType=free_text,
		// retomar o flow coletando o texto. Roda para TODOS os canais.
		if (!isFlowBuilderButton && !buttonReactionResponse && textInput) {
			try {
				const flowOrchestrator = new FlowOrchestrator();

				const socialwiseMetadata = getSocialWiseChatwitData(validPayload.context);
				const chatwitBaseUrl =
					((socialwiseMetadata as Record<string, unknown>)?.chatwit_base_url as string) ||
					((validPayload.metadata as Record<string, unknown>)?.chatwit_base_url as string) ||
					process.env.CHATWIT_BASE_URL ||
					"";
				const chatwitAccessToken =
					((validPayload.metadata as Record<string, unknown>)?.chatwit_agent_bot_token as string) ||
					process.env.CHATWIT_AGENT_BOT_TOKEN ||
					"";
				const conversationDisplayId =
					Number(
						(validPayload.metadata as Record<string, unknown>)?.conversation_display_id ||
						(validPayload.context?.conversation as Record<string, unknown>)?.display_id,
					) || undefined;

				const resolvedChannelType = channelType.toLowerCase().includes("whatsapp")
					? "whatsapp" as const
					: channelType.toLowerCase().includes("instagram")
						? "instagram" as const
						: channelType.toLowerCase().includes("facebook")
							? "facebook" as const
							: "whatsapp" as const;

				const deliveryContext: DeliveryContext = {
					accountId: Number(chatwitAccountId) || 0,
					conversationId:
						Number(socialwiseMetadata?.conversation_data?.id || validPayload.context?.conversation?.id) || 0,
					conversationDisplayId,
					inboxId: Number(inboxRow?.inboxId || externalInboxNumeric) || 0,
					contactId: Number(socialwiseMetadata?.contact_data?.id || validPayload.context?.contact?.id) || 0,
					contactName: contactName || "",
					contactPhone: (typeof contactPhone === "string" ? contactPhone : "") || "",
					channelType: resolvedChannelType,
					sourceMessageId: wamid || undefined,
					prismaInboxId: inboxRow?.id || undefined,
					chatwitAccessToken,
					chatwitBaseUrl,
				};

				const flowPayload: ChatwitWebhookPayload = {
					session_id: validPayload.session_id,
					text: textInput,
					channel_type: validPayload.channel_type,
					language: validPayload.language,
					metadata: {
						...(validPayload.metadata as Record<string, unknown>),
						chatwit_base_url: chatwitBaseUrl,
						chatwit_agent_bot_token: chatwitAccessToken,
					},
					message: {
						content: textInput,
						content_attributes: validPayload.context?.message?.content_attributes as Record<string, unknown>,
					},
				};

				const flowResult = await flowOrchestrator.handle(flowPayload, deliveryContext);

				if (flowResult.syncResponse) {
					webhookLogger.info("[FlowEngine] WAIT_FOR_REPLY free-text resumido (sync)", {
						textPreview: textInput.slice(0, 30),
						traceId,
					});
					logFinalResponse(flowResult.syncResponse, 200, traceId);
					return NextResponse.json(flowResult.syncResponse, { status: 200 });
				} else if (flowResult.waitingInput || flowResult.handled) {
					webhookLogger.info("[FlowEngine] WAIT_FOR_REPLY free-text (async/handled)", { traceId });
					const asyncResponse = { status: "accepted", async: true };
					logFinalResponse(asyncResponse, 200, traceId);
					return NextResponse.json(asyncResponse, { status: 200 });
				}
				// Sem match → continua para LLM
			} catch (flowError) {
				webhookLogger.warn("[FlowEngine] Erro no WAIT_FOR_REPLY free-text (não-bloqueante)", {
					error: flowError instanceof Error ? flowError.message : String(flowError),
					traceId,
				});
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
				contactPhone: typeof contactPhone === "string" ? contactPhone : undefined,
				originalPayload: payload, // For button reaction detection
				sessionId: extractSessionId(payload, channelType), // For conversational memory
			};

			// Get agent configuration for embedipreview setting
			const assistant = await getAssistantForInbox(inboxId, String(chatwitAccountId));
			const embedipreview = assistant?.embedipreview ?? true; // Default: embedding-first if assistant not found

			webhookLogger.info("Agent routing strategy configuration", {
				assistantId: assistant?.id || "not-found",
				embedipreview,
				strategy: embedipreview ? "embedding-first" : "llm-first",
				traceId,
			});

			webhookLogger.info("Starting SocialWise Flow processing", {
				userText: textInput,
				channelType,
				inboxId,
				userId,
				traceId,
			});

			// Process through optimized SocialWise Flow
			const result = await processSocialWiseFlow(processorContext, embedipreview);

			const routeTotalMs = Date.now() - startTime;

			// Record performance metrics
			const coldStart = process.uptime() < 120; // 2 min pós-boot/deploy
			const aliasHit =
				result.metrics.band === "HARD" &&
				result.metrics.strategy === "direct_map" &&
				(result.metrics.embeddingMs ?? 0) <= 15 &&
				(result.metrics.score ?? 0) >= 0.95;

			recordWebhookMetrics({
				responseTime: routeTotalMs,
				timestamp: new Date(),
				correlationId: correlationId!,
				success: true,
				payloadSize: payloadSizeKB * 1024,
				interactionType: interactionType === "button_reply" ? "button_reply" : "intent",
				// ↓ novos campos p/ filtragem e segmentação
				ts: Date.now(),
				coldStart,
				aliasHit,
				band: result.metrics.band, // 'HARD' | 'SOFT' | 'ROUTER'
				strategy: result.metrics.strategy, // 'direct_map' | 'router_llm' | ...
			});

			// Record quality sample (without PII)
			recordSocialWiseQualitySample({
				trace_id: traceId!,
				user_input: textInput, // Will be hashed by the monitoring system
				classification_result: result.metrics.strategy,
				generated_buttons: (() => {
					// Extract button titles safely from different message types
					if (result.response.whatsapp && "interactive" in result.response.whatsapp) {
						return result.response.whatsapp.interactive?.action?.buttons?.map((b: any) => b.reply.title);
					}
					if (result.response.instagram && "buttons" in result.response.instagram) {
						const instagramResponse = result.response.instagram as { buttons?: any[] };
						return instagramResponse.buttons?.map((b: any) => b.title);
					}
					return undefined;
				})(),
				response_time_ms: routeTotalMs,
				band: result.metrics.band,
				strategy: result.metrics.strategy,
			});

			webhookLogger.info("SocialWise Flow completed successfully", {
				band: result.metrics.band,
				strategy: result.metrics.strategy,
				routeTotalMs: result.metrics.routeTotalMs,
				embeddingMs: result.metrics.embeddingMs,
				llmWarmupMs: result.metrics.llmWarmupMs,
				traceId,
			});

			// ━━━ MESSAGE HISTORY PERSISTENCE (non-blocking) ━━━
			// Extrair contactId do contexto
			const contactId = String(socialwiseData?.contact_data?.id || validPayload.context?.contact?.id || "");

			// Lista de nomes de bots do sistema que NÃO devem ser registrados como leads
			const SYSTEM_BOT_NAMES = [
				"socialwise bot",
				"socialwisebot",
				"chatwit bot",
				"chatwitbot",
				"bot socialwise",
				"bot chatwit",
				"sistema",
				"system",
				"agente bot",
				"agent bot",
			];

			// Verificar se o contato é um bot do sistema
			const isSystemBot =
				contactName &&
				SYSTEM_BOT_NAMES.some(
					(botName) => contactName.toLowerCase().includes(botName) || contactName.toLowerCase() === botName,
				);

			// Persistir lead e mensagens em background (não bloqueia resposta)
			// SKIP: Não criar leads para bots do sistema
			setImmediate(async () => {
				if (isSystemBot) {
					webhookLogger.info("[MessageHistory] Skipping lead creation for system bot", {
						contactName,
						traceId,
					});
					return;
				}

				try {
					// 1. Criar/encontrar lead e chat
					const { chat, created } = await leadService.findOrCreateLead({
						phoneNumber: typeof contactPhone === "string" ? contactPhone : undefined,
						chatwitContactId: contactId || undefined,
						chatwitAccountId: String(chatwitAccountId),
						inboxId,
						name: contactName,
					});

					if (created) {
						webhookLogger.info("[MessageHistory] Novo lead criado", {
							chatId: chat.id,
							contactPhone,
							traceId,
						});
					}

					// 2. Salvar mensagem do lead (incoming)
					const incomingMsg = await messageService.saveMessage({
						chatId: chat.id,
						content: textInput,
						isFromLead: true,
						externalId: wamid || undefined,
						messageType: "text",
						metadata: {
							channelType,
							inboxId,
							traceId,
							band: result.metrics.band,
						},
					});

					if (incomingMsg) {
						webhookLogger.debug("[MessageHistory] Mensagem do lead salva", {
							messageId: incomingMsg.id,
							traceId,
						});
					}

					// 3. Salvar resposta do assistente (outgoing)
					const responseText = extractResponseText(result.response);
					if (responseText) {
						const buttonTitles = extractButtonTitles(result.response);
						const outgoingMsg = await messageService.saveMessage({
							chatId: chat.id,
							content: responseText,
							isFromLead: false,
							externalId: `assistant_${traceId}`,
							messageType: "assistant",
							metadata: {
								band: result.metrics.band,
								strategy: result.metrics.strategy,
								traceId,
								...(buttonTitles && { buttons: buttonTitles }),
							},
						});

						if (outgoingMsg) {
							webhookLogger.debug("[MessageHistory] Resposta do bot salva", {
								messageId: outgoingMsg.id,
								traceId,
							});
						}
					}

					// 4. Atualizar timestamp do lead
					await leadService.touchLead(chat.leadId);
				} catch (persistError) {
					webhookLogger.error("[MessageHistory] Erro na persistência (non-blocking)", {
						error: persistError instanceof Error ? persistError.message : String(persistError),
						traceId,
					});
				}
			});

			// async_ack = o timeout do modelo principal já foi reconhecido e a resposta final
			// seguirá depois via entrega async do Chatwit/Flow Engine.
			if (result.response.action === "async_ack") {
				const asyncAckResponse = { ok: true, async: true };
				logFinalResponse(asyncAckResponse, 200, traceId);
				return NextResponse.json(asyncAckResponse, { status: 200 });
			}

			// Handle handoff action
			if (result.response.action === "handoff") {
				const handoffResponse = { action: "handoff" };
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

			webhookLogger.info("🎯 FINAL WEBHOOK RESPONSE", {
				finalResponse: JSON.stringify(finalResponse, null, 2),
				responseType: typeof finalResponse,
				hasWhatsApp: !!finalResponse.whatsapp,
				hasInstagram: !!finalResponse.instagram,
				messageFormat: finalResponse.instagram?.message_format,
				traceId,
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

			webhookLogger.error("SocialWise Flow processing failed", {
				error: processingError instanceof Error ? processingError.message : String(processingError),
				routeTotalMs,
				traceId,
			});

			// Record error metrics
			recordWebhookMetrics({
				responseTime: routeTotalMs,
				timestamp: new Date(),
				correlationId: correlationId!,
				success: false,
				error: processingError instanceof Error ? processingError.message : String(processingError),
				payloadSize: payloadSizeKB * 1024,
				interactionType: interactionType === "button_reply" ? "button_reply" : "intent",
			});

			// Fallback to simple channel response
			const channelFallbackResponse = buildChannelResponse(channelType, textInput);
			logFinalResponse(channelFallbackResponse, 200, traceId);
			return NextResponse.json(channelFallbackResponse, { status: 200 });
		}
	} catch (error) {
		const routeTotalMs = Date.now() - startTime;
		console.error("!!! FATAL WEBHOOK ERROR !!!", error);
		webhookLogger.error("Webhook processing failed", {
			error: error instanceof Error ? error.message : String(error),
			routeTotalMs,
			traceId,
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
				interactionType: "intent",
			});
		}

		// Return 500 for unexpected errors
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
			status: "healthy",
			timestamp: new Date().toISOString(),
			version: "2.0.0-optimized",
			services: {
				database: "healthy",
				redis: "healthy",
				openai: "healthy",
			},
			responseTime: Date.now() - startTime,
		};

		// Quick database connectivity check
		try {
			await withPrismaReconnect(async (prisma) => {
				return prisma.$queryRaw`SELECT 1`;
			});
		} catch (dbError) {
			healthStatus.services.database = "unhealthy";
			healthStatus.status = "degraded";
		}

		webhookLogger.info("Health check completed", {
			status: healthStatus.status,
			responseTime: healthStatus.responseTime,
		});

		return NextResponse.json(healthStatus, {
			status: healthStatus.status === "healthy" ? 200 : 503,
		});
	} catch (error) {
		webhookLogger.error("Health check failed", {
			error: error instanceof Error ? error.message : String(error),
		});

		return NextResponse.json(
			{
				status: "unhealthy",
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? error.message : "Unknown error",
				version: "2.0.0-optimized",
			},
			{ status: 503 },
		);
	}
}
