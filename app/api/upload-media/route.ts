import { NextResponse } from "next/server";
import axios from "axios";
import { auth } from "@/auth";
import { getWhatsAppConfig } from "@/app/lib";
import { v4 as uuidv4 } from "uuid";
import { uploadToMinIO } from "@/lib/minio";

/**
 * Função para fazer upload de mídia usando a API de Carregamento Retomável da Meta
 * Esta função implementa o processo descrito na documentação da Meta para carregar arquivos
 * @param fileData Buffer do arquivo
 * @param fileName Nome do arquivo
 * @param mimeType Tipo MIME do arquivo (ex: 'video/mp4', 'image/jpeg')
 * @param userId ID do usuário para buscar credenciais do banco
 * @returns O identificador de mídia (media_handle) retornado pela API Meta
 */
async function uploadMediaToMetaApi(fileData: Buffer, fileName: string, mimeType: string, userId?: string): Promise<string> {
	try {
		// Buscar configurações do usuário no banco de dados
		const whatsappConfig = await getWhatsAppConfig(userId);
		const accessToken = whatsappConfig.whatsappToken;
		const metaAppId = process.env.META_APP_ID;
		const graphApiBase = whatsappConfig.fbGraphApiBase || "https://graph.facebook.com/v22.0";

		if (!accessToken) {
			throw new Error("Token de acesso não configurado. Configure nas Configurações Globais do MTF Diamante.");
		}

		if (!metaAppId) {
			throw new Error("ID do aplicativo Meta não configurado. Configure META_APP_ID no .env");
		}

		console.log(`Iniciando upload para API Meta: ${fileName} (${fileData.length} bytes)`);

		// Etapa 1: Iniciar sessão de carregamento
		const sessionResponse = await axios.post(
			`${graphApiBase}/${metaAppId}/uploads`,
			null,
			{
				params: {
					file_name: fileName,
					file_length: fileData.length,
					file_type: mimeType,
					access_token: accessToken,
				},
			},
		);

		if (!sessionResponse.data || !sessionResponse.data.id) {
			throw new Error("Resposta inválida ao iniciar sessão de upload");
		}

		const uploadSessionId = sessionResponse.data.id.replace("upload:", "");
		console.log(`Sessão de upload iniciada: ${uploadSessionId}`);

		// Etapa 2: Fazer o upload do arquivo
		const uploadResponse = await axios.post(
			`${graphApiBase}/upload:${uploadSessionId}`,
			fileData,
			{
				headers: {
					Authorization: `OAuth ${accessToken}`,
					file_offset: "0",
					"Content-Type": "application/octet-stream",
				},
			},
		);

		if (!uploadResponse.data || !uploadResponse.data.h) {
			throw new Error("Resposta inválida ao fazer upload do arquivo");
		}

		const mediaHandle = uploadResponse.data.h;
		console.log(`Upload concluído. Media handle: ${mediaHandle}`);

		return mediaHandle;
	} catch (error: any) {
		console.error("Erro no upload para API Meta:", error.response?.data || error.message);

		if (error.response?.data?.error) {
			const metaError = error.response.data.error;
			throw new Error(`Erro API Meta: [${metaError.code}] ${metaError.message}`);
		}

		throw new Error(`Falha no upload: ${error.message}`);
	}
}

/**
 * Função para buscar um arquivo do MinIO e fazer upload para a API Meta
 * @param minioUrl URL do arquivo no MinIO
 * @param mimeType Tipo MIME do arquivo
 * @param userId ID do usuário para buscar credenciais
 * @returns O identificador de mídia (media_handle) retornado pela API Meta
 */
async function uploadMinioFileToMeta(minioUrl: string, mimeType: string, userId?: string): Promise<string> {
	try {
		// Baixar o arquivo do MinIO
		console.log(`Baixando arquivo do MinIO: ${minioUrl}`);
		const response = await axios.get(minioUrl, { responseType: "arraybuffer" });
		const fileBuffer = Buffer.from(response.data);

		// Extrair o nome do arquivo da URL
		const urlParts = minioUrl.split("/");
		const fileName = urlParts[urlParts.length - 1];

		console.log(`Arquivo baixado: ${fileName}, tamanho: ${fileBuffer.length} bytes`);

		// Fazer upload para a API Meta
		return await uploadMediaToMetaApi(fileBuffer, fileName, mimeType, userId);
	} catch (error: any) {
		console.error("Erro ao processar arquivo do MinIO:", error);
		throw new Error(`Falha ao processar arquivo: ${error.message}`);
	}
}

/**
 * POST /api/upload-media
 * Endpoint para fazer upload de mídia para o Meta ou MinIO
 * Parâmetros:
 * - fileUrl: URL do arquivo no MinIO (opcional, se já estiver no MinIO)
 * - file: Arquivo a ser enviado (opcional, se não tiver fileUrl)
 * - mimeType: Tipo MIME do arquivo (obrigatório)
 * - destination: 'meta' ou 'minio' (padrão: 'meta')
 */
export async function POST(request: Request) {
	try {
		// Verificar autenticação se necessário
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Processar o corpo da requisição
		const formData = await request.formData();
		const fileUrl = formData.get("fileUrl") as string;
		const file = formData.get("file") as File;
		const mimeType = (formData.get("mimeType") as string) || "application/octet-stream";
		const destination = (formData.get("destination") as string) || "meta";

		if (!mimeType) {
			return NextResponse.json(
				{
					success: false,
					error: "O tipo MIME é obrigatório",
				},
				{ status: 400 },
			);
		}

		// Processar baseado no destino
		if (destination === "meta") {
			// Caso 1: Temos uma URL do MinIO
			if (fileUrl) {
				try {
					const mediaHandle = await uploadMinioFileToMeta(fileUrl, mimeType, session.user.id);
					return NextResponse.json({
						success: true,
						mediaHandle,
						type: "meta",
						originalUrl: fileUrl,
					});
				} catch (error: any) {
					console.error("Erro ao fazer upload da URL para Meta API:", error);
					return NextResponse.json(
						{
							success: false,
							error: error.message,
						},
						{ status: 500 },
					);
				}
			}

			// Caso 2: Temos um arquivo enviado diretamente
			else if (file) {
				try {
					const buffer = Buffer.from(await file.arrayBuffer());
					const mediaHandle = await uploadMediaToMetaApi(buffer, file.name, file.type || mimeType, session.user.id);

					return NextResponse.json({
						success: true,
						mediaHandle,
						type: "meta",
					});
				} catch (error: any) {
					console.error("Erro ao fazer upload do arquivo para Meta API:", error);
					return NextResponse.json(
						{
							success: false,
							error: error.message,
						},
						{ status: 500 },
					);
				}
			} else {
				return NextResponse.json(
					{
						success: false,
						error: "É necessário fornecer fileUrl ou file",
					},
					{ status: 400 },
				);
			}
		}
		// Upload para MinIO
		else if (destination === "minio") {
			if (!file) {
				return NextResponse.json(
					{
						success: false,
						error: "Arquivo não fornecido para upload no MinIO",
					},
					{ status: 400 },
				);
			}

			try {
				const buffer = Buffer.from(await file.arrayBuffer());
				const uniqueFileName = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

				const uploadResult = await uploadToMinIO(buffer, uniqueFileName, file.type || mimeType);

				return NextResponse.json({
					success: true,
					url: uploadResult.url,
					thumbnail_url: uploadResult.thumbnail_url,
					mime_type: uploadResult.mime_type,
					fileName: uniqueFileName,
					type: "minio",
				});
			} catch (error: any) {
				console.error("Erro ao fazer upload para MinIO:", error);
				return NextResponse.json(
					{
						success: false,
						error: error.message,
					},
					{ status: 500 },
				);
			}
		} else {
			return NextResponse.json(
				{
					success: false,
					error: 'Destino inválido. Use "meta" ou "minio".',
				},
				{ status: 400 },
			);
		}
	} catch (error: any) {
		console.error("Erro geral no processamento do upload:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Erro desconhecido no processamento",
			},
			{ status: 500 },
		);
	}
}
