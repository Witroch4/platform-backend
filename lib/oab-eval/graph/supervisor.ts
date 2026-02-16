import type { GraphState } from "./state";

export function supervisorNode(state: GraphState): Partial<GraphState> {
	const pendingEvidence = state.rubricItems.filter((item) => !state.evidencias.some((ev) => ev.subitemId === item.id));
	if (pendingEvidence.length) {
		return {
			nextActor: "Matcher",
			cursor: { lote: pendingEvidence.slice(0, 8).map((x) => x.id) },
		} as Partial<GraphState>;
	}

	const pendingScores = state.rubricItems.filter((item) => !state.scores.some((score) => score.subitemId === item.id));
	if (pendingScores.length) {
		return {
			nextActor: "Scorer",
			cursor: { lote: pendingScores.slice(0, 16).map((x) => x.id) },
		} as Partial<GraphState>;
	}

	return { nextActor: "Reporter" } as Partial<GraphState>;
}
