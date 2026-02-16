// lib/socialwise-flow/graph/nodes/classify.ts
import { classifyIntent } from "@/lib/socialwise-flow/classification";
import { createLogger } from "@/lib/utils/logger";
import type { AgentStateSchema } from "../state";

const log = createLogger("Graph-Node:Classify");

export async function classifyNode(state: AgentStateSchema): Promise<Partial<AgentStateSchema>> {
	const { context, agent, userId, embedipreview } = state;
	const t0 = Date.now();

	const classification = await classifyIntent(context.userText, userId, agent, !!embedipreview, {
		channelType: context.channelType,
		inboxId: context.inboxId,
		traceId: context.traceId,
	});

	log.info("Classification complete", {
		band: classification.band,
		strategy: classification.strategy,
		topScore: classification.candidates?.[0]?.score ?? null,
		ms: Date.now() - t0,
		traceId: context.traceId,
	});

	return {
		classification: {
			band: classification.band,
			score: classification.score,
			candidates: classification.candidates,
			strategy: classification.strategy,
			metrics: {
				embedding_ms: classification.metrics?.embedding_ms,
				route_total_ms: classification.metrics?.route_total_ms,
			},
		},
	} as Partial<AgentStateSchema>;
}
