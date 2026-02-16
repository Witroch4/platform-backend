import { useState, useEffect } from "react";
import type { LeadChatwit } from "../../../../types";
import { hasEspelhoData } from "../utils";

export function useLeadState(lead: LeadChatwit, onRefresh?: () => void) {
	const [refreshKey, setRefreshKey] = useState(0);
	const [manuscritoProcessadoLocal, setManuscritoProcessadoLocal] = useState(!!lead.manuscritoProcessado);
	const [hasEspelho, setHasEspelho] = useState(hasEspelhoData(lead));
	const [consultoriaAtiva, setConsultoriaAtiva] = useState(!!lead.consultoriaFase2);

	// Estado para o manuscrito
	const [localManuscritoState, setLocalManuscritoState] = useState({
		manuscritoProcessado: !!lead.manuscritoProcessado,
		aguardandoManuscrito: !!lead.aguardandoManuscrito,
		provaManuscrita: lead.provaManuscrita,
	});

	// Estado para o espelho
	const [localEspelhoState, setLocalEspelhoState] = useState({
		hasEspelho: hasEspelhoData(lead),
		aguardandoEspelho: !!lead.aguardandoEspelho,
		espelhoCorrecao: lead.espelhoCorrecao,
		textoDOEspelho: lead.textoDOEspelho,
	});

	// Estado para a análise
	const [localAnaliseState, setLocalAnaliseState] = useState({
		analiseUrl: lead.analiseUrl,
		aguardandoAnalise: !!lead.aguardandoAnalise,
		analisePreliminar: lead.analisePreliminar,
		analiseValidada: !!lead.analiseValidada,
	});

	// Estado para o recurso
	const [localRecursoState, setLocalRecursoState] = useState({
		recursoUrl: lead.recursoUrl,
		aguardandoRecurso: !!lead.aguardandoRecurso,
		recursoPreliminar: lead.recursoPreliminar,
		recursoValidado: !!lead.recursoValidado,
	});

	// Efeitos para sincronizar com mudanças no lead
	useEffect(() => {
		const novoHasEspelho = hasEspelhoData(lead);
		setHasEspelho(novoHasEspelho);
		setLocalEspelhoState((prev) => ({
			...prev,
			hasEspelho: novoHasEspelho,
			aguardandoEspelho: !!lead.aguardandoEspelho,
			espelhoCorrecao: lead.espelhoCorrecao,
			textoDOEspelho: lead.textoDOEspelho,
		}));
		setRefreshKey((prev) => prev + 1);
	}, [lead.espelhoCorrecao, lead.textoDOEspelho, lead.aguardandoEspelho]);

	useEffect(() => {
		setManuscritoProcessadoLocal(!!lead.manuscritoProcessado);
		setLocalManuscritoState({
			manuscritoProcessado: !!lead.manuscritoProcessado,
			aguardandoManuscrito: !!lead.aguardandoManuscrito,
			provaManuscrita: lead.provaManuscrita,
		});
		setRefreshKey((prev) => prev + 1);
	}, [lead.manuscritoProcessado, lead.aguardandoManuscrito, lead.provaManuscrita]);

	useEffect(() => {
		setLocalAnaliseState({
			analiseUrl: lead.analiseUrl,
			aguardandoAnalise: !!lead.aguardandoAnalise,
			analisePreliminar: lead.analisePreliminar,
			analiseValidada: !!lead.analiseValidada,
		});
	}, [lead.analiseUrl, lead.aguardandoAnalise, lead.analisePreliminar, lead.analiseValidada, refreshKey]);

	useEffect(() => {
		setLocalRecursoState({
			recursoUrl: lead.recursoUrl,
			aguardandoRecurso: !!lead.aguardandoRecurso,
			recursoPreliminar: lead.recursoPreliminar,
			recursoValidado: !!lead.recursoValidado,
		});
	}, [lead.recursoUrl, lead.aguardandoRecurso, lead.recursoPreliminar, lead.recursoValidado, refreshKey]);

	useEffect(() => {
		setConsultoriaAtiva(!!lead.consultoriaFase2);
	}, [lead.consultoriaFase2]);

	const forceRefresh = () => {
		setRefreshKey((prev) => prev + 1);
		// Só chama onRefresh se explicitamente solicitado via flag
		// Isso evita reloads desnecessários quando o estado muda via SSE
	};

	const forceServerRefresh = () => {
		setRefreshKey((prev) => prev + 1);
		// Esta função força um refresh do servidor
		if (onRefresh) {
			onRefresh();
		}
	};

	const updateEspelhoState = (updates: any) => {
		if (typeof updates === "boolean") {
			// Mantém compatibilidade com chamadas antigas
			setHasEspelho(updates);
			setLocalEspelhoState((prev) => ({
				...prev,
				hasEspelho: updates,
			}));
		} else {
			setLocalEspelhoState((prev) => ({
				...prev,
				...updates,
			}));
			if (updates.hasEspelho !== undefined) {
				setHasEspelho(updates.hasEspelho);
			}
		}
		// Apenas atualizar estado local, não forçar reload do servidor
		setRefreshKey((prev) => prev + 1);
	};

	const updateManuscritoState = (updates: any) => {
		if (typeof updates === "boolean") {
			// Mantém compatibilidade com chamadas antigas
			setManuscritoProcessadoLocal(updates);
			setLocalManuscritoState((prev) => ({
				...prev,
				manuscritoProcessado: updates,
			}));
		} else {
			setLocalManuscritoState((prev) => ({
				...prev,
				...updates,
			}));
			if (updates.manuscritoProcessado !== undefined) {
				setManuscritoProcessadoLocal(updates.manuscritoProcessado);
			}
		}
		// Apenas atualizar estado local, não forçar reload do servidor
		setRefreshKey((prev) => prev + 1);
	};

	const updateAnaliseState = (updates: Partial<typeof localAnaliseState>) => {
		setLocalAnaliseState((prev) => ({ ...prev, ...updates }));
		// Apenas atualizar estado local, não forçar reload do servidor
		setRefreshKey((prev) => prev + 1);
	};

	const updateRecursoState = (updates: Partial<typeof localRecursoState>) => {
		setLocalRecursoState((prev) => ({ ...prev, ...updates }));
		// Apenas atualizar estado local, não forçar reload do servidor
		setRefreshKey((prev) => prev + 1);
	};

	const updateConsultoriaState = (value: boolean) => {
		setConsultoriaAtiva(value);
		// Apenas atualizar estado local, não forçar reload do servidor
		setRefreshKey((prev) => prev + 1);
	};

	return {
		refreshKey,
		manuscritoProcessadoLocal,
		hasEspelho,
		consultoriaAtiva,
		localManuscritoState,
		localEspelhoState,
		localAnaliseState,
		localRecursoState,
		forceRefresh,
		forceServerRefresh, // Nova função para refresh explícito do servidor
		updateEspelhoState,
		updateManuscritoState,
		updateAnaliseState,
		updateRecursoState,
		updateConsultoriaState,
	};
}
