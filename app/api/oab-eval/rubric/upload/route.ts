//app/api/oab-eval/rubric/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildRubricFromPdf, buildRubricFromPdfVision } from "@/lib/oab-eval/rubric-from-pdf";
import { createRubric } from "@/lib/oab-eval/repository";
import { uploadToMinIOWithRetry } from "@/lib/minio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData();
		const file = form.get("file");
		const withEmbeddings = String(form.get("withEmbeddings") || "false").toLowerCase() === "true";
		const model = form.get("model")?.toString();
		const forceAI = String(form.get("forceAI") || "false").toLowerCase() === "true";
		const visionMode = String(form.get("visionMode") || "false").toLowerCase() === "true";
		const selectedImageUrlsRaw = form.get("selectedImageUrls")?.toString();
		const pdfUrlFromForm = form.get("pdfUrl")?.toString();

		if (!(file instanceof File)) {
			return NextResponse.json({ error: "Envie o arquivo PDF no campo 'file'" }, { status: 400 });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Upload original PDF to MinIO (skip if pdfUrl already provided from convert-images step)
		let pdfUrl: string | undefined = pdfUrlFromForm || undefined;
		if (!pdfUrl) {
			try {
				const minioResult = await uploadToMinIOWithRetry(buffer, file.name, "application/pdf", 3, false);
				pdfUrl = minioResult.url;
				console.info("[OAB::RUBRIC_UPLOAD] PDF salvo no MinIO:", pdfUrl);
			} catch (e) {
				console.warn("[OAB::RUBRIC_UPLOAD] Falha ao salvar PDF no MinIO:", e);
			}
		}

		// Parse selected image URLs if provided (from convert-images step)
		let selectedImageUrls: string[] | undefined;
		if (selectedImageUrlsRaw) {
			try {
				selectedImageUrls = JSON.parse(selectedImageUrlsRaw);
			} catch {
				return NextResponse.json({ error: "selectedImageUrls deve ser um JSON válido" }, { status: 400 });
			}
		}

		// Build rubric payload
		let payload: Awaited<ReturnType<typeof buildRubricFromPdf>>;
		let conversionImageUrls: string[] | undefined;

		if (visionMode) {
			const result = await buildRubricFromPdfVision(buffer, {
				fileName: file.name,
				model,
				imageUrls: selectedImageUrls,
			});
			payload = result.payload;
			conversionImageUrls = result.imageUrls;
		} else {
			payload = await buildRubricFromPdf(buffer, { fileName: file.name, model, forceAI });
		}

		if (withEmbeddings) {
			const { createEmbeddingLarge } = await import("@/lib/oab-eval/openai-client");
			const itens = [] as any[];
			for (const it of payload.itens) {
				const emb = await createEmbeddingLarge(it.embedding_text || "");
				itens.push({ ...it, _embL: emb });
			}
			payload = { ...payload, itens } as typeof payload;
		}

		const record = await createRubric({ payload, pdfUrl });

		console.info("[OAB::RUBRIC_UPLOAD] record (DB result):", JSON.stringify(record));

		const responsePayload = {
			rubricId: record.id,
			pdfUrl: record.pdfUrl ?? null,
			structured: payload,
			stats: {
				itens: payload.itens?.length ?? 0,
				withEmbeddings,
				visionMode,
				forceAI,
				embeddingModel: withEmbeddings ? "text-embedding-3-large" : null,
				imageUrls: conversionImageUrls ?? [],
				metaResumo: {
					exam: payload.meta?.exam,
					area: payload.meta?.area,
					data_aplicacao: payload.meta?.data_aplicacao,
				},
			},
		};

		return NextResponse.json(responsePayload);
	} catch (error) {
		console.error("[OAB::RUBRIC_UPLOAD]", error);
		return NextResponse.json({ error: (error as Error).message || "Falha ao processar PDF" }, { status: 400 });
	}
}
