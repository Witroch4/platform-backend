import { z } from "zod";

export const RubricItemSchema = z.object({
	id: z.string(),
	escopo: z.string(),
	questao: z.string(),
	descricao: z.string(),
	peso: z.number().nullable().optional(),
	fundamentos: z.array(z.string()).optional().default([]),
	alternativas_grupo: z.array(z.string()).optional(),
	palavras_chave: z.array(z.string()).optional(),
	embedding_text: z.string().optional().default(""),
});

export type RubricItem = z.infer<typeof RubricItemSchema>;

export const RubricGroupSchema = z.object({
	id: z.string(),
	escopo: z.string(),
	questao: z.string(),
	indice: z.number(),
	rotulo: z.string(),
	segmento: z.string().nullable().optional(),
	descricao: z.string(),
	descricao_bruta: z.string(),
	descricao_limpa: z.string(),
	peso_maximo: z.number(),
	pesos_opcoes: z.array(z.number()).optional().default([]),
	pesos_brutos: z.array(z.number()).optional().default([]),
	subitens: z.array(z.string()),
	variant_family: z.string().optional(),
	variant_key: z.string().optional(),
	variant_label: z.string().optional(),
});

export type RubricGroup = z.infer<typeof RubricGroupSchema>;

export const RubricSchema = z.object({
	meta: z.record(z.any()).optional(),
	schema_docs: z.record(z.any()).optional(),
	itens: z.array(RubricItemSchema),
	grupos: z.array(RubricGroupSchema).optional(),
});

export type RubricPayload = z.infer<typeof RubricSchema>;

export interface StudentMirrorItem extends RubricItem {
	nota_obtida: number | null;
	nota_obtida_raw: string | null;
	subitens?: StudentMirrorItem[];
}

export interface StudentMirrorScores {
	maximo: number | null;
	obtido: number | null;
	maximo_rubrica?: number | null;
	obtido_rubrica?: number | null;
}

export interface StudentMirrorPayload {
	meta: Record<string, any>;
	aluno: {
		nome: string;
		inscricao: string;
		situacao: string;
		nota_final: number | null;
		nota_final_raw: string | null;
		pontuacao_total_peca: number | null;
		pontuacao_total_peca_raw: string | null;
		pontuacao_total_questoes: number | null;
		pontuacao_total_questoes_raw: string | null;
	};
	itens: StudentMirrorItem[];
	totais: {
		peca: StudentMirrorScores;
		questoes: StudentMirrorScores;
		final: StudentMirrorScores;
	};
	schema_docs?: Record<string, any>;
}

export interface ExtractedPage {
	page: number;
	text: string;
	imageKey?: string;
}

export interface SubmissionChunk {
	id: string;
	questao: string;
	origem: string;
	text: string;
	embeddingSmall?: number[];
	embeddingLarge?: number[];
}

export interface SubmissionData {
	combinedText: string;
	pages: ExtractedPage[];
	chunks: SubmissionChunk[];
}

export type EvaluationStrategy = "SMALL" | "LARGE";

export interface EvidenceCandidate {
	chunkId?: string;
	trecho: string;
	origem?: string;
	score: number;
}

export interface EvidencePack {
	subitemId: string;
	questao: string;
	peso: number | null | undefined;
	candidatos: EvidenceCandidate[];
}

export interface ScoreDecision {
	subitemId: string;
	decisao: "ATRIBUIR_TOTAL" | "ATRIBUIR_PARCIAL" | "NEGAR";
	justificativa: string;
	pontos: number;
	evidenciasUsadas?: string[];
}

export interface EvaluationReport {
	aluno: string;
	totais: {
		obtido: number;
		maximo: number;
		reivindicado: number;
	};
	itens: Array<{
		questao: string;
		subitemId: string;
		tese: string;
		pedido: string;
	}>;
}
