/**
 * Flow Campaign Task Processor
 *
 * Processa jobs da fila flow-campaign para disparos em massa.
 * Três tipos de job: EXECUTE_CONTACT, PROCESS_BATCH, CAMPAIGN_CONTROL.
 *
 * @see docs/proximo-passo-flow-campaign.md
 * @see lib/queue/flow-campaign-queue.ts
 * @see lib/queue/campaign-orchestrator.ts
 */

import type { Job } from "bullmq";
import log from "@/lib/log";
import { getPrismaInstance } from "@/lib/connections";
import type {
	CampaignJobData,
	CampaignJobResult,
	ExecuteContactJobData,
	ProcessBatchJobData,
	CampaignControlJobData,
} from "@/lib/queue/flow-campaign-queue";
import { pauseCampaignJobs, cancelCampaignJobs } from "@/lib/queue/flow-campaign-queue";
import { processBatch, checkCampaignCompletion } from "@/lib/queue/campaign-orchestrator";
import { FlowOrchestrator } from "@/services/flow-engine/flow-orchestrator";
import { ChatwitConversationResolver } from "@/services/flow-engine/chatwit-conversation-resolver";
import { getChatwitSystemConfig } from "@/lib/chatwit/system-config";
import type { DeliveryContext } from "@/types/flow-engine";

// =============================================================================
// MAIN TASK PROCESSOR
// =============================================================================

export async function processFlowCampaignTask(job: Job<CampaignJobData>): Promise<CampaignJobResult> {
	const startTime = Date.now();
	const { jobType, campaignId } = job.data;

	log.info("[FlowCampaignQueue] Processando job", {
		jobId: job.id,
		jobType,
		campaignId,
		attempt: job.attemptsMade + 1,
	});

	try {
		switch (jobType) {
			case "EXECUTE_CONTACT":
				return await handleExecuteContact(job as Job<ExecuteContactJobData>, startTime);

			case "PROCESS_BATCH":
				return await handleProcessBatch(job as Job<ProcessBatchJobData>, startTime);

			case "CAMPAIGN_CONTROL":
				return await handleCampaignControl(job as Job<CampaignControlJobData>, startTime);

			default:
				throw new Error(`Tipo de job desconhecido: ${jobType}`);
		}
	} catch (error) {
		const processingTimeMs = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowCampaignQueue] Erro ao processar job", {
			jobId: job.id,
			jobType,
			campaignId,
			error: errorMessage,
			processingTimeMs,
			attempts: job.attemptsMade + 1,
			maxAttempts: job.opts.attempts || 3,
		});

		// Se é a última tentativa, marcar contato como FAILED (para EXECUTE_CONTACT)
		const maxAttempts = job.opts.attempts || 3;
		const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

		if (isLastAttempt && jobType === "EXECUTE_CONTACT") {
			const contactData = job.data as ExecuteContactJobData;
			try {
				const prisma = getPrismaInstance();
				await prisma.flowCampaignContact.update({
					where: { id: contactData.contactId },
					data: {
						status: "FAILED",
						errorMessage: errorMessage.substring(0, 500),
						retryCount: job.attemptsMade + 1,
					},
				});
				await prisma.flowCampaign.update({
					where: { id: campaignId },
					data: { failedCount: { increment: 1 } },
				});
				await checkCampaignCompletion(campaignId);
			} catch (updateError) {
				log.error("[FlowCampaignQueue] Erro ao marcar contato como FAILED", {
					contactId: contactData.contactId,
					error: updateError instanceof Error ? updateError.message : String(updateError),
				});
			}

			return {
				success: false,
				jobType,
				campaignId,
				contactId: contactData.contactId,
				error: errorMessage,
				processingTimeMs,
			};
		}

		// Re-throw para BullMQ fazer retry
		throw error;
	}
}

// =============================================================================
// EXECUTE_CONTACT HANDLER
// =============================================================================

async function handleExecuteContact(
	job: Job<ExecuteContactJobData>,
	startTime: number,
): Promise<CampaignJobResult> {
	const { campaignId, contactId, contactPhone, contactName, flowId, inboxId } = job.data;
	const prisma = getPrismaInstance();

	log.info("[FlowCampaignQueue:ExecuteContact] Executando flow para contato", {
		jobId: job.id,
		campaignId,
		contactId,
		contactPhone,
		flowId,
	});

	// Buscar dados da inbox para construir DeliveryContext
	const inbox = await prisma.chatwitInbox.findUnique({
		where: { id: inboxId },
		select: {
			id: true,
			inboxId: true,
			channelType: true,
			usuarioChatwit: {
				select: {
					chatwitAccountId: true,
					chatwitAccessToken: true,
				},
			},
		},
	});

	if (!inbox?.usuarioChatwit) {
		throw new Error(`Inbox ${inboxId} não encontrada ou sem conta associada`);
	}

	// Bot token + base URL do sistema (persistido pelo init do Chatwit, fallback ENV)
	const chatwitConfig = await getChatwitSystemConfig();

	if (!contactPhone) {
		// Marcar como SKIPPED
		await prisma.flowCampaignContact.update({
			where: { id: contactId },
			data: {
				status: "SKIPPED",
				errorMessage: "Contato sem telefone",
			},
		});
		await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: { skippedCount: { increment: 1 } },
		});
		await checkCampaignCompletion(campaignId);

		return {
			success: true,
			jobType: "EXECUTE_CONTACT",
			campaignId,
			contactId,
			processingTimeMs: Date.now() - startTime,
		};
	}

	// Resolver contato + conversa no Chatwit (pode ser contato novo)
	// Usa bot token global (do sistema) para resolver contato/conversa
	const resolver = new ChatwitConversationResolver(chatwitConfig.baseUrl, chatwitConfig.botToken);
	const resolved = await resolver.resolve(
		Number(inbox.usuarioChatwit.chatwitAccountId),
		Number(inbox.inboxId),
		contactPhone,
		contactName || undefined,
	);

	log.info("[FlowCampaignQueue:ExecuteContact] Conversa resolvida no Chatwit", {
		contactId: resolved.contactId,
		conversationId: resolved.conversationId,
		displayId: resolved.displayId,
		contactPhone,
	});

	// Construir DeliveryContext com conversa real
	const channel = (inbox.channelType || "").toLowerCase();
	const deliveryContext: DeliveryContext = {
		accountId: Number(inbox.usuarioChatwit.chatwitAccountId),
		conversationId: resolved.conversationId,
		inboxId: Number(inbox.inboxId),
		contactId: resolved.contactId,
		contactName: contactName || "",
		contactPhone,
		channelType: channel.includes("instagram") ? "instagram" : channel.includes("facebook") ? "facebook" : "whatsapp",
		prismaInboxId: inbox.id,
		chatwitAccessToken: chatwitConfig.botToken,
		chatwitBaseUrl: chatwitConfig.baseUrl,
		conversationDisplayId: resolved.displayId,
	};

	// Executar flow
	const orchestrator = new FlowOrchestrator();
	const result = await orchestrator.executeFlowById(flowId, deliveryContext, { forceAsync: true });

	const processingTimeMs = Date.now() - startTime;

	if (result.error) {
		throw new Error(result.error);
	}

	// Marcar contato como SENT
	await prisma.flowCampaignContact.update({
		where: { id: contactId },
		data: {
			status: "SENT",
			sentAt: new Date(),
			retryCount: job.attemptsMade,
		},
	});
	await prisma.flowCampaign.update({
		where: { id: campaignId },
		data: { sentCount: { increment: 1 } },
	});

	// Verificar se campanha completou
	await checkCampaignCompletion(campaignId);

	log.info("[FlowCampaignQueue:ExecuteContact] Contato processado com sucesso", {
		jobId: job.id,
		contactId,
		contactPhone,
		processingTimeMs,
	});

	return {
		success: true,
		jobType: "EXECUTE_CONTACT",
		campaignId,
		contactId,
		processingTimeMs,
	};
}

// =============================================================================
// PROCESS_BATCH HANDLER
// =============================================================================

async function handleProcessBatch(
	job: Job<ProcessBatchJobData>,
	startTime: number,
): Promise<CampaignJobResult> {
	const { campaignId, batchIndex, contactIds, flowId, inboxId } = job.data;

	log.info("[FlowCampaignQueue:ProcessBatch] Processando batch", {
		jobId: job.id,
		campaignId,
		batchIndex,
		contactCount: contactIds.length,
	});

	const result = await processBatch(campaignId, contactIds, flowId, inboxId);

	log.info("[FlowCampaignQueue:ProcessBatch] Batch processado", {
		jobId: job.id,
		campaignId,
		batchIndex,
		success: result.success,
		failed: result.failed,
	});

	return {
		success: true,
		jobType: "PROCESS_BATCH",
		campaignId,
		processingTimeMs: Date.now() - startTime,
	};
}

// =============================================================================
// CAMPAIGN_CONTROL HANDLER
// =============================================================================

async function handleCampaignControl(
	job: Job<CampaignControlJobData>,
	startTime: number,
): Promise<CampaignJobResult> {
	const { campaignId, action, reason } = job.data;

	log.info("[FlowCampaignQueue:Control] Executando ação de controle", {
		jobId: job.id,
		campaignId,
		action,
		reason,
	});

	switch (action) {
		case "pause":
			await pauseCampaignJobs(campaignId);
			break;

		case "cancel":
			await cancelCampaignJobs(campaignId);
			break;

		case "resume":
			// Resume é tratado no orchestrator (move jobs de delayed para waiting)
			// Aqui só logamos
			log.info("[FlowCampaignQueue:Control] Resume processado pelo orchestrator", { campaignId });
			break;

		case "complete":
			await checkCampaignCompletion(campaignId);
			break;

		default:
			throw new Error(`Ação de controle desconhecida: ${action}`);
	}

	return {
		success: true,
		jobType: "CAMPAIGN_CONTROL",
		campaignId,
		processingTimeMs: Date.now() - startTime,
	};
}
