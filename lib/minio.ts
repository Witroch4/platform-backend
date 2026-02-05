// lib/minio.ts
import { S3Client, PutObjectCommand, type PutObjectCommandOutput, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

// Configuração do cliente S3 para MinIO
// Nota: O AWS SDK v3 já usa keep-alive por padrão internamente
const s3Client = new S3Client({
  region: 'us-east-1', // Região padrão, pode ser qualquer uma para MinIO
  endpoint: `https://${process.env.S3_ENDPOINT || 'objstoreapi.witdev.com.br'}`,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'WOmhXdGA7q45h6eUd76E',
    secretAccessKey: process.env.S3_SECRET_KEY || 'VBFbOh6VMW1flrwyzWS4CoR4dtibpfeSRwYhjkbs',
  },
  forcePathStyle: true, // Necessário para MinIO
  maxAttempts: 3, // Retry automático do SDK
});

const BUCKET_NAME = process.env.S3_BUCKET || 'socialwise';
const HOST = process.env.S3_ENDPOINT || 'objstoreapi.witdev.com.br';

/**
 * Sanitiza o nome do arquivo removendo caracteres não suportados pelo MinIO
 * @param fileName Nome do arquivo original
 * @returns Nome do arquivo sanitizado
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    // Remove parâmetros de query string e âncoras
    .split('?')[0]
    .split('#')[0]
    .split('&')[0]
    // Substitui todos os caracteres especiais por underscores
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    // Remove múltiplos underscores consecutivos
    .replace(/_+/g, '_')
    // Remove underscores no início e fim
    .replace(/^_+|_+$/g, '')
    // Limita o tamanho do nome (mantém apenas os primeiros 100 caracteres)
    .substring(0, 100);
}

/**
 * Garante que a URL tenha o protocolo HTTPS
 * @param host Hostname ou URL
 * @returns URL com protocolo HTTPS garantido
 */
function ensureHttpsProtocol(host: string): string {
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host;
  } else {
    return `https://${host}`;
  }
}

/**
 * Constrói a URL completa para um objeto no MinIO
 * @param host Nome do host
 * @param bucket Nome do bucket
 * @param key Chave/nome do objeto
 * @returns URL completa com protocolo
 */
function buildMinioUrl(host: string, bucket: string, key: string): string {
  const baseUrl = ensureHttpsProtocol(host);
  return `${baseUrl}/${bucket}/${key}`;
}

/**
 * Classe para gerenciar operações no MinIO/S3
 */
export class MinioClient {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName?: string) {
    this.s3Client = s3Client;
    this.bucketName = bucketName || BUCKET_NAME;
  }

  /**
   * Remove um objeto do bucket
   * @param bucket Nome do bucket (opcional, usa o padrão se não especificado)
   * @param objectKey Chave/nome do objeto a ser removido
   * @returns Promise resolvida quando o objeto for removido
   */
  async removeObject(bucket: string, objectKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      });

      await this.s3Client.send(command);
      console.log(`[MinIO] Objeto removido com sucesso: ${bucket}/${objectKey}`);
    } catch (error) {
      console.error(`[MinIO] Erro ao remover objeto ${bucket}/${objectKey}:`, error);
      throw new Error(`Falha ao remover objeto: ${error}`);
    }
  }

  /**
   * Instância única da classe MinioClient (padrão Singleton)
   */
  static getInstance(bucketName?: string): MinioClient {
    return new MinioClient(bucketName);
  }
}

/**
 * Converte um Buffer ou ArrayBuffer para um Readable Stream
 */
function bufferToStream(buffer: Buffer | ArrayBuffer): Readable {
  const readable = new Readable();
  // _read é necessário mas pode ficar vazio
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

interface UploadResponse {
  url: string;
  mime_type: string;
  s3RawResponse: PutObjectCommandOutput;
  thumbnail_url?: string;
}

/**
 * Faz upload direto de um arquivo para o MinIO sem processamento adicional
 * Função interna usada para evitar recursão em thumbnails
 */
async function uploadFileDirectToMinIO(
  file: Buffer | ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<UploadResponse> {
  try {
    // Calcula o tamanho do arquivo
    const fileSize = file instanceof Buffer ? file.length : file.byteLength;

    // Converte o arquivo para um stream
    const fileStream = bufferToStream(file);

    // Configura o comando de upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileStream,
      ContentType: mimeType || 'application/octet-stream',
      ContentLength: fileSize,
    });

    // Executa o upload
    const response = await s3Client.send(command);
    console.log('MinIO Direct Upload Response:', response);

    // Monta a URL final com protocolo garantido
    const url = buildMinioUrl(HOST, BUCKET_NAME, fileName);

    return {
      url,
      mime_type: mimeType,
      s3RawResponse: response,
    };
  } catch (error) {
    console.error('Erro ao fazer upload direto para o MinIO:', error);
    throw new Error(`Falha ao fazer upload direto para o MinIO: ${error}`);
  }
}

/**
 * Faz upload de um arquivo para o MinIO
 * @param file Arquivo a ser enviado (Buffer ou ArrayBuffer)
 * @param fileName Nome original do arquivo (opcional)
 * @param mimeType Tipo MIME do arquivo
 * @param generateThumbnail Flag para indicar se deve gerar thumbnail (padrão: true)
 * @returns Objeto com URL, tipo MIME e a resposta completa do MinIO
 */
export async function uploadToMinIO(
  file: Buffer | ArrayBuffer,
  fileName?: string,
  mimeType?: string,
  generateThumbnail = true
): Promise<UploadResponse> {
  try {
    // Calcula o tamanho do arquivo para evitar cabeçalho "undefined"
    const fileSize = file instanceof Buffer ? file.length : file.byteLength;

    // Gera um nome único para o arquivo com sanitização robusta
    const uniqueFileName = fileName
      ? `${uuidv4()}-${sanitizeFileName(fileName)}`
      : `${uuidv4()}.${mimeType?.split('/')[1] || 'bin'}`;

    // Converte o arquivo para um stream
    const fileStream = bufferToStream(file);

    // Configura o comando de upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: uniqueFileName,
      Body: fileStream,
      ContentType: mimeType || 'application/octet-stream',
      ContentLength: fileSize, // IMPORTANTE para evitar erro de x-amz-decoded-content-length
    });

    // Converte ArrayBuffer para Buffer se necessário (para thumbnail)
    const imageBuffer = file instanceof Buffer ? file : Buffer.from(new Uint8Array(file));

    // OTIMIZAÇÃO: Gera thumbnail EM PARALELO com upload principal
    const shouldGenerateThumbnail = generateThumbnail && mimeType && mimeType.startsWith('image/');

    const [response, thumbnailBuffer] = await Promise.all([
      // Upload principal
      s3Client.send(command),
      // Geração de thumbnail (em paralelo)
      shouldGenerateThumbnail
        ? sharp(imageBuffer)
            .resize(150, null, { fit: 'inside' })
            .png({ compressionLevel: 6 }) // Compressão balanceada
            .toBuffer()
            .catch(err => {
              console.error('[MinIO] Erro ao gerar thumbnail buffer:', err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    console.log('MinIO Upload Response:', response);

    // Monta a URL final com protocolo garantido
    const url = buildMinioUrl(HOST, BUCKET_NAME, uniqueFileName);

    // Resultado padrão sem thumbnail
    const result: UploadResponse = {
      url,
      mime_type: mimeType || 'application/octet-stream',
      s3RawResponse: response,
    };

    // Faz upload da thumbnail se foi gerada com sucesso
    if (thumbnailBuffer) {
      try {
        const thumbnailFileName = `thumb_${uniqueFileName}`;
        const thumbnailResult = await uploadFileDirectToMinIO(
          thumbnailBuffer,
          thumbnailFileName,
          mimeType || 'image/png'
        );
        result.thumbnail_url = thumbnailResult.url;
        console.log(`[MinIO] Thumbnail gerada e enviada: ${thumbnailResult.url}`);
      } catch (thumbError) {
        console.error('[MinIO] Erro ao fazer upload da thumbnail:', thumbError);
        // Continua sem thumbnail em caso de erro
      }
    }

    return result;
  } catch (error) {
    console.error('Erro ao fazer upload para o MinIO:', error);
    throw new Error(`Falha ao fazer upload para o MinIO: ${error}`);
  }
}

/**
 * Faz upload com retry e backoff exponencial
 * @param file Arquivo a ser enviado
 * @param fileName Nome do arquivo
 * @param mimeType Tipo MIME
 * @param maxRetries Número máximo de tentativas (padrão: 3)
 * @param generateThumbnail Flag para gerar thumbnail (padrão: true)
 */
export async function uploadToMinIOWithRetry(
  file: Buffer | ArrayBuffer,
  fileName?: string,
  mimeType?: string,
  maxRetries = 3,
  generateThumbnail = true
): Promise<UploadResponse> {
  let lastError: Error | null = null;
  const initialDelayMs = 100;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await uploadToMinIO(file, fileName, mimeType, generateThumbnail);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.warn(`[MinIO] Tentativa ${attempt + 1} falhou, retry em ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Upload failed after max retries');
}

/**
 * Faz upload de múltiplos arquivos para o MinIO com limite de concorrência
 * @param files Array de arquivos a serem enviados
 * @param concurrency Número máximo de uploads simultâneos (padrão: 6)
 * @returns Array de objetos com URL, tipo MIME e resposta completa de cada upload
 */
export async function uploadMultipleToMinIO(
  files: Array<{ buffer: Buffer | ArrayBuffer; fileName?: string; mimeType?: string }>,
  concurrency = 6
): Promise<Array<UploadResponse>> {
  try {
    const results: UploadResponse[] = [];

    // Processa em batches para limitar concorrência
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(file => uploadToMinIOWithRetry(file.buffer, file.fileName, file.mimeType))
      );
      results.push(...batchResults);

      // Log de progresso para batches grandes
      if (files.length > concurrency) {
        console.log(`[MinIO] Upload batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(files.length / concurrency)} concluído`);
      }
    }

    return results;
  } catch (error) {
    console.error('Erro ao fazer upload múltiplo para o MinIO:', error);
    throw new Error(`Falha ao fazer upload múltiplo para o MinIO: ${error}`);
  }
}

/**
 * Gera uma URL pré-assinada para acesso direto a um objeto no MinIO
 * @param objectKey Chave do objeto no bucket
 * @param expiresIn Tempo de expiração em segundos (padrão: 24 horas)
 * @returns URL pré-assinada
 */
export async function generatePresignedUrl(objectKey: string, expiresIn = 86400): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    console.log(`[MinIO] URL pré-assinada gerada para ${objectKey}:`, url);

    return url;
  } catch (error) {
    console.error(`[MinIO] Erro ao gerar URL pré-assinada para ${objectKey}:`, error);
    throw new Error(`Falha ao gerar URL pré-assinada: ${error}`);
  }
}

/**
 * Extrai a chave do objeto de uma URL do MinIO
 * @param url URL completa do MinIO
 * @returns Chave do objeto
 */
export function extractObjectKeyFromUrl(url: string): string {
  try {
    // Garante que a URL tenha protocolo para evitar erros
    const fullUrl = ensureHttpsProtocol(url);
    
    // Remove o protocolo e o domínio para obter apenas o caminho
    const urlObj = new URL(fullUrl);
    const pathParts = urlObj.pathname.split('/');

    // Remove a primeira parte vazia e o nome do bucket
    const bucketName = process.env.S3_BUCKET || 'socialwise';
    const bucketIndex = pathParts.findIndex(part => part === bucketName);

    if (bucketIndex === -1) {
      throw new Error(`Bucket ${bucketName} não encontrado na URL`);
    }

    // Junta as partes restantes do caminho para formar a chave do objeto
    const objectKey = pathParts.slice(bucketIndex + 1).join('/');
    return objectKey;
  } catch (error) {
    console.error(`[MinIO] Erro ao extrair chave do objeto da URL ${url}:`, error);
    // Fallback: tenta extrair a parte final da URL
    const parts = url.split('/');
    return parts[parts.length - 1];
  }
}

/**
 * Corrige a URL do MinIO para garantir que use o endpoint correto
 * @param url URL original
 * @returns URL corrigida
 */
export function correctMinioUrl(url: string): string {
  try {
    // Se a URL estiver vazia ou não for uma string, retorna como está
    if (!url || typeof url !== 'string') return url;
    
    // Corrige o endpoint se necessário (objstore -> objstoreapi)
    const correctedUrl = url.replace('objstore.witdev.com.br', 'objstoreapi.witdev.com.br');
    
    // Garante que a URL tenha o protocolo HTTPS
    return ensureHttpsProtocol(correctedUrl);
  } catch (error) {
    console.error(`[MinIO] Erro ao corrigir URL: ${url}`, error);
    return url; // Em caso de erro, retorna a URL original
  }
}
