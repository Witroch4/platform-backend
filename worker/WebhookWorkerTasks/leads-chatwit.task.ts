import type { Job } from "bullmq";
import type { ILeadJobData } from "../../lib/queue/leads-chatwit.queue";
import { processChatwitLeadSync } from "../../lib/leads-chatwit/process-chatwit-lead-sync";

/**
 * Processa um job da fila "filaLeadsChatwit" usando a mesma lógica da rota HTTP.
 */
export async function processLeadChatwitTask(job: Job<ILeadJobData>) {
	const { payload } = job.data;
	const sourceId = payload.origemLead.source_id;
	const arquivos = payload.origemLead.arquivos || [];

	console.log(`[BullMQ-Individual] Job ${job.id} processando ${arquivos.length} arquivo(s) para lead ${sourceId}`);

	try {
		const result = await processChatwitLeadSync(payload);

		console.log(
			`[BullMQ-Individual] Job ${job.id} concluído para lead ${sourceId} com ${result.arquivos} arquivo(s)`,
		);

		return {
			status: "processado",
			jobId: job.id,
			sourceId,
			...result,
		};
	} catch (error) {
		console.error(`[BullMQ-Individual] Erro ao processar job ${job.id} para lead ${sourceId}:`, error);
		throw error;
	}
}
