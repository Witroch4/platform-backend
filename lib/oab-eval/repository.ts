import { Prisma } from "@prisma/client";
import { withPrismaReconnect } from "../connections";
import type { ExtractedPage, RubricPayload, SubmissionChunk, SubmissionData } from "./types";

interface SaveRubricInput {
	code?: string;
	exam?: string;
	area?: string;
	version?: string;
	payload: RubricPayload;
}

export async function createRubric(input: SaveRubricInput) {
	const { payload, ...meta } = input;

	return withPrismaReconnect((client) =>
		client.oabRubric.create({
			data: {
				code: meta.code,
				exam: meta.exam,
				area: meta.area,
				version: meta.version,
				meta: payload.meta as Prisma.InputJsonValue,
				schema: payload as unknown as Prisma.InputJsonValue,
			},
		}),
	);
}

export async function listRubrics() {
	return withPrismaReconnect((client) => client.oabRubric.findMany({ orderBy: { createdAt: "desc" } }));
}

export async function getRubricById(rubricId: string) {
	return withPrismaReconnect((client) => client.oabRubric.findUnique({ where: { id: rubricId } }));
}

interface UpdateRubricInput {
	id: string;
	payload: RubricPayload;
	meta?: Record<string, unknown> | null;
	code?: string | null;
	exam?: string | null;
	area?: string | null;
	version?: string | null;
}

export async function updateRubric(input: UpdateRubricInput) {
	const { id, payload, meta, code, exam, area, version } = input;
	const data: Prisma.OabRubricUpdateInput = {
		schema: payload as unknown as Prisma.InputJsonValue,
		meta: (meta ?? payload.meta ?? null) as Prisma.InputJsonValue,
	};

	if (code !== undefined) data.code = code;
	if (exam !== undefined) data.exam = exam;
	if (area !== undefined) data.area = area;
	if (version !== undefined) data.version = version;

	return withPrismaReconnect((client) =>
		client.oabRubric.update({
			where: { id },
			data,
		}),
	);
}

export async function deleteRubric(rubricId: string) {
	return withPrismaReconnect((client) =>
		client.oabRubric.delete({
			where: { id: rubricId },
		}),
	);
}

interface SaveSubmissionInput {
	leadOabDataId?: string;
	alunoNome?: string;
	sourcePdfUrl?: string;
	sourceImages?: Array<{ key?: string; originalName?: string }>;
	pages: ExtractedPage[];
	combinedText: string;
	chunks: SubmissionChunk[];
}

export async function createSubmission(input: SaveSubmissionInput) {
	const { pages, combinedText, chunks, sourceImages, ...rest } = input;

	const rawExtracted: SubmissionData = {
		pages,
		combinedText,
		chunks,
	};

	return withPrismaReconnect((client) =>
		client.oabSubmission.create({
			data: {
				leadOabDataId: rest.leadOabDataId,
				alunoNome: rest.alunoNome,
				sourcePdfUrl: rest.sourcePdfUrl,
				sourceImages: sourceImages as Prisma.InputJsonValue,
				rawExtracted: rawExtracted as unknown as Prisma.InputJsonValue,
			},
		}),
	);
}

export async function getSubmissionById(submissionId: string) {
	return withPrismaReconnect((client) => client.oabSubmission.findUnique({ where: { id: submissionId } }));
}

interface CreateEvaluationRunInput {
	submissionId: string;
	rubricId: string;
	status?: string;
	strategy?: Record<string, unknown>;
	scores?: unknown;
	evidences?: unknown;
	report?: unknown;
}

export async function createEvaluationRun(input: CreateEvaluationRunInput) {
	return withPrismaReconnect((client) =>
		client.oabEvaluationRun.create({
			data: {
				submissionId: input.submissionId,
				rubricId: input.rubricId,
				status: input.status ?? "COMPLETED",
				strategy: input.strategy as Prisma.InputJsonValue,
				scores: input.scores as Prisma.InputJsonValue,
				evidences: input.evidences as Prisma.InputJsonValue,
				report: input.report as Prisma.InputJsonValue,
			},
		}),
	);
}
