//app/api/oab-eval/rubric/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildRubricFromPdf } from "@/lib/oab-eval/rubric-from-pdf";
import { createRubric } from "@/lib/oab-eval/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData();
		const file = form.get("file");
		const withEmbeddings = String(form.get("withEmbeddings") || "false").toLowerCase() === "true";
		const model = form.get("model")?.toString();

		if (!(file instanceof File)) {
			return NextResponse.json({ error: "Envie o arquivo PDF no campo 'file'" }, { status: 400 });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		let payload = await buildRubricFromPdf(buffer, { fileName: file.name, model });

		if (withEmbeddings) {
			const { createEmbeddingLarge } = await import("@/lib/oab-eval/openai-client");
			// Gera embeddings LARGE para cada item (não persiste)
			const itens = [] as any[];
			for (const it of payload.itens) {
				const emb = await createEmbeddingLarge(it.embedding_text || "");
				itens.push({ ...it, _embL: emb });
			}
			payload = { ...payload, itens } as typeof payload;
		}

		const record = await createRubric({ payload });
		const responsePayload = {
			rubricId: record.id,
			structured: payload,
			stats: {
				itens: payload.itens?.length ?? 0,
				withEmbeddings,
				embeddingModel: withEmbeddings ? "text-embedding-3-large" : null,
				metaResumo: {
					exam: payload.meta?.exam,
					area: payload.meta?.area,
					data_aplicacao: payload.meta?.data_aplicacao,
				},
			},
		};

		console.info("[OAB::RUBRIC_UPLOAD]", responsePayload);

		return NextResponse.json(responsePayload);
	} catch (error) {
		console.error("[OAB::RUBRIC_UPLOAD]", error);
		return NextResponse.json({ error: (error as Error).message || "Falha ao processar PDF" }, { status: 400 });
	}
}
