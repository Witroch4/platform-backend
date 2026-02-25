import { type NextRequest, NextResponse } from "next/server";
import { extractBucketAndKey, generatePresignedUrl } from "@/lib/minio";

const MINIO_HOST = process.env.S3_ENDPOINT || "objstoreapi.witdev.com.br";

/**
 * Resolve URL do Chatwit Active Storage para URL direta do MinIO.
 * Segue o redirect 302 e extrai bucket + object key, retornando URL limpa.
 */
async function resolveActiveStorageUrl(activeStorageUrl: string): Promise<string> {
	const response = await fetch(activeStorageUrl, { method: "HEAD", redirect: "manual" });
	const location = response.headers.get("location");

	if (!location || !location.includes(MINIO_HOST)) {
		throw new Error(`Redirect não aponta para MinIO: ${location}`);
	}

	// Strip query params (presigned params) — manter apenas host/bucket/key
	return location.split("?")[0];
}

/**
 * API para gerar URLs pré-assinadas para arquivos no MinIO.
 * Suporta:
 * - URLs diretas do MinIO (qualquer bucket: socialwise, chatwoot-storage, etc.)
 * - URLs do Chatwit Active Storage (resolve redirect → MinIO → presigned)
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		let { url } = body;

		if (!url) {
			return NextResponse.json({ error: "URL não fornecida" }, { status: 400 });
		}

		// Se é URL Active Storage, resolver para MinIO primeiro
		if (url.includes("/rails/active_storage/")) {
			console.log(`[PresignedURL] Resolvendo Active Storage URL...`);
			url = await resolveActiveStorageUrl(url);
			console.log(`[PresignedURL] Resolvido para: ${url}`);
		}

		// Extrai bucket e chave do objeto da URL MinIO
		const { bucket, objectKey } = extractBucketAndKey(url);
		console.log(`[PresignedURL] Bucket: ${bucket}, Key: ${objectKey}`);

		// Gera a URL pré-assinada para o bucket correto
		const presignedUrl = await generatePresignedUrl(objectKey, 86400, bucket);

		return NextResponse.json({
			original_url: body.url,
			presigned_url: presignedUrl,
			object_key: objectKey,
			bucket,
			expires_in: 86400,
		});
	} catch (error: any) {
		console.error("[PresignedURL] Erro:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
