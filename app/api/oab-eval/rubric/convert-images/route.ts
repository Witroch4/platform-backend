import { NextRequest, NextResponse } from "next/server";
import { convertPdfBufferToImageUrls } from "@/lib/oab-eval/rubric-from-pdf";
import { uploadToMinIOWithRetry } from "@/lib/minio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData();
		const file = form.get("file");

		if (!(file instanceof File)) {
			return NextResponse.json({ error: "Envie o arquivo PDF no campo 'file'" }, { status: 400 });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Upload PDF ao MinIO
		let pdfUrl: string | null = null;
		try {
			const minioResult = await uploadToMinIOWithRetry(buffer, file.name, "application/pdf", 3, false);
			pdfUrl = minioResult.url;
		} catch (e) {
			console.warn("[OAB::CONVERT_IMAGES] Falha ao salvar PDF no MinIO:", e);
		}

		// Converter PDF em imagens
		const imageUrls = await convertPdfBufferToImageUrls(buffer);

		return NextResponse.json({ imageUrls, pdfUrl });
	} catch (error) {
		console.error("[OAB::CONVERT_IMAGES]", error);
		return NextResponse.json(
			{ error: (error as Error).message || "Falha ao converter PDF em imagens" },
			{ status: 400 },
		);
	}
}
