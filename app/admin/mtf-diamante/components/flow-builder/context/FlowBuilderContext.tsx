"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Contexto para prover dados globais do Flow Builder para todos os nós.
 * Necessário porque nós React Flow não recebem props customizadas diretamente.
 */
interface FlowBuilderContextValue {
	/** ID da caixa (inbox) atual */
	caixaId: string;
}

const FlowBuilderContext = createContext<FlowBuilderContextValue | null>(null);

export function FlowBuilderProvider({
	caixaId,
	children,
}: {
	caixaId: string;
	children: ReactNode;
}) {
	return <FlowBuilderContext.Provider value={{ caixaId }}>{children}</FlowBuilderContext.Provider>;
}

/**
 * Hook para acessar o contexto do Flow Builder dentro de nós.
 * Retorna null se usado fora do Provider (graceful degradation durante HMR).
 */
export function useFlowBuilderContext() {
	return useContext(FlowBuilderContext);
}
