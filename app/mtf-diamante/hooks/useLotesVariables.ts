import { useState, useEffect, useCallback } from "react";

export interface LoteVariable {
	id: string;
	chave: string;
	valor: string;
	valorRaw?: string;
	tipo: "lote";
	descricao: string;
	displayName: string;
	isActive?: boolean;
	loteData?: {
		id: string;
		numero: number;
		nome: string;
		valor: string;
		dataInicio: string;
		dataFim: string;
	};
}

interface UseLotesVariablesReturn {
	loteVariables: LoteVariable[];
	loading: boolean;
	error: string | null;
	refreshLoteVariables: () => Promise<void>;
	insertLoteVariable: (chave: string, position?: number) => void;
}

export const useLotesVariables = (
	accountId: string,
	onInsert?: (text: string, position?: number) => void,
): UseLotesVariablesReturn => {
	const [loteVariables, setLoteVariables] = useState<LoteVariable[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchLoteVariables = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await fetch(`/api/admin/mtf-diamante/variaveis`);

			if (!response.ok) {
				throw new Error("Erro ao carregar variáveis de lotes");
			}

			const data = await response.json();

			if (data.success && Array.isArray(data.data)) {
				// Filter to get only lote type variables
				const lotesVariaveis = data.data.filter((v: LoteVariable) => v.tipo === "lote");
				setLoteVariables(lotesVariaveis);
			} else {
				throw new Error("Formato de resposta inválido");
			}
		} catch (err) {
			console.error("Erro ao buscar variáveis de lotes:", err);
			setError(err instanceof Error ? err.message : "Erro desconhecido");
		} finally {
			setLoading(false);
		}
	}, []);

	const insertLoteVariable = useCallback(
		(chave: string, position?: number) => {
			const variable = loteVariables.find((v) => v.chave === chave);
			if (variable && onInsert) {
				// Para lotes, usar o placeholder que será substituído pelo worker
				const textToInsert = `{{${chave}}}`;
				onInsert(textToInsert, position);
			}
		},
		[loteVariables, onInsert],
	);

	const refreshLoteVariables = useCallback(async () => {
		await fetchLoteVariables();
	}, [fetchLoteVariables]);

	useEffect(() => {
		fetchLoteVariables();
	}, [fetchLoteVariables]);

	return {
		loteVariables,
		loading,
		error,
		refreshLoteVariables,
		insertLoteVariable,
	};
};
