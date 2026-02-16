// lib/socialwise-flow/graph/nodes/router.ts
import { createLogger } from "@/lib/utils/logger";
import type { AgentStateSchema } from "../state";
import {
	processHardBand,
	processSoftBand,
	processRouterBand,
} from "@/lib/socialwise-flow/processor-components/band-handlers";

const log = createLogger("Graph-Node:Router");

export async function routerNode(state: AgentStateSchema): Promise<Partial<AgentStateSchema>> {
	const { classification, context, agent, gatedHints, agentSupplement, activeIntentSlug } = state;
	const t0 = Date.now();

	if (!classification) {
		return {};
	}

	if (classification.band === "HARD") {
		const resp = await processHardBand(
			{
				band: "HARD",
				score: classification.score,
				candidates: classification.candidates,
				strategy: classification.strategy as any,
				metrics: { route_total_ms: 0, embedding_ms: classification.metrics?.embedding_ms },
			},
			context,
		);

		log.info("HARD band processed", { ms: Date.now() - t0, traceId: context.traceId });
		return {
			response: resp,
			metrics: {
				routeTotalMs: Date.now() - t0,
				embeddingMs: classification.metrics?.embedding_ms,
				score: classification.score,
			},
		};
	}

	if (classification.band === "SOFT") {
		const res = await processSoftBand(
			{
				band: "SOFT",
				score: classification.score,
				candidates: classification.candidates,
				strategy: classification.strategy as any,
				metrics: { route_total_ms: 0, embedding_ms: classification.metrics?.embedding_ms },
			},
			context,
			agent,
		);

		log.info("SOFT band processed", { ms: Date.now() - t0, traceId: context.traceId });
		return {
			response: res.response,
			metrics: {
				routeTotalMs: Date.now() - t0,
				embeddingMs: classification.metrics?.embedding_ms,
				llmWarmupMs: res.llmWarmupMs,
				score: classification.score,
			},
		};
	}

	// ROUTER: invoke with gated hints when available
	// 🛡️ ANTI-LOOP: Filtrar a intenção ativa dos hints para evitar re-disparo
	let hintsToUse = gatedHints && gatedHints.length ? gatedHints : classification.candidates;

	if (activeIntentSlug) {
		const originalCount = hintsToUse.length;
		// Normalizar slug para comparação (remover @ se existir, lowercase)
		const normalizedActiveSlug = activeIntentSlug.replace(/^@/, "").toLowerCase().replace(/\s+/g, "_");

		hintsToUse = hintsToUse.filter((hint) => {
			const hintSlug = (hint.slug || "").replace(/^@/, "").toLowerCase().replace(/\s+/g, "_");
			return hintSlug !== normalizedActiveSlug;
		});

		if (hintsToUse.length < originalCount) {
			log.info("🛡️ ANTI-LOOP: Filtered active intent from hints", {
				activeIntentSlug,
				filteredOut: originalCount - hintsToUse.length,
				remainingHints: hintsToUse.length,
				traceId: context.traceId,
			});
		}
	}

	const routerRes = await processRouterBand(
		{
			...context,
			agentSupplement,
		},
		agent,
		hintsToUse,
	);
	log.info("ROUTER band processed", { ms: Date.now() - t0, traceId: context.traceId });
	return {
		response: routerRes.response,
		metrics: {
			routeTotalMs: Date.now() - t0,
			embeddingMs: classification.metrics?.embedding_ms,
			llmWarmupMs: routerRes.llmWarmupMs,
			score: classification.score,
		},
	} as Partial<AgentStateSchema>;
}
