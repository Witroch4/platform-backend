/**
 * Analysis Generation Task — Worker processor for oab-analysis queue
 *
 * Processa jobs de análise comparativa (Prova × Espelho) usando o agente
 * vinculado ao blueprint ANALISE_CELL.
 *
 * Feature flag: BLUEPRINT_ANALISE=true
 */

import { UnrecoverableError, type Job } from "bullmq";
import { getPrismaInstance } from "../../lib/connections";
import { runAnalysisAgent } from "../../lib/oab-eval/analysis-agent";
import type { AnalysisJobData, AnalysisJobResult } from "../../lib/oab-eval/analysis-queue";
import {
	clearLeadOperationCancel,
	createLeadOperationCancelMonitor,
	emitLeadOperationEvent,
	isLeadOperationCancelRequested,
	isLeadOperationCanceledError,
} from "../../lib/oab-eval/operation-control";
import { getLeadOperationLeadData } from "../../lib/oab-eval/operation-service";
import { createLogger } from "../../lib/utils/logger";

// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import("../../lib/sse-manager").then((m) => m.sseManager);
const log = createLogger("AnalysisWorker");

/**
 * Processor principal para jobs de análise comparativa (Prova × Espelho).
 * Chamado pelo BullMQ Worker quando um job é retirado da fila oab-analysis.
 */
export async function processAnalysisGenerationTask(
	job: Job<AnalysisJobData>,
	_token?: string,
	signal?: AbortSignal,
): Promise<AnalysisJobResult> {
	log.info("Iniciando processamento", {
		jobId: job.id,
		leadId: job.data.leadId,
		provider: job.data.selectedProvider || "OPENAI",
	});

	const startTime = Date.now();
	const jobId = String(job.id);
	const cancelMonitor = createLeadOperationCancelMonitor({
		leadId: job.data.leadId,
		stage: "analysis",
		jobId,
		upstreamSignal: signal,
	});

	try {
		const { leadId, textoProva, textoEspelho, selectedProvider } = job.data;

		// Callback de progresso
		const onProgress = async (message: string) => {
			const progress = message.includes("Carregando")
				? 10
				: message.includes("Analisando")
					? 40
					: message.includes("Processando")
						? 80
						: 50;

			await job.updateProgress(progress);
			log.info(`[${leadId}] ${message}`, { progress });
			await emitLeadOperationEvent({
				leadId,
				jobId,
				stage: "analysis",
				status: "processing",
				message,
				progress,
				queueState: "active",
			});
		};

		// Executar agente de análise
		log.info("Chamando agente de análise", { leadId, jobId });
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage: "analysis",
			status: "processing",
			message: "Processando análise.",
			progress: 5,
			queueState: "active",
		});

		const result = await runAnalysisAgent({
			leadId,
			textoProva,
			textoEspelho,
			selectedProvider,
			onProgress,
			abortSignal: cancelMonitor.signal,
		});

		await job.updateProgress(90);

		if (!result.success || !result.analysis) {
			const errorMsg = result.error || "Agente retornou resultado vazio";
			log.error("Análise falhou", { leadId, error: errorMsg });

			// Atualizar lead para remover flag de aguardando
			await updateLeadOnFailure(leadId, errorMsg);
			await clearLeadOperationCancel(jobId);
			await emitLeadOperationEvent({
				leadId,
				jobId,
				stage: "analysis",
				status: "failed",
				message: "Falha ao gerar análise.",
				error: errorMsg,
				queueState: "failed",
			});

			throw new Error(errorMsg);
		}

		const { analysis } = result;
		const elapsedMs = Date.now() - startTime;

		log.info("Análise gerada", {
			leadId,
			elapsedMs,
			pontosPeca: analysis.pontosPeca.length,
			pontosQuestoes: analysis.pontosQuestoes.length,
			provider: result.provider,
			model: result.model,
		});

		// Salvar resultado no banco via update direto (sem webhook intermediário)
		await job.updateProgress(95);
		await saveAnalysisResult(leadId, analysis);

		await job.updateProgress(100);
		await clearLeadOperationCancel(jobId);
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage: "analysis",
			status: "completed",
			message: "Análise concluída com sucesso.",
			progress: 100,
			queueState: "completed",
		});
		log.info("Job completado com sucesso", { jobId, leadId });

		return {
			leadId,
			success: true,
			processedAt: new Date().toISOString(),
		};
	} catch (error: any) {
		const elapsedMs = Date.now() - startTime;
		const userCanceled = isLeadOperationCanceledError(error) || (await isLeadOperationCancelRequested(jobId));

		if (userCanceled) {
			await getPrismaInstance().leadOabData.updateMany({
				where: { id: job.data.leadId },
				data: { aguardandoAnalise: false },
			});
			await clearLeadOperationCancel(jobId);
			await emitLeadOperationEvent({
				leadId: job.data.leadId,
				jobId,
				stage: "analysis",
				status: "canceled",
				message: "Análise cancelada pelo usuário.",
				queueState: "failed",
			});

			try {
				const sseManager = await getSseManager();
				await sseManager.sendNotification(job.data.leadId, {
					type: "leadUpdate",
					message: "A análise foi cancelada.",
					leadData: await getLeadOperationLeadData(job.data.leadId),
					timestamp: new Date().toISOString(),
				});
			} catch (sseError) {
				log.warn("Falha ao enviar leadUpdate após cancelamento", sseError as Error);
			}

			throw new UnrecoverableError("Análise cancelada pelo usuário.");
		}

		log.error("Erro no processamento", { jobId, leadId: job.data.leadId, elapsedMs }, error);

		// Tentar atualizar o lead para desmarcar aguardandoAnalise
		try {
			await updateLeadOnFailure(job.data.leadId, error.message || "Erro desconhecido");
			await clearLeadOperationCancel(jobId);
			await emitLeadOperationEvent({
				leadId: job.data.leadId,
				jobId,
				stage: "analysis",
				status: "failed",
				message: "Falha ao processar análise.",
				error: error.message || "Erro desconhecido",
				queueState: "failed",
			});
		} catch (updateErr) {
			log.error("Erro ao atualizar lead após falha", updateErr as Error);
		}

		throw error;
	} finally {
		await cancelMonitor.cleanup();
	}
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Salva a análise no banco e notifica o frontend via SSE.
 */
async function saveAnalysisResult(leadId: string, analysis: any): Promise<void> {
	const prisma = getPrismaInstance();

	log.info("Salvando resultado da análise", { leadId });

	// Verificar se o lead existe
	const leadExistente = await prisma.leadOabData.findUnique({
		where: { id: leadId },
	});

	if (!leadExistente) {
		throw new Error(`Lead não encontrado com ID: ${leadId}`);
	}

	// Salvar a análise como analisePreliminar (JSON structurado)
	const leadAtualizado = await prisma.leadOabData.update({
		where: { id: leadId },
		data: {
			analisePreliminar: analysis,
			analiseProcessada: true,
			aguardandoAnalise: false,
		},
	});

	// Atualizar Lead pai
	try {
		const parentLeadId = (leadExistente as any).leadId;
		if (parentLeadId) {
			await prisma.lead.update({
				where: { id: parentLeadId },
				data: { updatedAt: new Date() },
			});
		}
	} catch (e: any) {
		console.warn(
			`[AnalysisWorker] Não foi possível atualizar timestamp do Lead pai para ${leadId}: ${e?.message || e}`,
		);
	}

	log.info("Análise salva com sucesso", { leadId });

	// Enviar notificação SSE
	try {
		const sseManager = await getSseManager();
		const success = await sseManager.sendNotification(leadId, {
			type: "leadUpdate",
			message: "Sua pré-análise está pronta!",
			leadData: leadAtualizado,
			timestamp: new Date().toISOString(),
		});

		if (success) {
			log.info("Notificação SSE enviada", { leadId });
		} else {
			log.warn("Falha ao enviar SSE", { leadId });
		}
	} catch (sseErr) {
		log.error("Erro ao enviar SSE", sseErr as Error);
	}
}

/**
 * Atualiza lead em caso de falha, removendo flag de aguardando.
 */
async function updateLeadOnFailure(leadId: string, errorMessage: string): Promise<void> {
	const prisma = getPrismaInstance();

	try {
		const result = await prisma.leadOabData.updateMany({
			where: { id: leadId },
			data: {
				aguardandoAnalise: false,
			},
		});

		if (result.count === 0) {
			log.warn("Lead não encontrado ao limpar aguardandoAnalise", { leadId, errorMessage });
			return;
		}

		// Notificar erro via SSE
		const sseManager = await getSseManager();
		await sseManager.sendNotification(leadId, {
			type: "error",
			message: `Ocorreu um erro na análise: ${errorMessage.slice(0, 200)}`,
			timestamp: new Date().toISOString(),
		});
	} catch (e: any) {
		log.error("Erro ao atualizar lead on failure", e);
	}
}
