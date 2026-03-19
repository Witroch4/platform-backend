import { NextResponse } from "next/server";
import { addLeadJob } from "@/lib/queue/leads-chatwit.queue";
import { getWebhooksConfig } from "@/lib/config";
import { normalizeChatwitLeadSyncPayload } from "@/lib/leads-chatwit/normalize-chatwit-lead-sync-payload";
import { processChatwitLeadSync } from "@/lib/leads-chatwit/process-chatwit-lead-sync";
import {
	isChatwitPaymentConfirmation,
	processPaymentWebhook,
	type ChatwitPaymentWebhookPayload,
} from "@/lib/leads/payment-webhook-processor";

// Verificar se deve usar processamento direto (default: true)
const webhooksConfig = getWebhooksConfig();
const WEBHOOK_DIRECT_PROCESSING = webhooksConfig.direct_processing;

export async function POST(request: Request): Promise<Response> {
	try {
		const rawPayload = await request.json();

		// Intercept payment confirmation events before lead processing
		if (isChatwitPaymentConfirmation(rawPayload)) {
			const result = await processPaymentWebhook(rawPayload as ChatwitPaymentWebhookPayload);
			return NextResponse.json({ success: true, ...result }, { status: 200 });
		}

		let normalizedPayload;
		try {
			normalizedPayload = normalizeChatwitLeadSyncPayload(rawPayload);
		} catch (normalizeError: any) {
			return NextResponse.json(
				{
					success: true,
					skipped: true,
					reason: "unsupported_payload",
					details: normalizeError.message,
				},
				{ status: 200 },
			);
		}

		if (normalizedPayload.skipReason) {
			return NextResponse.json(
				{
					success: true,
					skipped: true,
					reason: normalizedPayload.skipReason,
					event: normalizedPayload.event,
					syncMode: normalizedPayload.mode,
				},
				{ status: 200 },
			);
		}

		const payload = normalizedPayload.payload!;

		// validações mínimas após sanitização
		if (!payload?.origemLead?.source_id) {
			return NextResponse.json({ success: false, error: "source_id ausente após sanitização" }, { status: 400 });
		}

		if (WEBHOOK_DIRECT_PROCESSING) {
			// PROCESSAMENTO DIRETO (sem fila)
			const result = await processChatwitLeadSync(payload);

			return NextResponse.json(
				{
					success: true,
					processed: true,
					mode: "direct",
					event: normalizedPayload.event,
					syncMode: normalizedPayload.mode,
					leadId: result.leadId,
					arquivos: result.arquivos,
					leadCreated: result.leadCreated,
					sourceId: payload.origemLead.source_id,
				},
				{ status: 200 },
			);
		} else {
			// PROCESSAMENTO VIA FILA (para teste do worker)
			await addLeadJob({ payload });

			return NextResponse.json(
				{
					success: true,
					queued: true,
					mode: "queue",
					event: normalizedPayload.event,
					syncMode: normalizedPayload.mode,
					arquivos: payload.origemLead.arquivos?.length || 0,
					sourceId: payload.origemLead.source_id,
				},
				{ status: 202 },
			);
		}
	} catch (err: any) {
		const processingMode = WEBHOOK_DIRECT_PROCESSING ? "DIRETO" : "FILA";
		console.error(`[Webhook-${processingMode}] erro ao processar:`, err);
		return NextResponse.json(
			{ success: false, error: "erro interno", mode: processingMode.toLowerCase(), details: err.message },
			{ status: 500 },
		);
	}
}

export async function GET(): Promise<Response> {
	const processingMode = WEBHOOK_DIRECT_PROCESSING ? "direto (sem fila)" : "via fila BullMQ";
	return NextResponse.json(
		{
			status: `Webhook operante - processando ${processingMode}`,
			mode: WEBHOOK_DIRECT_PROCESSING ? "direct" : "queue",
			supportedEvents: ["contact_created", "contact_updated", "lead_files_sync", "legacy_message_with_attachments"],
			concurrency: process.env.LEADS_CHATWIT_CONCURRENCY || "default",
		},
		{ status: 200 },
	);
}
