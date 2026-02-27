import type { GraphState } from "./state";
import type { EvidencePack } from "../types";

function cosineSimilarity(a: number[], b: number[]): number {
	if (!a.length || !b.length || a.length !== b.length) {
		return 0;
	}

	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i += 1) {
		const ai = a[i];
		const bi = b[i];
		dot += ai * bi;
		magA += ai * ai;
		magB += bi * bi;
	}

	if (!magA || !magB) {
		return 0;
	}

	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function lexicalBoost(text: string, fundamentos?: string[], keywords?: string[]): number {
	let boost = 0;
	const normalized = text.toLowerCase();

	if (fundamentos) {
		for (const fundamento of fundamentos) {
			const token = fundamento.split(" ")[0]?.toLowerCase();
			if (token && normalized.includes(token)) {
				boost += 0.06;
			}
		}
	}

	if (keywords) {
		for (const keyword of keywords) {
			if (keyword && normalized.includes(keyword.toLowerCase())) {
				boost += 0.04;
			}
		}
	}

	return boost;
}

export function matcherNode(state: GraphState): Partial<GraphState> {
	const targetIds: string[] = state.cursor?.lote ?? [];
	const evidences: EvidencePack[] = [];

	for (const subitemId of targetIds) {
		const item = state.rubricItems.find((candidate) => candidate.id === subitemId);
		if (!item) continue;

		let candidateChunks = state.submissionChunks.filter((chunk) => {
			if (item.escopo?.toUpperCase() === "PEÇA") {
				return chunk.questao.toUpperCase() === "PEÇA";
			}
			if (chunk.questao.toUpperCase() === item.questao.toUpperCase()) {
				return true;
			}
			// fallback: allow all if nothing else matches
			return false;
		});

		if (!candidateChunks.length) {
			candidateChunks = state.submissionChunks;
		}

		const scored = candidateChunks.map((chunk) => {
			const embedding = state.strategy === "LARGE" ? chunk.embeddingLarge : chunk.embeddingSmall;
			const itemEmbedding = item.embeddingLarge;
			const similarity = embedding && itemEmbedding ? cosineSimilarity(itemEmbedding, embedding) : 0;
			const bonus = lexicalBoost(chunk.text, item.fundamentos, item.palavras_chave);
			const score = similarity + bonus;
			return {
				chunkId: chunk.id,
				trecho: chunk.text,
				origem: chunk.origem,
				score,
			};
		});

		scored.sort((a, b) => b.score - a.score);

		evidences.push({
			subitemId: item.id,
			questao: item.questao,
			nota_maxima: item.nota_maxima,
			candidatos: scored.slice(0, Math.min(5, scored.length)),
		});
	}

	return {
		evidencias: [...state.evidencias, ...evidences],
		nextActor: "Supervisor",
		cursor: null,
	} as Partial<GraphState>;
}
