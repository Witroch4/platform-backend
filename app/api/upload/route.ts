// app/api/upload/route.ts

import { NextResponse } from "next/server";
import { uploadToMinIO, correctMinioUrl } from "@/lib/minio";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import type { UploadPurpose } from "@/app/components/ChatInputForm";

export async function POST(request: Request) {
	try {
		// Verificar autenticação
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Extrair o FormData da request
		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const purpose = (formData.get("purpose") as UploadPurpose) || "user_data";
		const sessionId = (formData.get("sessionId") as string) || null;
		console.log(`#########sessionId recebido: ${sessionId}`);

		if (!file) {
			console.error("Nenhum arquivo enviado");
			return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
		}

		// Converter o arquivo para um buffer
		const buffer = Buffer.from(await file.arrayBuffer());
		const fileName = file.name;
		const mimeType = file.type;

		// Verificar se é PDF ou imagem
		const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
		const isImage = mimeType.startsWith("image/");

		// Ajustar o purpose para PDFs se necessário
		const finalPurpose = isPdf && purpose === "vision" ? "user_data" : purpose;

		console.log(`[Upload] Processando arquivo: ${fileName}, tipo: ${mimeType}, purpose: ${finalPurpose}`);

		// Upload do arquivo original para o MinIO com thumbnail automática
		const uploadResult = await uploadToMinIO(buffer, fileName, mimeType, true);

		console.log(`[Upload] Arquivo enviado: ${uploadResult.url}`);

		if (uploadResult.thumbnail_url) {
			console.log(`[Upload] Thumbnail gerada e enviada: ${uploadResult.thumbnail_url}`);
		}

		// Tentar criar o registro no banco - usar GeneratedImage para imagens e ChatFile para PDFs
		let dbRecord = null;
		try {
			if (sessionId) {
				console.log(`[Upload] Salvando arquivo no banco com sessionId=${sessionId}`);

				if (isImage) {
					// Usar GeneratedImage para imagens
					console.log(`[Upload] Salvando imagem no modelo GeneratedImage`);
					const generatedImage = await getPrismaInstance().generatedImage.create({
						data: {
							userId: session.user.id!,
							sessionId: sessionId,
							prompt: `Imagem carregada: ${fileName}`, // Prompt descritivo para upload
							model: "upload", // Indicar que foi upload
							imageUrl: uploadResult.url,
							thumbnailUrl: uploadResult.thumbnail_url,
							mimeType: mimeType,
							size: `${buffer.length}`,
							quality: "original",
							// openaiFileId será definido posteriormente quando sincronizar com OpenAI
						},
					});

					dbRecord = generatedImage;
					console.log(`[Upload] Imagem salva no GeneratedImage: ${generatedImage.id}`);
				} else if (isPdf) {
					// Usar ChatFile apenas para PDFs
					console.log(`[Upload] Salvando PDF no modelo ChatFile`);
					const chatFile = await getPrismaInstance().chatFile.create({
						data: {
							sessionId: sessionId,
							filename: fileName,
							fileType: mimeType,
							purpose: finalPurpose,
							storageUrl: uploadResult.url,
							thumbnail_url: uploadResult.thumbnail_url,
							status: "stored",
						},
					});

					dbRecord = chatFile;
					console.log(`[Upload] PDF salvo no ChatFile: ${chatFile.id}`);
				} else {
					// Outros tipos de arquivo - usar ChatFile
					console.log(`[Upload] Salvando arquivo genérico no modelo ChatFile`);
					const chatFile = await getPrismaInstance().chatFile.create({
						data: {
							sessionId: sessionId,
							filename: fileName,
							fileType: mimeType,
							purpose: finalPurpose,
							storageUrl: uploadResult.url,
							thumbnail_url: uploadResult.thumbnail_url,
							status: "stored",
						},
					});

					dbRecord = chatFile;
					console.log(`[Upload] Arquivo salvo no ChatFile: ${chatFile.id}`);
				}
			} else {
				console.log("[Upload] Nenhum sessionId fornecido, ignorando salvamento no banco");
			}
		} catch (dbError) {
			console.error("Erro ao salvar no banco:", dbError);
			// Continuar mesmo com erro no banco - pelo menos temos o arquivo no MinIO
		}

		return NextResponse.json(
			{
				id: dbRecord?.id,
				fileName,
				url: uploadResult.url,
				mime_type: uploadResult.mime_type,
				is_image: isImage,
				fileType: mimeType,
				purpose: finalPurpose,
				thumbnail_url: uploadResult.thumbnail_url,
				size: buffer.length,
				uploaded_at: new Date().toISOString(),
				model_used: isImage ? "GeneratedImage" : "ChatFile", // Informar qual modelo foi usado
			},
			{ status: 200 },
		);
	} catch (error: any) {
		console.error("Erro ao fazer upload:", error.message);
		return NextResponse.json(
			{
				message: "Erro ao fazer upload do arquivo.",
				error: error.message,
			},
			{ status: 500 },
		);
	}
}

/**
 * API não permite GET
 */
export async function GET() {
	return NextResponse.json({ error: "Método não permitido" }, { status: 405 });
}
