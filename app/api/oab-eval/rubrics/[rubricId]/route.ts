import { NextRequest, NextResponse } from "next/server";
import { getRubricById, updateRubric } from "@/lib/oab-eval/repository";
import { RubricSchema, type RubricPayload } from "@/lib/oab-eval/types";
import { verificarPontuacao, type Subitem } from "@/lib/oab/gabarito-parser-deterministico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildResponsePayload(record: any) {
  if (!record) return null;

  const schema = (record.schema ?? {}) as RubricPayload;
  const itens = Array.isArray(schema.itens) ? (schema.itens as Subitem[]) : [];

  let pontuacao: ReturnType<typeof verificarPontuacao> | null = null;
  try {
    pontuacao = verificarPontuacao(itens as any);
  } catch (err) {
    console.warn("[OAB::RUBRICS::DETAIL] Falha ao verificar pontuação", record.id, err);
  }

  return {
    id: record.id,
    code: record.code ?? null,
    exam: record.exam ?? schema.meta?.exam ?? null,
    area: record.area ?? schema.meta?.area ?? null,
    version: record.version ?? schema.meta?.versao_schema ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    meta: record.meta ?? schema.meta ?? null,
    schema,
    counts: {
      itens: itens.length,
      grupos: Array.isArray(schema.grupos) ? schema.grupos.length : 0,
    },
    pontuacao,
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ rubricId: string }> },
) {
  try {
    const { rubricId } = await context.params;
    const record = await getRubricById(rubricId);
    if (!record) {
      return NextResponse.json({ success: false, error: "Gabarito não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      rubric: buildResponsePayload(record),
    });
  } catch (error) {
    console.error("[OAB::RUBRICS::DETAIL::GET]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message ?? "Falha ao buscar gabarito" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ rubricId: string }> },
) {
  try {
    const { rubricId } = await context.params;
    const body = await request.json();
    if (!body?.schema) {
      return NextResponse.json({ success: false, error: "Campo 'schema' obrigatório" }, { status: 400 });
    }

    const parsed = RubricSchema.parse(body.schema);
    const updated = await updateRubric({
      id: rubricId,
      payload: parsed,
      meta: body.meta ?? parsed.meta ?? null,
      code: body.code,
      exam: body.exam,
      area: body.area,
      version: body.version,
    });

    return NextResponse.json({
      success: true,
      rubric: buildResponsePayload(updated),
    });
  } catch (error) {
    console.error("[OAB::RUBRICS::DETAIL::PUT]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message ?? "Falha ao atualizar gabarito" },
      { status: 400 },
    );
  }
}
