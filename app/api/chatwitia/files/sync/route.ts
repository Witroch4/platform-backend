// app/api/chatwitia/files/sync/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { openaiService, type FilePurpose } from "@/services/openai";

// Importações de módulos Node.js somente usados no servidor
// Não importamos o fs diretamente aqui para evitar problemas com o bundler
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import axios from "axios";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120; // seg

// --- helpers --------------------------------------------------------------
const BodySchema = z
	.object({
		fileId: z.string().optional(),
		storageUrl: z.string().optional(),
		filename: z.string().optional(),
		fileType: z.string().optional(),
		purpose: z.string().optional(),
		sessionId: z.string().optional(),
	})
	.refine((data) => data.fileId || data.storageUrl, {
		message: "Ou fileId ou storageUrl deve ser fornecido",
	});

function tmpPath(filename: string) {
	return join(tmpdir(), `cw-sync-${randomUUID()}-${filename}`);
}

// --- POST -----------------------------------------------------------------
export async function POST(req: NextRequest) {
	/* 1. Auth */
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
	}

	/* 2. Body & validation */
	let body;
	try {
		body = BodySchema.parse(await req.json());
	} catch (e) {
		console.error("Erro ao validar body:", e);
		return NextResponse.json(
			{
				error:
					'Body inválido: {"fileId": "<string>"} ou {"storageUrl": "<string>", "filename": "<string>", "fileType": "<string>", "purpose": "<string>"}',
			},
			{ status: 400 },
		);
	}

	let chatFile;
	let storageUrl: string;
	let filename: string;
	let fileType: string;
	let initialPurpose: string;
	let sessionId: string | null = body.sessionId || null;

	/* 3. Obter informações do arquivo */
	if (body.fileId) {
		// Primeiro tentar buscar no ChatFile
		chatFile = await getPrismaInstance().chatFile.findUnique({ where: { id: body.fileId } });

		// Se não encontrar no ChatFile e parece ser uma imagem, buscar no GeneratedImage
		let generatedImage;
		if (!chatFile) {
			generatedImage = await getPrismaInstance().generatedImage.findUnique({ where: { id: body.fileId } });

			if (!generatedImage) {
				return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
			}

			if (!generatedImage.imageUrl) {
				return NextResponse.json({ error: "Imagem sem URL de armazenamento" }, { status: 400 });
			}

			// Se já tem openaiFileId, retornar
			if (generatedImage.openaiFileId?.startsWith("file-")) {
				return NextResponse.json({ success: true, openaiFileId: generatedImage.openaiFileId });
			}

			storageUrl = generatedImage.imageUrl;
			filename = `image-${generatedImage.id}.${generatedImage.mimeType.split("/")[1] || "png"}`;
			fileType = generatedImage.mimeType;
			initialPurpose = "vision"; // Imagens sempre usam vision
			sessionId = generatedImage.sessionId;
		} else {
			if (!chatFile.storageUrl)
				return NextResponse.json({ error: "Arquivo sem URL de armazenamento" }, { status: 400 });

			if (chatFile.openaiFileId?.startsWith("file-"))
				return NextResponse.json({ success: true, openaiFileId: chatFile.openaiFileId });

			storageUrl = chatFile.storageUrl;
			filename = chatFile.filename;
			fileType = chatFile.fileType;
			initialPurpose = chatFile.purpose || "user_data";
			sessionId = chatFile.sessionId;
		}
	} else if (body.storageUrl) {
		// Usar informações diretas da requisição
		storageUrl = body.storageUrl;
		filename = body.filename || "arquivo.pdf";
		fileType = body.fileType || "application/pdf";
		initialPurpose = body.purpose || "user_data";

		// Verificar se já existe no banco por storageUrl (primeiro ChatFile, depois GeneratedImage)
		chatFile = await getPrismaInstance().chatFile.findFirst({ where: { storageUrl: body.storageUrl } });

		let generatedImage;
		if (!chatFile) {
			generatedImage = await getPrismaInstance().generatedImage.findFirst({ where: { imageUrl: body.storageUrl } });

			if (generatedImage) {
				if (generatedImage.openaiFileId?.startsWith("file-"))
					return NextResponse.json({ success: true, openaiFileId: generatedImage.openaiFileId });
				sessionId = generatedImage.sessionId;
			}
		} else {
			if (chatFile.openaiFileId?.startsWith("file-"))
				return NextResponse.json({ success: true, openaiFileId: chatFile.openaiFileId });
			sessionId = chatFile.sessionId;
		}
	} else {
		return NextResponse.json({ error: "Informações insuficientes para o arquivo" }, { status: 400 });
	}

	/* 4. Download do MinIO para tmp (stream) */
	// Importar 'fs' apenas quando necessário, para evitar problemas com o bundler
	const { createWriteStream } = await import("fs");
	const { stat, unlink } = await import("fs/promises");
	const tmpFile = tmpPath(filename);
	try {
		const axiosResp = await axios.get(storageUrl, { responseType: "stream" });
		await pipeline(axiosResp.data, createWriteStream(tmpFile));
	} catch (e) {
		console.error("Erro no download:", e);
		return NextResponse.json({ error: "Falha ao baixar arquivo" }, { status: 502 });
	}

	/* 5. Validação de tamanho / purpose */
	let purpose: FilePurpose = (initialPurpose ?? "user_data") as FilePurpose;
	const { size } = await stat(tmpFile);
	const isPdf = fileType === "application/pdf";

	if (purpose === "vision" && isPdf) purpose = "user_data" as FilePurpose;
	if (isPdf && purpose === "user_data" && size > 32 * 1024 * 1024)
		return NextResponse.json({ error: "PDF excede 32 MB" }, { status: 413 });
	if (size > 512 * 1024 * 1024) return NextResponse.json({ error: "Arquivo excede 512 MB" }, { status: 413 });

	/* 6. Upload p/ OpenAI (usa serviço central) */
	let openaiFile;
	try {
		openaiFile = await openaiService.uploadFileFromPath(tmpFile, {
			filename,
			mimeType: fileType,
			purpose,
		});
	} catch (e: any) {
		console.error("Erro OpenAI upload:", e?.response?.data || e);
		return NextResponse.json({ error: "Falha no upload para OpenAI" }, { status: 502 });
	} finally {
		// limpar tmp
		await unlink(tmpFile).catch(() => {});
	}

	/* 7. Atualiza ou cria registro no banco */
	if (chatFile) {
		// Atualiza registro existente no ChatFile
		await getPrismaInstance().chatFile.update({
			where: { id: chatFile.id },
			data: { openaiFileId: openaiFile.id, status: "synced", syncedAt: new Date() },
		});
	} else {
		// Verificar se existe um GeneratedImage para atualizar
		const generatedImage = await getPrismaInstance().generatedImage.findFirst({
			where: {
				OR: [{ id: body.fileId || "" }, { imageUrl: body.storageUrl || "" }],
			},
		});

		if (generatedImage) {
			// Atualizar o GeneratedImage com o openaiFileId
			await getPrismaInstance().generatedImage.update({
				where: { id: generatedImage.id },
				data: { openaiFileId: openaiFile.id },
			});
			console.log(`Atualizado GeneratedImage ${generatedImage.id} com openaiFileId: ${openaiFile.id}`);
		} else if (body.storageUrl) {
			// Criar novo registro ChatFile para arquivos que não são imagens
			// Verifica se temos uma sessão ou precisamos criar uma
			if (!sessionId) {
				// Busca a sessão mais recente do usuário ou cria uma nova
				const existingSession = await getPrismaInstance().chatSession.findFirst({
					where: { userId: session.user.id },
					orderBy: { createdAt: "desc" },
				});

				if (existingSession) {
					sessionId = existingSession.id;
				} else {
					// Criar uma nova sessão para o usuário
					const newSession = await getPrismaInstance().chatSession.create({
						data: {
							userId: session.user.id,
							title: `Sessão com ${filename}`,
						},
					});
					sessionId = newSession.id;
				}
			}

			// Cria novo registro para arquivos enviados sem sessionId
			try {
				chatFile = await getPrismaInstance().chatFile.create({
					data: {
						sessionId: sessionId,
						filename,
						fileType,
						purpose: purpose as string,
						storageUrl,
						openaiFileId: openaiFile.id,
						status: "synced",
						syncedAt: new Date(),
					},
				});
				console.log(`Criado novo registro de arquivo no banco para upload: ${chatFile.id}, sessão: ${sessionId}`);
			} catch (dbError) {
				console.error("Erro ao criar registro no banco:", dbError);
				// Continuar mesmo se falhar o banco - já temos o arquivo na OpenAI
			}
		}
	}

	/* 8. Done */
	return NextResponse.json({
		success: true,
		openaiFileId: openaiFile.id,
		internalId: chatFile?.id || null,
		fileId: chatFile?.id || null,
		filename,
		fileType,
		sessionId,
	});
}

// --- GET (method not allowed) --------------------------------------------
export async function GET() {
	return NextResponse.json({ error: "Método não permitido" }, { status: 405 });
}
