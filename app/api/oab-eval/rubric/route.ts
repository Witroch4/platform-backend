import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { RubricSchema, type RubricPayload } from "@/lib/oab-eval/types";
import { createRubric } from "@/lib/oab-eval/repository";
import { buildRubricFromPdf } from "@/lib/oab-eval/rubric-from-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let payload: RubricPayload;

    if (typeof body?.pdfBase64 === "string") {
      const buffer = Buffer.from(body.pdfBase64, "base64");
      payload = await buildRubricFromPdf(buffer, {
        fileName: body?.fileName,
        model: body?.model,
      });
    } else {
      payload = RubricSchema.parse(body?.payload ?? body);
    }

    const record = await createRubric({
      payload,
      code: body?.code ?? payload?.meta?.code,
      exam: body?.exam ?? payload?.meta?.exam,
      area: body?.area ?? payload?.meta?.area,
      version: body?.version ?? payload?.meta?.version,
    });

    return NextResponse.json({
      rubricId: record.id,
      createdAt: record.createdAt,
      preview: payload?.meta,
      structured: payload,
    });
  } catch (error) {
    console.error("[OAB::RUBRIC]", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "Erro ao salvar gabarito" },
      { status: 400 },
    );
  }
}
