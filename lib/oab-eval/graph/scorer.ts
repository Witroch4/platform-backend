import { openai } from "../openai-client";
import type { GraphState } from "./state";
import type { ScoreDecision } from "../types";

function formatCandidates(candidates: { trecho: string; score: number; origem?: string }[]) {
	return candidates
		.map((candidate, index) => {
			const snippet = candidate.trecho.length > 1200 ? `${candidate.trecho.slice(0, 1200)}…` : candidate.trecho;
			return `[#${index}] score=${candidate.score.toFixed(2)} origem=${candidate.origem ?? "?"}\n${snippet}`;
		})
		.join("\n\n");
}

export async function scorerNode(state: GraphState): Promise<Partial<GraphState>> {
	const targetIds: string[] = state.cursor?.lote ?? [];
	const novosScores: ScoreDecision[] = [];

	for (const subitemId of targetIds) {
		const evidencias = state.evidencias.find((pack) => pack.subitemId === subitemId);
		const item = state.rubricItems.find((candidate) => candidate.id === subitemId);

		if (!item || !evidencias) {
			continue;
		}

		const prompt = `Você é avaliador da FGV. Analise se o texto do aluno atende ao subitem do gabarito indicado. Use o texto do subitem e as evidências para decidir se deve conceder pontuação total, parcial ou negar.\n\nSubitem (${item.questao} - ${item.id}) peso=${item.peso ?? "?"}: ${item.descricao}\nFundamentos: ${(item.fundamentos ?? []).join("; ") || "não informado"}\nPalavras-chave: ${(item.palavras_chave ?? []).join(", ") || "não informado"}\n\nEvidências do aluno (ordenadas por relevância):\n${formatCandidates(evidencias.candidatos)}\n\nInstruções de saída:\n- Responda estritamente em JSON com as chaves {"decisao","pontos","justificativa","evidenciasUsadas"}.\n- decisao deve ser "ATRIBUIR_TOTAL", "ATRIBUIR_PARCIAL" ou "NEGAR".\n- Se atribuir parcialmente, aponte quantos pontos (0 <= pontos <= peso do subitem).\n- Justificativa curta e objetiva, citando o trecho utilizado.\n- evidenciasUsadas deve ser um array com os índices das evidências utilizadas.`;

		const completion = await openai.chat.completions.create({
			model: "gpt-4o",
			temperature: 0,
			messages: [
				{ role: "system", content: "Você é um avaliador jurídico extremamente rigoroso. Responda somente em JSON." },
				{ role: "user", content: prompt },
			],
			max_tokens: 800,
		});

		let parsed: ScoreDecision | null = null;
		const raw = completion.choices[0]?.message?.content ?? "";

		try {
			const data = JSON.parse(raw);
			parsed = {
				subitemId,
				decisao: data.decisao ?? "NEGAR",
				justificativa: data.justificativa ?? "",
				pontos: typeof data.pontos === "number" ? data.pontos : 0,
				evidenciasUsadas: Array.isArray(data.evidenciasUsadas)
					? data.evidenciasUsadas.map((index: number) => index.toString())
					: undefined,
			};
		} catch (error) {
			parsed = {
				subitemId,
				decisao: "NEGAR",
				justificativa: `Falha ao interpretar resposta LLM: ${(error as Error).message}`,
				pontos: 0,
			};
		}

		novosScores.push(parsed);
	}

	return {
		scores: [...state.scores, ...novosScores],
		nextActor: "Supervisor",
		cursor: null,
	} as Partial<GraphState>;
}
