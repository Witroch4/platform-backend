"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioClient = void 0;
exports.uploadToMinIO = uploadToMinIO;
exports.uploadMultipleToMinIO = uploadMultipleToMinIO;
exports.generatePresignedUrl = generatePresignedUrl;
exports.extractObjectKeyFromUrl = extractObjectKeyFromUrl;
exports.correctMinioUrl = correctMinioUrl;
// lib/minio.ts
const client_s3_1 = require("@aws-sdk/client-s3");
const uuid_1 = require("uuid");
const stream_1 = require("stream");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const sharp_1 = __importDefault(require("sharp"));
// Configuração do cliente S3 para MinIO
const s3Client = new client_s3_1.S3Client({
    region: 'us-east-1', // Região padrão, pode ser qualquer uma para MinIO
    endpoint: `https://${process.env.S3Endpoint || 'objstoreapi.witdev.com.br'}`,
    credentials: {
        accessKeyId: process.env.S3AccessKey || 'WOmhXdGA7q45h6eUd76E',
        secretAccessKey: process.env.S3SecretKey || 'VBFbOh6VMW1flrwyzWS4CoR4dtibpfeSRwYhjkbs',
    },
    forcePathStyle: true, // Necessário para MinIO
});
const BUCKET_NAME = process.env.S3Bucket || 'chatwit-social';
const HOST = process.env.S3Endpoint || 'objstoreapi.witdev.com.br';
/**
 * Garante que a URL tenha o protocolo HTTPS
 * @param host Hostname ou URL
 * @returns URL com protocolo HTTPS garantido
 */
function ensureHttpsProtocol(host) {
    if (host.startsWith('http://') || host.startsWith('https://')) {
        return host;
    }
    else {
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
function buildMinioUrl(host, bucket, key) {
    const baseUrl = ensureHttpsProtocol(host);
    return `${baseUrl}/${bucket}/${key}`;
}
/**
 * Classe para gerenciar operações no MinIO/S3
 */
class MinioClient {
    s3Client;
    bucketName;
    constructor(bucketName) {
        this.s3Client = s3Client;
        this.bucketName = bucketName || BUCKET_NAME;
    }
    /**
     * Remove um objeto do bucket
     * @param bucket Nome do bucket (opcional, usa o padrão se não especificado)
     * @param objectKey Chave/nome do objeto a ser removido
     * @returns Promise resolvida quando o objeto for removido
     */
    async removeObject(bucket, objectKey) {
        try {
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: bucket,
                Key: objectKey,
            });
            await this.s3Client.send(command);
            console.log(`[MinIO] Objeto removido com sucesso: ${bucket}/${objectKey}`);
        }
        catch (error) {
            console.error(`[MinIO] Erro ao remover objeto ${bucket}/${objectKey}:`, error);
            throw new Error(`Falha ao remover objeto: ${error}`);
        }
    }
    /**
     * Instância única da classe MinioClient (padrão Singleton)
     */
    static getInstance(bucketName) {
        return new MinioClient(bucketName);
    }
}
exports.MinioClient = MinioClient;
/**
 * Converte um Buffer ou ArrayBuffer para um Readable Stream
 */
function bufferToStream(buffer) {
    const readable = new stream_1.Readable();
    // _read é necessário mas pode ficar vazio
    readable._read = () => { };
    readable.push(buffer);
    readable.push(null);
    return readable;
}
/**
 * Faz upload direto de um arquivo para o MinIO sem processamento adicional
 * Função interna usada para evitar recursão em thumbnails
 */
async function uploadFileDirectToMinIO(file, fileName, mimeType) {
    try {
        // Calcula o tamanho do arquivo
        const fileSize = file instanceof Buffer ? file.length : file.byteLength;
        // Converte o arquivo para um stream
        const fileStream = bufferToStream(file);
        // Configura o comando de upload
        const command = new client_s3_1.PutObjectCommand({
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
    }
    catch (error) {
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
async function uploadToMinIO(file, fileName, mimeType, generateThumbnail = true) {
    try {
        // Calcula o tamanho do arquivo para evitar cabeçalho "undefined"
        const fileSize = file instanceof Buffer ? file.length : file.byteLength;
        // Gera um nome único para o arquivo
        const uniqueFileName = fileName
            ? `${(0, uuid_1.v4)()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            : `${(0, uuid_1.v4)()}.${mimeType?.split('/')[1] || 'bin'}`;
        // Converte o arquivo para um stream
        const fileStream = bufferToStream(file);
        // Configura o comando de upload
        const command = new client_s3_1.PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: uniqueFileName,
            Body: fileStream,
            ContentType: mimeType || 'application/octet-stream',
            ContentLength: fileSize, // IMPORTANTE para evitar erro de x-amz-decoded-content-length
        });
        // Executa o upload e obtém a resposta completa do S3/MinIO
        const response = await s3Client.send(command);
        console.log('MinIO Upload Response:', response);
        // Monta a URL final com protocolo garantido
        const url = buildMinioUrl(HOST, BUCKET_NAME, uniqueFileName);
        // Resultado padrão sem thumbnail
        const result = {
            url,
            mime_type: mimeType || 'application/octet-stream',
            s3RawResponse: response,
        };
        // Gera e faz upload da thumbnail se for uma imagem e a flag estiver ativada
        if (generateThumbnail && mimeType && mimeType.startsWith('image/')) {
            try {
                // Converte ArrayBuffer para Buffer se necessário
                const imageBuffer = file instanceof Buffer ? file : Buffer.from(new Uint8Array(file));
                // Gera thumbnail com 150px de largura (como no código original)
                const thumbnailBuffer = await (0, sharp_1.default)(imageBuffer)
                    .resize(150, null, { fit: 'inside' })
                    .toBuffer();
                // Nome da thumbnail com prefixo específico
                const thumbnailFileName = `thumb_${uniqueFileName}`;
                // Usa o método direto para evitar recursão
                const thumbnailResult = await uploadFileDirectToMinIO(thumbnailBuffer, thumbnailFileName, mimeType);
                // Adiciona a URL da thumbnail ao resultado
                result.thumbnail_url = thumbnailResult.url;
                console.log(`[MinIO] Thumbnail gerada e enviada: ${thumbnailResult.url}`);
            }
            catch (thumbError) {
                console.error('[MinIO] Erro ao gerar thumbnail:', thumbError);
                // Continua sem thumbnail em caso de erro
            }
        }
        return result;
    }
    catch (error) {
        console.error('Erro ao fazer upload para o MinIO:', error);
        throw new Error(`Falha ao fazer upload para o MinIO: ${error}`);
    }
}
/**
 * Faz upload de múltiplos arquivos para o MinIO
 * @param files Array de arquivos a serem enviados
 * @returns Array de objetos com URL, tipo MIME e resposta completa de cada upload
 */
async function uploadMultipleToMinIO(files) {
    try {
        const uploadPromises = files.map(file => uploadToMinIO(file.buffer, file.fileName, file.mimeType));
        return await Promise.all(uploadPromises);
    }
    catch (error) {
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
async function generatePresignedUrl(objectKey, expiresIn = 86400) {
    try {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: objectKey,
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn });
        console.log(`[MinIO] URL pré-assinada gerada para ${objectKey}:`, url);
        return url;
    }
    catch (error) {
        console.error(`[MinIO] Erro ao gerar URL pré-assinada para ${objectKey}:`, error);
        throw new Error(`Falha ao gerar URL pré-assinada: ${error}`);
    }
}
/**
 * Extrai a chave do objeto de uma URL do MinIO
 * @param url URL completa do MinIO
 * @returns Chave do objeto
 */
function extractObjectKeyFromUrl(url) {
    try {
        // Garante que a URL tenha protocolo para evitar erros
        const fullUrl = ensureHttpsProtocol(url);
        // Remove o protocolo e o domínio para obter apenas o caminho
        const urlObj = new URL(fullUrl);
        const pathParts = urlObj.pathname.split('/');
        // Remove a primeira parte vazia e o nome do bucket
        const bucketName = process.env.S3Bucket || 'chatwit-social';
        const bucketIndex = pathParts.findIndex(part => part === bucketName);
        if (bucketIndex === -1) {
            throw new Error(`Bucket ${bucketName} não encontrado na URL`);
        }
        // Junta as partes restantes do caminho para formar a chave do objeto
        const objectKey = pathParts.slice(bucketIndex + 1).join('/');
        return objectKey;
    }
    catch (error) {
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
function correctMinioUrl(url) {
    try {
        // Se a URL estiver vazia ou não for uma string, retorna como está
        if (!url || typeof url !== 'string')
            return url;
        // Corrige o endpoint se necessário (objstore -> objstoreapi)
        let correctedUrl = url.replace('objstore.witdev.com.br', 'objstoreapi.witdev.com.br');
        // Garante que a URL tenha o protocolo HTTPS
        return ensureHttpsProtocol(correctedUrl);
    }
    catch (error) {
        console.error(`[MinIO] Erro ao corrigir URL: ${url}`, error);
        return url; // Em caso de erro, retorna a URL original
    }
}
