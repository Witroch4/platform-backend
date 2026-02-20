export interface AnaliseItem {
	titulo: string;
	descricao: string;
	valor: string;
	MelhoriasPropostas?: string;
}

export interface AnaliseData {
	exameDescricao?: string;
	inscricao?: string;
	nomeExaminando?: string;
	seccional?: string;
	areaJuridica?: string;
	notaFinal?: string;
	situacao?: string;
	pontosPeca?: AnaliseItem[];
	subtotalPeca?: string;
	pontosQuestoes?: AnaliseItem[];
	subtotalQuestoes?: string;
	conclusao?: string;
	argumentacao?: string[];
	leadID?: string;
	analisepreliminar?: boolean;
	[key: string]: unknown;
}
