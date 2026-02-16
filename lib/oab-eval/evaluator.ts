import type { Prisma } from "@prisma/client";
import { RubricSchema, type SubmissionData, type SubmissionChunk, type EvaluationStrategy } from "./types";
import { createEmbeddingLarge, createEmbeddingSmall } from "./openai-client";
import { buildEvaluationGraph } from "./graph/build-graph";
import type { GraphState, PreparedRubricItem, PreparedSubmissionChunk } from "./graph/state";

function createLimiter(max: number) {
	let active = 0;
	const queue: Array<() => void> = [];
	return async function <T>(fn: () => Promise<T>): Promise<T> {
		if (active >= max) {
			await new Promise<void>((resolve) => queue.push(resolve));
		}
		active++;
		try {
			return await fn();
		} finally {
			active--;
			const next = queue.shift();
			if (next) next();
		}
	};
}

const limit = createLimiter(Number(process.env.OAB_EVAL_EMBEDDING_CONCURRENCY ?? 2));

async function prepareRubric(rubric: unknown): Promise<PreparedRubricItem[]> {
	const parsed = RubricSchema.parse(rubric);
	const items: PreparedRubricItem[] = [];

	for (const item of parsed.itens) {
		const embeddingLarge = await createEmbeddingLarge(item.embedding_text);
		items.push({
			...item,
			embeddingLarge,
			normalizedKeywords: (item.palavras_chave ?? []).map((keyword) => keyword.toLowerCase()),
		});
	}

	return items;
}

async function prepareChunks(chunks: SubmissionChunk[]): Promise<PreparedSubmissionChunk[]> {
	const prepared: PreparedSubmissionChunk[] = [];

	for (const chunk of chunks) {
		const baseText = `Questao=${chunk.questao} | Origem=${chunk.origem} :: ${chunk.text}`;
		const [embeddingSmall, embeddingLarge] = await Promise.all([
			limit(() => createEmbeddingSmall(baseText)),
			limit(() => createEmbeddingLarge(baseText)),
		]);

		prepared.push({
			...chunk,
			embeddingSmall,
			embeddingLarge,
		});
	}

	return prepared;
}

interface EvaluateInput {
	rubric: unknown;
	submission: SubmissionData;
	alunoNome?: string;
	strategy?: EvaluationStrategy;
}

export async function evaluateSubmission(input: EvaluateInput) {
	const rubricItems = await prepareRubric(input.rubric);
	const submissionChunks = await prepareChunks(input.submission.chunks);

	const graph = buildEvaluationGraph();
	const finalState = (await (graph as any).invoke({
		messages: [],
		rubricItems,
		submissionChunks,
		alunoNome: input.alunoNome ?? "Aluno(a)",
		strategy: input.strategy ?? "LARGE",
		topK: 12,
		evidencias: [],
		scores: [],
		nextActor: "Supervisor",
	})) as GraphState;

	return {
		scores: finalState.scores,
		evidencias: finalState.evidencias,
		relatorio: finalState.relatorio,
	};
}

export function parseSubmissionData(raw: Prisma.JsonValue): SubmissionData {
	if (!raw || typeof raw !== "object") {
		throw new Error("Formato inválido para dados da submissão");
	}

	const data = raw as unknown as SubmissionData;
	if (!Array.isArray(data.pages) || !Array.isArray(data.chunks)) {
		throw new Error("Dados da submissão sem páginas ou chunks");
	}

	return data;
}
