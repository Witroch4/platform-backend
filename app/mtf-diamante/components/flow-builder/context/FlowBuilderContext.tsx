"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useStore } from "@xyflow/react";
import { FlowNodeType } from "@/types/flow-builder";
import { useUnifiedVariables } from "../../../hooks/useUnifiedVariables";
import {
	type FlowBuilderVariable,
	STATIC_FLOW_VARIABLES,
	SPECIAL_MTF_VARIABLES,
} from "../constants/flow-variables";

/**
 * Contexto para prover dados globais do Flow Builder para todos os nós.
 * Necessário porque nós React Flow não recebem props customizadas diretamente.
 */
interface FlowBuilderContextValue {
	/** ID da caixa (inbox) atual */
	caixaId: string;
	/** All variables: static (contact/conversation/system) + dynamic MTF + session */
	allVariables: FlowBuilderVariable[];
	/** Whether MTF variables are still loading */
	mtfVariablesLoading: boolean;
	/** Session variables collected from WaitForReply/GeneratePaymentLink nodes */
	sessionVariables: FlowBuilderVariable[];
}

const FlowBuilderContext = createContext<FlowBuilderContextValue | null>(null);

/**
 * Reactively collects session variable names from WaitForReply and GeneratePaymentLink nodes.
 * Uses a serialized key so the output only changes when variable names actually change.
 */
function useSessionVariablesFromGraph(): FlowBuilderVariable[] {
	// Selector produces a stable string key: "w:user_reply|p:payment_url:link_id|..."
	// Only re-renders when the key changes (variable names added/removed/renamed).
	const sessionKey = useStore((state) =>
		state.nodes
			.filter(
				(n) =>
					n.type === FlowNodeType.WAIT_FOR_REPLY ||
					n.type === FlowNodeType.GENERATE_PAYMENT_LINK,
			)
			.map((n) => {
				const d = n.data as Record<string, unknown>;
				if (n.type === FlowNodeType.WAIT_FOR_REPLY) {
					return `w:${d.variableName || "user_reply"}:${String(d.promptText || "").slice(0, 40)}`;
				}
				return `p:${d.outputVariable || "payment_url"}:${d.linkIdVariable || ""}`;
			})
			.sort()
			.join("|"),
	);

	// Cache previous result to avoid rebuilding when key hasn't changed
	const prevRef = useRef<{ key: string; vars: FlowBuilderVariable[] }>({ key: "", vars: [] });

	return useMemo(() => {
		if (sessionKey === prevRef.current.key) return prevRef.current.vars;

		const vars: FlowBuilderVariable[] = [];
		const seen = new Set<string>();

		for (const entry of sessionKey.split("|")) {
			if (!entry) continue;
			const parts = entry.split(":");
			const type = parts[0];

			if (type === "w") {
				const varName = parts[1] || "user_reply";
				const prompt = parts.slice(2).join(":") || "...";
				if (!seen.has(varName)) {
					seen.add(varName);
					vars.push({
						name: varName,
						label: varName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
						description: `Coletado via "Aguardar Resposta" (${prompt})`,
						category: "session",
					});
				}
			} else if (type === "p") {
				const outVar = parts[1] || "payment_url";
				if (!seen.has(outVar)) {
					seen.add(outVar);
					vars.push({
						name: outVar,
						label: outVar.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
						description: "URL do link de pagamento gerado",
						category: "session",
					});
				}
				const linkIdVar = parts[2];
				if (linkIdVar && !seen.has(linkIdVar)) {
					seen.add(linkIdVar);
					vars.push({
						name: linkIdVar,
						label: linkIdVar.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
						description: "ID do link de pagamento gerado",
						category: "session",
					});
				}
			}
		}

		prevRef.current = { key: sessionKey, vars };
		return vars;
	}, [sessionKey]);
}

export function FlowBuilderProvider({
	caixaId,
	children,
}: {
	caixaId: string;
	children: ReactNode;
}) {
	// Fetch MTF variables (accountId is ignored by the API — it uses session auth)
	const { variables: mtfRaw, loading: mtfVariablesLoading } = useUnifiedVariables("");

	// Collect session variables from the flow graph (WaitForReply, GeneratePaymentLink)
	const sessionVariables = useSessionVariablesFromGraph();

	const allVariables = useMemo(() => {
		// Map UnifiedVariable → FlowBuilderVariable
		const mtfMapped: FlowBuilderVariable[] = mtfRaw.map((uv) => ({
			name: uv.chave,
			label: uv.displayName,
			description: uv.descricao,
			category: "mtf" as const,
			value: uv.valor,
			subCategory: uv.tipo,
		}));

		// Merge: static + special MTF (nome_lead) + dynamic MTF
		// Deduplicate by name (static takes priority)
		const staticNames = new Set(STATIC_FLOW_VARIABLES.map((v) => v.name));
		const specialFiltered = SPECIAL_MTF_VARIABLES.filter((v) => !staticNames.has(v.name));
		const dynamicFiltered = mtfMapped.filter(
			(v) => !staticNames.has(v.name) && !specialFiltered.some((s) => s.name === v.name),
		);

		// Session variables (from flow graph nodes) — deduplicate against all others
		const allNames = new Set([
			...staticNames,
			...specialFiltered.map((v) => v.name),
			...dynamicFiltered.map((v) => v.name),
		]);
		const sessionFiltered = sessionVariables.filter((v) => !allNames.has(v.name));

		return [...STATIC_FLOW_VARIABLES, ...specialFiltered, ...dynamicFiltered, ...sessionFiltered];
	}, [mtfRaw, sessionVariables]);

	const contextValue = useMemo(
		() => ({ caixaId, allVariables, mtfVariablesLoading, sessionVariables }),
		[caixaId, allVariables, mtfVariablesLoading, sessionVariables],
	);

	return <FlowBuilderContext.Provider value={contextValue}>{children}</FlowBuilderContext.Provider>;
}

/**
 * Hook para acessar o contexto do Flow Builder dentro de nós.
 * Retorna null se usado fora do Provider (graceful degradation durante HMR).
 */
export function useFlowBuilderContext() {
	return useContext(FlowBuilderContext);
}
