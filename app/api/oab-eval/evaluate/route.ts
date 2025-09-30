import { NextRequest, NextResponse } from "next/server";
import { getRubricById, getSubmissionById, createEvaluationRun } from "@/lib/oab-eval/repository";
import { evaluateSubmission, parseSubmissionData } from "@/lib/oab-eval/evaluator";
import type { EvaluationStrategy } from "@/lib/oab-eval/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const submissionId = body?.submissionId;
    const rubricId = body?.rubricId;

    if (!submissionId || !rubricId) {
      return NextResponse.json({ error: "submissionId e rubricId são obrigatórios" }, { status: 400 });
    }

    const [submission, rubric] = await Promise.all([getSubmissionById(submissionId), getRubricById(rubricId)]);

    if (!submission) {
      return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });
    }

    if (!rubric) {
      return NextResponse.json({ error: "Gabarito não encontrado" }, { status: 404 });
    }

    const submissionData = parseSubmissionData(submission.rawExtracted);

    const evaluation = await evaluateSubmission({
      rubric: rubric.schema,
      submission: submissionData,
      alunoNome: submission.alunoNome ?? body?.alunoNome,
      strategy: (body?.strategy as EvaluationStrategy) ?? "LARGE",
    });

    const run = await createEvaluationRun({
      submissionId,
      rubricId,
      strategy: { mode: body?.strategy ?? "LARGE" },
      scores: evaluation.scores,
      evidences: evaluation.evidencias,
      report: evaluation.relatorio,
    });

    return NextResponse.json({
      evaluationId: run.id,
      report: evaluation.relatorio,
      scores: evaluation.scores,
      evidencias: evaluation.evidencias,
    });
  } catch (error) {
    console.error("[OAB::EVALUATE]", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "Erro ao avaliar submissão" },
      { status: 400 },
    );
  }
}
