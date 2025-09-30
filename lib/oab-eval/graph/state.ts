import { z } from "zod";
import type {
  EvidencePack,
  EvaluationReport,
  EvaluationStrategy,
  RubricItem,
  ScoreDecision,
  SubmissionChunk,
} from "../types";

export interface PreparedRubricItem extends RubricItem {
  embeddingLarge: number[];
  normalizedKeywords: string[];
}

export interface PreparedSubmissionChunk extends SubmissionChunk {
  embeddingSmall?: number[];
  embeddingLarge?: number[];
}

export const GraphStateSchema = z.object({
  messages: z.array(z.any()).default([]),
  rubricItems: z.array(z.any()),
  submissionChunks: z.array(z.any()),
  alunoNome: z.string().default("Aluno(a)"),
  strategy: z.enum(["SMALL", "LARGE"]).default("LARGE"),
  topK: z.number().default(12),
  evidencias: z.array(z.any()).default([]),
  scores: z.array(z.any()).default([]),
  relatorio: z.any().optional(),
  cursor: z.any().optional(),
  nextActor: z.enum(["Supervisor", "Matcher", "Scorer", "Reporter", "END"]).default("Supervisor"),
});

export type GraphState = z.infer<typeof GraphStateSchema> & {
  rubricItems: PreparedRubricItem[];
  submissionChunks: PreparedSubmissionChunk[];
  evidencias: EvidencePack[];
  scores: ScoreDecision[];
  relatorio?: EvaluationReport;
};
