import { UnrecoverableError, type Job } from "bullmq";
import { getPrismaInstance } from "../../lib/connections";
import { generateMirrorLocally } from "../../lib/oab-eval/mirror-generator-agent";
import type { MirrorGenerationJobData, MirrorGenerationJobResult } from "../../lib/oab-eval/mirror-queue";
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
const log = createLogger("MirrorWorker");

/**
 * Processor para jobs de geração de espelho local
 */
export async function processMirrorGenerationTask(
	job: Job<MirrorGenerationJobData>,
	_token?: string,
	signal?: AbortSignal,
): Promise<MirrorGenerationJobResult> {
	log.info("Iniciando processamento", {
		jobId: job.id,
		leadId: job.data.leadId,
		especialidade: job.data.especialidade,
	});

	const startTime = Date.now();
	const jobId = String(job.id);
	const cancelMonitor = createLeadOperationCancelMonitor({
		leadId: job.data.leadId,
		stage: "mirror",
		jobId,
		upstreamSignal: signal,
	});

	try {
		const { leadId, especialidade, espelhoPadraoId, images, nome, telefone, selectedProvider } = job.data;

		// Callback de progresso que atualiza o job
		const onProgress = async (message: string) => {
			const progress = message.includes("Carregando rubrica")
				? 10
				: message.includes("Preparando imagens")
					? 30
					: message.includes("Extraindo dados")
						? 60
						: message.includes("Construindo espelho")
							? 80
							: message.includes("Formatando")
								? 90
								: 50;

			await job.updateProgress(progress);
			log.info(`[${leadId}] ${message}`, { progress });
			await emitLeadOperationEvent({
				leadId,
				jobId,
				stage: "mirror",
				status: "processing",
				message,
				progress,
				queueState: "active",
			});
		};

		// Executar agente de geração de espelho
		log.info("Chamando agente local", {
			leadId,
			provider: selectedProvider || "GEMINI",
			jobId,
		});
		if (espelhoPadraoId) {
			log.info("Usando espelho padrão", { leadId, espelhoPadraoId });
		}
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage: "mirror",
			status: "processing",
			message: "Processando espelho.",
			progress: 5,
			queueState: "active",
		});

		const result = await generateMirrorLocally({
			leadId,
			especialidade,
			espelhoPadraoId,
			images,
			telefone,
			nome,
			onProgress,
			selectedProvider, // ⭐ NOVO: Passa o provider selecionado pelo usuário
			abortSignal: cancelMonitor.signal,
		});

		await job.updateProgress(95);

		const { markdownMirror, jsonMirror, structuredMirror } = result;

		const elapsedMs = Date.now() - startTime;
		log.info("Espelho gerado com sucesso", {
			leadId,
			elapsedMs,
			aluno: structuredMirror.meta.aluno,
			notaFinal: structuredMirror.totais.final,
		});

		// Salvar resultado direto no banco e notificar via SSE (sem webhook intermediário)
		await job.updateProgress(98);
		await saveMirrorResult(leadId, markdownMirror, jsonMirror);

		await job.updateProgress(100);

		await clearLeadOperationCancel(jobId);
		await emitLeadOperationEvent({
			leadId,
			jobId,
			stage: "mirror",
			status: "completed",
			message: "Espelho concluído com sucesso.",
			progress: 100,
			queueState: "completed",
		});
		log.info("Job completado com sucesso", { jobId, leadId });

		return {
			leadId,
			success: true,
			markdownMirror,
			jsonMirror,
			processedAt: new Date().toISOString(),
		};
	} catch (error: any) {
		const elapsedMs = Date.now() - startTime;
		const userCanceled = isLeadOperationCanceledError(error) || (await isLeadOperationCancelRequested(jobId));

		if (userCanceled) {
			await getPrismaInstance().leadOabData.updateMany({
				where: { id: job.data.leadId },
				data: {
					aguardandoEspelho: false,
				},
			});
			await clearLeadOperationCancel(jobId);
			await emitLeadOperationEvent({
				leadId: job.data.leadId,
				jobId,
				stage: "mirror",
				status: "canceled",
				message: "Espelho cancelado pelo usuário.",
				queueState: "failed",
			});

			try {
				const sseManager = await getSseManager();
				await sseManager.sendNotification(job.data.leadId, {
					type: "leadUpdate",
					message: "A geração do espelho foi cancelada.",
					leadData: await getLeadOperationLeadData(job.data.leadId),
					timestamp: new Date().toISOString(),
				});
			} catch (sseError) {
				log.warn("Falha ao enviar leadUpdate após cancelamento", sseError as Error);
			}

			throw new UnrecoverableError("Espelho cancelado pelo usuário.");
		}

		log.error("Erro no processamento", { jobId, leadId: job.data.leadId, elapsedMs }, error);

		// Atualizar lead com status de erro e notificar via SSE
		try {
			await updateLeadOnMirrorFailure(job.data.leadId, error.message || "Erro desconhecido ao gerar espelho");
			await clearLeadOperationCancel(jobId);
			await emitLeadOperationEvent({
				leadId: job.data.leadId,
				jobId,
				stage: "mirror",
				status: "failed",
				message: "Falha ao processar espelho.",
				error: error.message || "Erro desconhecido ao gerar espelho",
				queueState: "failed",
			});
		} catch (updateErr) {
			log.error("Erro ao atualizar lead após falha", updateErr as Error);
		}

		// Re-lançar erro para que BullMQ possa fazer retry
		throw error;
	} finally {
		await cancelMonitor.cleanup();
	}
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Salva o espelho no banco e notifica o frontend via SSE.
 * Padrão idêntico ao analysis-generation.task.ts.
 */
async function saveMirrorResult(leadId: string, markdownMirror: string, jsonMirror: any): Promise<void> {
	const prisma = getPrismaInstance();

	log.info("Salvando resultado do espelho", { leadId });

	// Verificar se o lead existe
	const leadExistente = await prisma.leadOabData.findUnique({
		where: { id: leadId },
	});

	if (!leadExistente) {
		throw new Error(`Lead não encontrado com ID: ${leadId}`);
	}

	// Converter jsonMirror para string JSON para armazenamento
	let textoDOEspelho: string | null = null;

	if (jsonMirror) {
		textoDOEspelho = typeof jsonMirror === "string" ? jsonMirror : JSON.stringify(jsonMirror);
		log.info("jsonMirror convertido para string", { leadId, bytes: textoDOEspelho.length });
	} else if (markdownMirror) {
		textoDOEspelho = markdownMirror;
		log.info("Usando markdownMirror como fallback", { leadId, bytes: markdownMirror.length });
	}

	// Atualizar lead com espelho processado
	await prisma.leadOabData.update({
		where: { id: leadId },
		data: {
			textoDOEspelho: textoDOEspelho ?? undefined,
			espelhoProcessado: true,
			aguardandoEspelho: false,
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
			`[MirrorWorker] Não foi possível atualizar timestamp do Lead pai para ${leadId}: ${e?.message || e}`,
		);
	}

	log.info("Espelho salvo com sucesso", { leadId });

	// Buscar dados atualizados para notificação SSE (omitindo campos pesados)
	const leadData = await prisma.leadOabData.findUnique({
		where: { id: leadId },
		select: {
			id: true,
			nomeReal: true,
			concluido: true,
			manuscritoProcessado: true,
			aguardandoManuscrito: true,
			espelhoProcessado: true,
			aguardandoEspelho: true,
			analiseProcessada: true,
			aguardandoAnalise: true,
			analiseValidada: true,
			situacao: true,
			notaFinal: true,
			textoDOEspelho: true,
			provaManuscrita: true,
			imagensConvertidas: true,
		},
	});

	// Enviar notificação SSE
	try {
		const sseManager = await getSseManager();
		const success = await sseManager.sendNotification(leadId, {
			type: "leadUpdate",
			message: "Seu espelho de correção foi processado com sucesso!",
			leadData: {
				...leadData,
				provaManuscrita: leadData?.provaManuscrita ? "[Omitido - manuscrito presente]" : null,
				textoDOEspelho: leadData?.textoDOEspelho ? "[Omitido - espelho presente]" : null,
				imagensConvertidas: Array.isArray(leadData?.imagensConvertidas)
					? `[${(leadData.imagensConvertidas as any[]).length} imagens]`
					: null,
			},
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
async function updateLeadOnMirrorFailure(leadId: string, errorMessage: string): Promise<void> {
	const prisma = getPrismaInstance();

	try {
		const result = await prisma.leadOabData.updateMany({
			where: { id: leadId },
			data: {
				espelhoProcessado: false,
				aguardandoEspelho: false,
			},
		});

		if (result.count === 0) {
			log.warn("Lead não encontrado ao limpar aguardandoEspelho", { leadId, errorMessage });
			return;
		}

		// Notificar erro via SSE
		const sseManager = await getSseManager();
		await sseManager.sendNotification(leadId, {
			type: "mirrorError",
			message: `Erro ao gerar espelho: ${errorMessage.slice(0, 200)}`,
			leadId,
			timestamp: new Date().toISOString(),
		});
		await sseManager.sendNotification(leadId, {
			type: "leadUpdate",
			message: "A geração do espelho falhou e o processamento foi encerrado.",
			leadData: await getLeadOperationLeadData(leadId),
			timestamp: new Date().toISOString(),
		});
	} catch (e: any) {
		log.error("Erro ao atualizar lead on failure", e);
	}
}
