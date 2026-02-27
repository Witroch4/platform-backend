import type { GraphState } from "./state";
import type { EvaluationReport } from "../types";

export function reporterNode(state: GraphState): Partial<GraphState> {
	const maximo = state.rubricItems.reduce((acc, item) => acc + (item.nota_maxima ?? 0), 0);
	const obtido = state.scores.reduce((acc, score) => acc + (score.pontos ?? 0), 0);

	const itens: EvaluationReport["itens"] = state.scores
		.filter((score) => score.decisao !== "ATRIBUIR_TOTAL")
		.map((score) => {
			const item = state.rubricItems.find((candidate) => candidate.id === score.subitemId);
			if (!item) return null;

			const tese =
				score.decisao === "ATRIBUIR_PARCIAL"
					? `O aluno cumpriu parcialmente o subitem ${item.id}: ${score.justificativa}`
					: `Pontuação negada para ${item.id}. Observação: ${score.justificativa}`;

			return {
				questao: item.questao,
				subitemId: item.id,
				tese,
				pedido: `Requer a revisão do subitem ${item.id}, com atribuição de até ${item.nota_maxima ?? 0} ponto(s).`,
			};
		})
		.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

	const relatorio: EvaluationReport = {
		aluno: state.alunoNome,
		totais: {
			obtido: Number(obtido.toFixed(2)),
			maximo: Number(maximo.toFixed(2)),
			reivindicado: Number((maximo - obtido).toFixed(2)),
		},
		itens,
	};

	return {
		nextActor: "END",
		relatorio,
	} as Partial<GraphState>;
}
