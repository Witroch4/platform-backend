import { type NextRequest, NextResponse } from "next/server";
import { extractObjectKeyFromUrl, generatePresignedUrl } from "@/lib/minio";

/**
 * API para gerar URLs pré-assinadas para URLs existentes do MinIO
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "URL não fornecida" },
        { status: 400 }
      );
    }

    console.log(`[PresignedURL] Gerando URL pré-assinada para: ${url}`);

    // Extrai a chave do objeto da URL
    const objectKey = extractObjectKeyFromUrl(url);
    console.log(`[PresignedURL] Chave do objeto extraída: ${objectKey}`);

    // Gera a URL pré-assinada
    const presignedUrl = await generatePresignedUrl(objectKey);
    console.log(`[PresignedURL] URL pré-assinada gerada: ${presignedUrl}`);

    return NextResponse.json({
      original_url: url,
      presigned_url: presignedUrl,
      object_key: objectKey,
      expires_in: 86400, // 24 horas em segundos
    });
  } catch (error: any) {
    console.error("[PresignedURL] Erro:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}