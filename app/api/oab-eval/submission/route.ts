import { NextRequest, NextResponse } from "next/server";
import { chunkSubmissionText } from "@/lib/oab-eval/chunker";
import { transcribeExamImages } from "@/lib/oab-eval/text-extraction";
import { createSubmission } from "@/lib/oab-eval/repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const images = Array.isArray(body?.images) ? body.images : [];

		if (!images.length) {
			return NextResponse.json({ error: "Envie ao menos uma imagem" }, { status: 400 });
		}

		const pages = await transcribeExamImages(
			images.map((image: { base64: string; mimeType?: string; page?: number; label?: string }, index: number) => ({
				base64: image.base64,
				mimeType: image.mimeType,
				page: image.page ?? index + 1,
				label: image.label,
			})),
		);

		const { combinedText, chunks } = chunkSubmissionText(pages);

		const submission = await createSubmission({
			alunoNome: body?.alunoNome,
			leadOabDataId: body?.leadOabDataId,
			sourcePdfUrl: body?.sourcePdfUrl,
			sourceImages: images.map((img: any) => ({ key: img.storageKey, originalName: img.originalName })),
			pages,
			combinedText,
			chunks,
		});

		return NextResponse.json({
			submissionId: submission.id,
			pageCount: pages.length,
			chunkCount: chunks.length,
		});
	} catch (error) {
		console.error("[OAB::SUBMISSION]", error);
		return NextResponse.json({ error: (error as Error).message ?? "Erro ao processar submissão" }, { status: 400 });
	}
}
