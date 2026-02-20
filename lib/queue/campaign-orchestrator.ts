/**
 * Campaign Orchestrator — Orquestrador de campanhas de disparo em massa
 *
 * Responsabilidades:
 * - Start/Pause/Resume/Cancel campanhas
 * - Chunking de contatos em batches
 * - Rate limiting por canal
 * - Progress tracking
 * - Backpressure handling
 *
 * @see docs/flow-builder-queue.md
 */

import { getPrismaInstance } from "@/lib/connections";
import log from "@/lib/log";
import {
	addExecuteContactJob,
	addProcessBatchJob,
	addCampaignControlJob,
	getCampaignQueueMetrics,
	cancelCampaignJobs,
	CHANNEL_RATE_LIMITS,
} from "./flow-campaign-queue";
import { getQueueMetrics as getFlowBuilderQueueMetrics } from "./flow-builder-queues";

// =============================================================================
// CONSTANTS
// =============================================================================

const BATCH_SIZE = 50; // Contatos por batch
const BACKPRESSURE_THRESHOLD = 1000; // Pausa campanha se fila principal > N

// =============================================================================
// TYPES
// =============================================================================

export interface CampaignProgress {
	campaignId: string;
	status: string;
	totalContacts: number;
	sentCount: number;
	failedCount: number;
	skippedCount: number;
	pendingCount: number;
	progressPercent: number;
	estimatedTimeRemaining?: number; // em segundos
}

export interface StartCampaignOptions {
	campaignId: string;
	dryRun?: boolean; // Apenas valida, não enfileira
}

export interface StartCampaignResult {
	success: boolean;
	campaignId: string;
	totalContacts: number;
	batchesCreated: number;
	error?: string;
}

// =============================================================================
// CAMPAIGN ORCHESTRATOR
// =============================================================================

/**
 * Inicia uma campanha, enfileirando todos os contatos em batches.
 */
export async function startCampaign(options: StartCampaignOptions): Promise<StartCampaignResult> {
	const { campaignId, dryRun = false } = options;
	const prisma = getPrismaInstance();

	log.info("[CampaignOrchestrator] Iniciando campanha", { campaignId, dryRun });

	try {
		// 1. Buscar campanha
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			include: {
				flow: { select: { id: true, isActive: true } },
				contacts: {
					where: { status: "PENDING" },
					select: { id: true, contactId: true, contactPhone: true, contactName: true, variables: true },
				},
			},
		});

		if (!campaign) {
			return { success: false, campaignId, totalContacts: 0, batchesCreated: 0, error: "Campanha não encontrada" };
		}

		if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
			return { success: false, campaignId, totalContacts: 0, batchesCreated: 0, error: `Campanha em status inválido: ${campaign.status}` };
		}

		if (!campaign.flow.isActive) {
			return { success: false, campaignId, totalContacts: 0, batchesCreated: 0, error: "Flow não está ativo" };
		}

		// 2. Verificar backpressure
		const flowBuilderMetrics = await getFlowBuilderQueueMetrics();
		if (flowBuilderMetrics.waiting > BACKPRESSURE_THRESHOLD) {
			return { success: false, campaignId, totalContacts: 0, batchesCreated: 0, error: `Backpressure: fila principal tem ${flowBuilderMetrics.waiting} jobs` };
		}

		const totalContacts = campaign.contacts.length;
		if (totalContacts === 0) {
			return { success: false, campaignId, totalContacts: 0, batchesCreated: 0, error: "Nenhum contato pendente" };
		}

		if (dryRun) {
			const batchesNeeded = Math.ceil(totalContacts / BATCH_SIZE);
			return { success: true, campaignId, totalContacts, batchesCreated: batchesNeeded };
		}

		// 3. Atualizar status para RUNNING
		await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: {
				status: "RUNNING",
				startedAt: new Date(),
				totalContacts,
			},
		});

		// 4. Criar batches e enfileirar
		const batches: string[][] = [];
		for (let i = 0; i < totalContacts; i += BATCH_SIZE) {
			const batchContactIds = campaign.contacts
				.slice(i, i + BATCH_SIZE)
				.map(c => c.id);
			batches.push(batchContactIds);
		}

		// Enfileirar batches com delay escalonado para rate limiting
		const rateLimit = campaign.rateLimit || CHANNEL_RATE_LIMITS.default.perMinute;
		const delayBetweenBatches = (BATCH_SIZE / rateLimit) * 60 * 1000; // ms

		for (let i = 0; i < batches.length; i++) {
			await addProcessBatchJob({
				campaignId,
				batchIndex: i,
				contactIds: batches[i],
				flowId: campaign.flowId,
				inboxId: campaign.inboxId,
			});
		}

		log.info("[CampaignOrchestrator] Campanha iniciada", {
			campaignId,
			totalContacts,
			batchesCreated: batches.length,
		});

		return {
			success: true,
			campaignId,
			totalContacts,
			batchesCreated: batches.length,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error("[CampaignOrchestrator] Erro ao iniciar campanha", { campaignId, error: errorMessage });
		return { success: false, campaignId, totalContacts: 0, batchesCreated: 0, error: errorMessage };
	}
}

/**
 * Pausa uma campanha em execução.
 */
export async function pauseCampaign(campaignId: string, reason?: string): Promise<boolean> {
	const prisma = getPrismaInstance();

	try {
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});

		if (!campaign || campaign.status !== "RUNNING") {
			log.warn("[CampaignOrchestrator] Campanha não pode ser pausada", { campaignId, status: campaign?.status });
			return false;
		}

		// Adicionar job de controle para pausar
		await addCampaignControlJob({ campaignId, action: "pause", reason });

		// Atualizar status
		await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: {
				status: "PAUSED",
				pausedAt: new Date(),
			},
		});

		log.info("[CampaignOrchestrator] Campanha pausada", { campaignId, reason });
		return true;
	} catch (error) {
		log.error("[CampaignOrchestrator] Erro ao pausar campanha", { campaignId, error });
		return false;
	}
}

/**
 * Retoma uma campanha pausada.
 */
export async function resumeCampaign(campaignId: string): Promise<boolean> {
	const prisma = getPrismaInstance();

	try {
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});

		if (!campaign || campaign.status !== "PAUSED") {
			log.warn("[CampaignOrchestrator] Campanha não pode ser retomada", { campaignId, status: campaign?.status });
			return false;
		}

		// Adicionar job de controle para retomar
		await addCampaignControlJob({ campaignId, action: "resume" });

		// Atualizar status
		await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: {
				status: "RUNNING",
				pausedAt: null,
			},
		});

		log.info("[CampaignOrchestrator] Campanha retomada", { campaignId });
		return true;
	} catch (error) {
		log.error("[CampaignOrchestrator] Erro ao retomar campanha", { campaignId, error });
		return false;
	}
}

/**
 * Cancela uma campanha.
 */
export async function cancelCampaign(campaignId: string, reason?: string): Promise<boolean> {
	const prisma = getPrismaInstance();

	try {
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: { status: true },
		});

		if (!campaign || campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
			log.warn("[CampaignOrchestrator] Campanha não pode ser cancelada", { campaignId, status: campaign?.status });
			return false;
		}

		// Cancelar jobs pendentes
		const cancelledJobs = await cancelCampaignJobs(campaignId);

		// Adicionar job de controle
		await addCampaignControlJob({ campaignId, action: "cancel", reason });

		// Atualizar status
		await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: {
				status: "CANCELLED",
				completedAt: new Date(),
			},
		});

		// Marcar contatos pendentes como SKIPPED
		await prisma.flowCampaignContact.updateMany({
			where: {
				campaignId,
				status: { in: ["PENDING", "QUEUED"] },
			},
			data: {
				status: "SKIPPED",
				errorMessage: reason || "Campanha cancelada",
			},
		});

		log.info("[CampaignOrchestrator] Campanha cancelada", { campaignId, cancelledJobs, reason });
		return true;
	} catch (error) {
		log.error("[CampaignOrchestrator] Erro ao cancelar campanha", { campaignId, error });
		return false;
	}
}

/**
 * Obtém o progresso de uma campanha.
 */
export async function getCampaignProgress(campaignId: string): Promise<CampaignProgress | null> {
	const prisma = getPrismaInstance();

	try {
		const campaign = await prisma.flowCampaign.findUnique({
			where: { id: campaignId },
			select: {
				id: true,
				status: true,
				totalContacts: true,
				sentCount: true,
				failedCount: true,
				skippedCount: true,
				rateLimit: true,
				startedAt: true,
			},
		});

		if (!campaign) return null;

		const pendingCount = campaign.totalContacts - campaign.sentCount - campaign.failedCount - campaign.skippedCount;
		const progressPercent = campaign.totalContacts > 0
			? Math.round(((campaign.sentCount + campaign.failedCount + campaign.skippedCount) / campaign.totalContacts) * 100)
			: 0;

		// Estimar tempo restante
		let estimatedTimeRemaining: number | undefined;
		if (campaign.status === "RUNNING" && campaign.startedAt && pendingCount > 0) {
			const elapsedMs = Date.now() - campaign.startedAt.getTime();
			const processed = campaign.sentCount + campaign.failedCount;
			if (processed > 0) {
				const avgTimePerContact = elapsedMs / processed;
				estimatedTimeRemaining = Math.round((avgTimePerContact * pendingCount) / 1000);
			}
		}

		return {
			campaignId: campaign.id,
			status: campaign.status,
			totalContacts: campaign.totalContacts,
			sentCount: campaign.sentCount,
			failedCount: campaign.failedCount,
			skippedCount: campaign.skippedCount,
			pendingCount,
			progressPercent,
			estimatedTimeRemaining,
		};
	} catch (error) {
		log.error("[CampaignOrchestrator] Erro ao obter progresso", { campaignId, error });
		return null;
	}
}

/**
 * Processa um batch de contatos.
 * Enfileira jobs individuais para cada contato.
 */
export async function processBatch(
	campaignId: string,
	contactIds: string[],
	flowId: string,
	inboxId: string,
): Promise<{ success: number; failed: number }> {
	const prisma = getPrismaInstance();
	let success = 0;
	let failed = 0;

	for (const contactDbId of contactIds) {
		try {
			const contact = await prisma.flowCampaignContact.findUnique({
				where: { id: contactDbId },
				select: {
					contactId: true,
					contactPhone: true,
					contactName: true,
					variables: true,
					campaign: {
						select: { variables: true },
					},
				},
			});

			if (!contact) {
				failed++;
				continue;
			}

			// Marcar como QUEUED
			await prisma.flowCampaignContact.update({
				where: { id: contactDbId },
				data: { status: "QUEUED" },
			});

			// Enfileirar execução do flow
			await addExecuteContactJob({
				campaignId,
				contactId: contactDbId,
				contactPhone: contact.contactPhone || undefined,
				contactName: contact.contactName || undefined,
				flowId,
				inboxId,
				variables: {
					...(contact.campaign.variables as Record<string, unknown> || {}),
					...(contact.variables as Record<string, unknown> || {}),
				},
				context: {},
			});

			success++;
		} catch (error) {
			log.error("[CampaignOrchestrator] Erro ao processar contato", { contactDbId, error });
			failed++;
		}
	}

	return { success, failed };
}

/**
 * Completa uma campanha após todos os contatos serem processados.
 */
export async function completeCampaign(campaignId: string): Promise<void> {
	const prisma = getPrismaInstance();

	try {
		// Calcular totais finais
		const counts = await prisma.flowCampaignContact.groupBy({
			by: ["status"],
			where: { campaignId },
			_count: true,
		});

		const sentCount = counts.find(c => c.status === "SENT")?._count || 0;
		const failedCount = counts.find(c => c.status === "FAILED")?._count || 0;
		const skippedCount = counts.find(c => c.status === "SKIPPED")?._count || 0;

		await prisma.flowCampaign.update({
			where: { id: campaignId },
			data: {
				status: "COMPLETED",
				completedAt: new Date(),
				sentCount,
				failedCount,
				skippedCount,
			},
		});

		log.info("[CampaignOrchestrator] Campanha completada", {
			campaignId,
			sentCount,
			failedCount,
			skippedCount,
		});
	} catch (error) {
		log.error("[CampaignOrchestrator] Erro ao completar campanha", { campaignId, error });
	}
}

/**
 * Verifica e atualiza status de campanhas com base nos contatos processados.
 */
export async function checkCampaignCompletion(campaignId: string): Promise<boolean> {
	const prisma = getPrismaInstance();

	const pendingCount = await prisma.flowCampaignContact.count({
		where: {
			campaignId,
			status: { in: ["PENDING", "QUEUED"] },
		},
	});

	if (pendingCount === 0) {
		await completeCampaign(campaignId);
		return true;
	}

	return false;
}
