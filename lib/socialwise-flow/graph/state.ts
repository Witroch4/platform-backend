// lib/socialwise-flow/graph/state.ts
// Typed state and annotations for LangGraph orchestration of SocialWise Flow

import type { ProcessorContext } from "@/lib/socialwise-flow/processor-components";
import type { AssistantConfig } from "@/lib/socialwise-flow/processor-components/assistant-config";
import type { IntentCandidate } from "@/services/openai-components/types";
import type { ChannelResponse } from "@/lib/socialwise-flow/channel-formatting";
import { Annotation } from "@langchain/langgraph";

export type Band = "HARD" | "SOFT" | "ROUTER";

export interface ClassificationSnapshot {
	band: Band;
	score: number;
	candidates: IntentCandidate[];
	strategy: string;
	metrics?: {
		embedding_ms?: number;
		route_total_ms?: number;
	};
}

export interface GatedHint extends IntentCandidate {
	descScore?: number; // semantic alignment score based on description vs user text
}

export interface RouterSnapshot {
	mode: "intent" | "chat";
	intent_payload?: string;
	response_text: string;
	buttons?: Array<{ title: string; payload: string }>; // normalized
}

export interface OrchestratorMetrics {
	routeTotalMs: number;
	embeddingMs?: number;
	llmWarmupMs?: number;
	score?: number;
}

export interface AgentStateSchema {
	// Immutable inputs for this turn
	context: ProcessorContext;
	agent: AssistantConfig;
	userId: string;
	embedipreview: boolean;

	// Working memory
	userEmbedding?: number[]; // normalized
	classification?: ClassificationSnapshot;
	gatedHints?: GatedHint[];
	routerResult?: RouterSnapshot;
	response?: ChannelResponse;
	agentSupplement?: string;

	// 🛡️ Anti-loop: slug da intenção ativa (já enviada) para filtrar dos hints
	activeIntentSlug?: string;

	// Metrics + tracing
	metrics?: OrchestratorMetrics;
	traceId?: string;
}

// LangGraph annotated schema (reducers for any arrays we might expand later)
export const AgentState = Annotation.Root({
	context: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	agent: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	userId: Annotation<string>({ value: (_x: string, y: string) => y, default: () => "" }),
	embedipreview: Annotation<boolean>({ value: (_x: boolean, y: boolean) => y, default: () => true }),

	userEmbedding: Annotation<number[]>({ value: (_x: number[], y: number[]) => y, default: () => [] }),
	classification: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	gatedHints: Annotation<any[]>({ reducer: (x: any[], y: any[]) => (x || []).concat(y || []), default: () => [] }),
	routerResult: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	response: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	agentSupplement: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	activeIntentSlug: Annotation<string>({ value: (_x: string, y: string) => y, default: () => "" }),

	metrics: Annotation<any>({ value: (_x: any, y: any) => y, default: () => undefined }),
	traceId: Annotation<string>({ value: (_x: string, y: string) => y, default: () => "" }),
});
