import type { Job } from "bullmq";
import { getPrismaInstance } from "@/lib/connections";
import { analysisQueue, type AnalysisJobData, type AnalysisJobResult } from "./analysis-queue";
import { mirrorGenerationQueue, type MirrorGenerationJobData, type MirrorGenerationJobResult } from "./mirror-queue";
import { transcriptionQueue, type TranscriptionJobData, type TranscriptionResult } from "./transcription-queue";
import { buildLeadOperationJobId, type LeadOperationStage, type LeadOperationStatus } from "./operation-types";

const prisma = getPrismaInstance();

const leadOperationSelect = {
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
	provaManuscrita: true,
	textoDOEspelho: true,
	analisePreliminar: true,
	imagensConvertidas: true,
} as const;

export type LeadOperationLeadData = Awaited<ReturnType<typeof getLeadOperationLeadData>>;

type SupportedOperationJob =
	| Job<TranscriptionJobData, TranscriptionResult>
	| Job<MirrorGenerationJobData, MirrorGenerationJobResult>
	| Job<AnalysisJobData, AnalysisJobResult>;

export async function getLeadOperationJob(stage: LeadOperationStage, leadId: string): Promise<SupportedOperationJob | null> {
	const jobId = buildLeadOperationJobId(stage, leadId);

	switch (stage) {
		case "transcription":
			return (await transcriptionQueue.getJob(jobId)) as SupportedOperationJob | null;
		case "mirror":
			return (await mirrorGenerationQueue.getJob(jobId)) as SupportedOperationJob | null;
		case "analysis":
			return (await analysisQueue.getJob(jobId)) as SupportedOperationJob | null;
		default:
			return null;
	}
}

export async function getLeadOperationLeadData(leadId: string) {
	const lead = await prisma.leadOabData.findUnique({
		where: { id: leadId },
		select: leadOperationSelect,
	});

	if (!lead) {
		return null;
	}

	return {
		...lead,
		provaManuscrita: lead.provaManuscrita ? "[Omitido - manuscrito presente]" : null,
		textoDOEspelho: lead.textoDOEspelho ? "[Omitido - espelho presente]" : null,
		imagensConvertidas: Array.isArray(lead.imagensConvertidas) ? `[${lead.imagensConvertidas.length} imagens]` : null,
	};
}

export async function clearLeadAwaitingFlag(leadId: string, stage: LeadOperationStage) {
	const data =
		stage === "transcription"
			? { aguardandoManuscrito: false }
			: stage === "mirror"
				? { aguardandoEspelho: false }
				: { aguardandoAnalise: false };

	const result = await prisma.leadOabData.updateMany({
		where: { id: leadId },
		data,
	});

	if (result.count === 0) {
		return null;
	}

	return prisma.leadOabData.findUnique({
		where: { id: leadId },
		select: leadOperationSelect,
	});
}

export async function getLeadOperationDatabaseFallback(
	leadId: string,
	stage: LeadOperationStage,
): Promise<{
	status: LeadOperationStatus;
	message?: string;
}> {
	const lead = await prisma.leadOabData.findUnique({
		where: { id: leadId },
		select: {
			id: true,
			manuscritoProcessado: true,
			aguardandoManuscrito: true,
			espelhoProcessado: true,
			aguardandoEspelho: true,
			analiseProcessada: true,
			aguardandoAnalise: true,
		},
	});

	if (!lead) {
		return {
			status: "failed",
			message: "Lead não encontrado.",
		};
	}

	if (stage === "transcription") {
		if (lead.aguardandoManuscrito) return { status: "inconsistent", message: "Lead aguardando manuscrito sem job na fila." };
		if (lead.manuscritoProcessado) return { status: "completed" };
		return { status: "idle" };
	}

	if (stage === "mirror") {
		if (lead.aguardandoEspelho) return { status: "inconsistent", message: "Lead aguardando espelho sem job na fila." };
		if (lead.espelhoProcessado) return { status: "completed" };
		return { status: "idle" };
	}

	if (lead.aguardandoAnalise) {
		return { status: "inconsistent", message: "Lead aguardando análise sem job na fila." };
	}
	if (lead.analiseProcessada) return { status: "completed" };
	return { status: "idle" };
}
