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

export const RubricSchema = z.object({
  meta: z.record(z.any()).optional(),
  schema_docs: z.record(z.any()).optional(),
  itens: z.array(RubricItemSchema),
});

export type RubricPayload = z.infer<typeof RubricSchema>;

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
