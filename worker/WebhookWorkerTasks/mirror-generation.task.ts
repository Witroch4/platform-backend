import type { Job } from "bullmq";
import { getPrismaInstance } from "../../lib/connections";
import { generateMirrorLocally } from "../../lib/oab-eval/mirror-generator-agent";
import type { MirrorGenerationJobData, MirrorGenerationJobResult } from "../../lib/oab-eval/mirror-queue";

// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import("../../lib/sse-manager").then((m) => m.sseManager);

/**
 * Processor para jobs de geração de espelho local
 */
export async function processMirrorGenerationTask(
	job: Job<MirrorGenerationJobData>,
): Promise<MirrorGenerationJobResult> {
	console.log(`[MirrorWorker] 🔄 Iniciando processamento do job ${job.id}`);
	console.log(`[MirrorWorker] 📋 Lead: ${job.data.leadId}, Especialidade: ${job.data.especialidade}`);

	const startTime = Date.now();

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
			console.log(`[MirrorWorker] [${leadId}] ${message} (${progress}%)`);
		};

		// Executar agente de geração de espelho
		console.log(`[MirrorWorker] 🤖 Chamando agente local para lead ${leadId}...`);
		console.log(`[MirrorWorker] 🎛️ Provider selecionado: ${selectedProvider || "GEMINI (padrão)"}`);
		if (espelhoPadraoId) {
			console.log(`[MirrorWorker] 📋 Usando espelho padrão: ${espelhoPadraoId}`);
		}

		const result = await generateMirrorLocally({
			leadId,
			especialidade,
			espelhoPadraoId,
			images,
			telefone,
			nome,
			onProgress,
			selectedProvider, // ⭐ NOVO: Passa o provider selecionado pelo usuário
		});

		await job.updateProgress(95);

		const { markdownMirror, jsonMirror, structuredMirror } = result;

		const elapsedMs = Date.now() - startTime;
		console.log(`[MirrorWorker] ✅ Espelho gerado com sucesso em ${(elapsedMs / 1000).toFixed(1)}s`);
		console.log(
			`[MirrorWorker] 📊 Aluno: ${structuredMirror.meta.aluno}, Nota: ${structuredMirror.totais.final.toFixed(2)}`,
		);

		// Salvar resultado direto no banco e notificar via SSE (sem webhook intermediário)
		await job.updateProgress(98);
		await saveMirrorResult(leadId, markdownMirror, jsonMirror);

		await job.updateProgress(100);

		console.log(`[MirrorWorker] ✅ Job ${job.id} completado com sucesso`);

		return {
			leadId,
			success: true,
			markdownMirror,
			jsonMirror,
			processedAt: new Date().toISOString(),
		};
	} catch (error: any) {
		const elapsedMs = Date.now() - startTime;
		console.error(`[MirrorWorker] ❌ Erro após ${(elapsedMs / 1000).toFixed(1)}s:`, error);

		// Atualizar lead com status de erro e notificar via SSE
		try {
			await updateLeadOnMirrorFailure(job.data.leadId, error.message || "Erro desconhecido ao gerar espelho");
		} catch (updateErr) {
			console.error("[MirrorWorker] ❌ Erro ao atualizar lead após falha:", updateErr);
		}

		// Re-lançar erro para que BullMQ possa fazer retry
		throw error;
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

	console.log(`[MirrorWorker] 💾 Salvando resultado do espelho para lead ${leadId}`);

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
		console.log(`[MirrorWorker] 📝 jsonMirror convertido para string (${textoDOEspelho.length} bytes)`);
	} else if (markdownMirror) {
		textoDOEspelho = markdownMirror;
		console.log(`[MirrorWorker] 📝 Usando markdownMirror como fallback (${markdownMirror.length} bytes)`);
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

	console.log(`[MirrorWorker] ✅ Espelho salvo com sucesso para lead ${leadId}`);

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
			console.log(`[MirrorWorker] ✅ Notificação SSE enviada para lead ${leadId}`);
		} else {
			console.warn(`[MirrorWorker] ⚠️ Falha ao enviar SSE para lead ${leadId}`);
		}
	} catch (sseErr) {
		console.error(`[MirrorWorker] ❌ Erro ao enviar SSE:`, sseErr);
	}
}

/**
 * Atualiza lead em caso de falha, removendo flag de aguardando.
 */
async function updateLeadOnMirrorFailure(leadId: string, errorMessage: string): Promise<void> {
	const prisma = getPrismaInstance();

	try {
		await prisma.leadOabData.update({
			where: { id: leadId },
			data: {
				espelhoProcessado: false,
				aguardandoEspelho: false,
			},
		});

		// Notificar erro via SSE
		const sseManager = await getSseManager();
		await sseManager.sendNotification(leadId, {
			type: "mirrorError",
			message: `Erro ao gerar espelho: ${errorMessage.slice(0, 200)}`,
			leadId,
			timestamp: new Date().toISOString(),
		});
	} catch (e: any) {
		console.error(`[MirrorWorker] ❌ Erro ao atualizar lead on failure:`, e);
	}
}
