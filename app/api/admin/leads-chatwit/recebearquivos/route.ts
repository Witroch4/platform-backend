// app/api/admin/leads-chatwit/recebearquivos/route.ts
import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { addLeadJob } from "@/lib/queue/leads-chatwit.queue";
import type { WebhookPayload } from "@/types/webhook";
import { getWebhooksConfig } from "@/lib/config";
import { sanitizeChatwitPayload } from "@/lib/leads-chatwit/sanitize-chatwit-payload";
import {
	isChatwitPaymentConfirmation,
	processPaymentWebhook,
	type ChatwitPaymentWebhookPayload,
} from "@/lib/leads/payment-webhook-processor";

// Verificar se deve usar processamento direto (default: true)
const webhooksConfig = getWebhooksConfig();
const WEBHOOK_DIRECT_PROCESSING = webhooksConfig.direct_processing;

/**
 * Processa um lead diretamente (sem fila) - mesma lógica do worker
 */
async function processLeadDirectly(payload: WebhookPayload) {
	const { usuario, origemLead } = payload;
	const sourceId = origemLead.source_id;

	// Converter todos os IDs para string antes de usar
	const chatwitAccountId = String(usuario.account.id);
	const leadSourceId = String(origemLead.source_id);

	// 1) Find or create/update do usuário
	let usuarioDb = await getPrismaInstance().usuarioChatwit.findFirst({
		where: {
			chatwitAccountId: chatwitAccountId,
			accountName: usuario.account.name,
		},
	});

	if (usuarioDb) {
		usuarioDb = await getPrismaInstance().usuarioChatwit.update({
			where: { id: usuarioDb.id },
			data: {
				channel: usuario.channel,
				chatwitAccountId: chatwitAccountId,
			},
		});
	} else {
		// Buscar o usuário do app pelo externalUserId
		const appUser = await getPrismaInstance().user.findFirst({
			where: {
				accounts: {
					some: {
						providerAccountId: chatwitAccountId,
					},
				},
			},
		});

		if (!appUser) {
			throw new Error(`Usuário do app não encontrado para accountId: ${chatwitAccountId}`);
		}

		usuarioDb = await getPrismaInstance().usuarioChatwit.create({
			data: {
				appUserId: appUser.id,
				name: usuario.account.name,
				accountName: usuario.account.name,
				channel: usuario.channel,
				chatwitAccountId: chatwitAccountId,
			},
		});
	}

	// 2) Criar ou atualizar Account específica para esta conta Chatwit (usando upsert para evitar race condition)
	const CHATWIT_ACCOUNT_ID = `CHATWIT_${chatwitAccountId}`;

	await getPrismaInstance().account.upsert({
		where: { id: CHATWIT_ACCOUNT_ID },
		update: {
			userId: usuarioDb.appUserId,
		},
		create: {
			id: CHATWIT_ACCOUNT_ID,
			userId: usuarioDb.appUserId,
			type: "chatwit",
			provider: "chatwit",
			providerAccountId: chatwitAccountId,
		},
	});

	// 3) Criar/atualizar Lead
	const lead = await getPrismaInstance().lead.upsert({
		where: {
			source_sourceIdentifier_accountId: {
				source: "CHATWIT_OAB",
				sourceIdentifier: leadSourceId,
				accountId: CHATWIT_ACCOUNT_ID,
			},
		},
		update: {
			name: origemLead.name || "Lead sem nome",
			phone: origemLead.phone_number,
			avatarUrl: origemLead.thumbnail,
			updatedAt: new Date(),
		},
		create: {
			name: origemLead.name || "Lead sem nome",
			phone: origemLead.phone_number,
			avatarUrl: origemLead.thumbnail,
			source: "CHATWIT_OAB",
			sourceIdentifier: leadSourceId,
			accountId: CHATWIT_ACCOUNT_ID,
			tags: [],
			userId: usuarioDb.appUserId,
		},
	});

	// 4) Criar ou atualizar o LeadOabData
	const leadOabData = await getPrismaInstance().leadOabData.upsert({
		where: { leadId: lead.id },
		update: {
			leadUrl: origemLead.leadUrl,
		},
		create: {
			leadId: lead.id,
			leadUrl: origemLead.leadUrl,
			usuarioChatwitId: usuarioDb.id,
			concluido: false,
			fezRecurso: false,
			manuscritoProcessado: false,
			aguardandoManuscrito: false,
			espelhoProcessado: false,
			aguardandoEspelho: false,
			analiseProcessada: false,
			aguardandoAnalise: false,
			analiseValidada: false,
			consultoriaFase2: false,
			recursoValidado: false,
			aguardandoRecurso: false,
		},
	});

	// 5) Processar arquivos
	const arquivos = origemLead.arquivos || [];

	if (arquivos.length > 0) {
		try {
			const result = await getPrismaInstance().arquivoLeadOab.createMany({
				data: arquivos.map((a) => ({
					leadOabDataId: leadOabData.id,
					fileType: a.file_type,
					dataUrl: a.data_url,
					chatwitFileId: a.chatwitFileId,
				})),
				skipDuplicates: true,
			});
			console.log(`[Webhook-Direct] ${result.count} arquivo(s) inseridos para lead ${sourceId}`);
		} catch (error) {
			console.error(`[Webhook-Direct] Erro ao inserir arquivos para lead ${sourceId}:`, error);
		}
	}

	return { leadId: leadOabData.id, arquivos: arquivos.length };
}

export async function POST(request: Request): Promise<Response> {
	try {
		const rawPayload = await request.json();

		// Intercept payment confirmation events before lead processing
		if (isChatwitPaymentConfirmation(rawPayload)) {
			const result = await processPaymentWebhook(rawPayload as ChatwitPaymentWebhookPayload);
			return NextResponse.json({ success: true, ...result }, { status: 200 });
		}

		// ⭐ Sanitizar payload bruto do Chatwit
		let payload: WebhookPayload;
		try {
			payload = sanitizeChatwitPayload(rawPayload);
		} catch (sanitizeErr: any) {
			// O Chatwit envia todos os eventos (mensagens do bot, atualizações de conversa, etc.)
			// Eventos sem account na raiz não são de lead — ignorar silenciosamente
			return NextResponse.json({ success: true, skipped: true }, { status: 200 });
		}

		// validações mínimas após sanitização
		if (!payload?.origemLead?.source_id) {
			return NextResponse.json({ success: false, error: "source_id ausente após sanitização" }, { status: 400 });
		}

		if (!payload?.usuario?.CHATWIT_ACCESS_TOKEN) {
			return NextResponse.json({ success: false, error: "CHATWIT_ACCESS_TOKEN ausente" }, { status: 400 });
		}

		if (WEBHOOK_DIRECT_PROCESSING) {
			// PROCESSAMENTO DIRETO (sem fila)
			const result = await processLeadDirectly(payload);

			return NextResponse.json(
				{
					success: true,
					processed: true,
					mode: "direct",
					leadId: result.leadId,
					arquivos: result.arquivos,
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
			concurrency: process.env.LEADS_CHATWIT_CONCURRENCY || "default",
		},
		{ status: 200 },
	);
}
