"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadMetaMediaAndUploadToMinio = downloadMetaMediaAndUploadToMinio;
exports.isMetaMediaUrl = isMetaMediaUrl;
exports.getPublicMediaUrl = getPublicMediaUrl;
const axios_1 = __importDefault(require("axios"));
const lib_1 = require("@/app/lib");
const minio_1 = require("./minio");
const db_1 = require("@/lib/db");
/**
 * Baixa uma mídia da Meta e faz upload para o MinIO
 * @param mediaUrl URL da mídia no servidor da Meta
 * @param templateId ID do template
 * @param templateName Nome do template
 * @param userId ID do usuário
 * @returns URL pública da mídia no MinIO
 */
async function downloadMetaMediaAndUploadToMinio(mediaUrl, templateId, templateName, userId) {
    try {
        console.log(`[WhatsAppMedia] Iniciando download e upload para MinIO: ${mediaUrl}`);
        // Verificar se já existe uma URL pública no banco de dados
        const template = await db_1.db.template.findFirst({
            where: {
                whatsappOfficialInfo: {
                    metaTemplateId: templateId
                },
                createdById: userId
            },
            include: {
                whatsappOfficialInfo: true
            }
        });
        if (template?.whatsappOfficialInfo?.components &&
            typeof template.whatsappOfficialInfo.components === 'object' &&
            'publicMediaUrl' in template.whatsappOfficialInfo.components &&
            !isMetaMediaUrl(template.whatsappOfficialInfo.components.publicMediaUrl)) {
            console.log(`[WhatsAppMedia] URL pública já existe no MinIO: ${template.whatsappOfficialInfo.components.publicMediaUrl}`);
            return template.whatsappOfficialInfo.components.publicMediaUrl;
        }
        // Obter configuração do WhatsApp para acessar a API da Meta
        const whatsappConfig = await (0, lib_1.getWhatsAppConfig)(userId);
        // Baixar a mídia da Meta
        const response = await axios_1.default.get(mediaUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Authorization': `Bearer ${whatsappConfig.whatsappToken}`
            }
        });
        // Detectar o tipo MIME baseado nos primeiros bytes ou na extensão
        const buffer = Buffer.from(response.data);
        const mimeType = response.headers['content-type'] || 'application/octet-stream';
        // Extrair a extensão da URL
        const fileExtension = mediaUrl.split('.').pop()?.toLowerCase() || '';
        // Criar um nome de arquivo com o ID do template
        const fileName = `whatsapp_media_${templateId}_${Date.now()}.${fileExtension}`;
        console.log(`[WhatsAppMedia] Fazendo upload para MinIO: ${fileName} (${mimeType})`);
        // Fazer upload para o MinIO
        const uploadResult = await (0, minio_1.uploadToMinIO)(buffer, fileName, mimeType);
        // Atualizar o banco de dados com a URL pública
        if (template) {
            const existingComponents = template.whatsappOfficialInfo?.components || {};
            const componentsWithMedia = {
                ...existingComponents,
                publicMediaUrl: uploadResult.url
            };
            await db_1.db.template.update({
                where: { id: template.id },
                data: {
                    whatsappOfficialInfo: {
                        update: {
                            components: componentsWithMedia
                        }
                    }
                }
            });
        }
        console.log(`[WhatsAppMedia] Upload concluído: ${uploadResult.url}`);
        return uploadResult.url;
    }
    catch (error) {
        console.error('[WhatsAppMedia] Erro ao processar mídia:', error);
        throw new Error(`Falha ao processar mídia: ${error}`);
    }
}
/**
 * Verifica se uma URL é da Meta (whatsapp.net)
 * @param url URL para verificar
 * @returns true se for uma URL da Meta
 */
function isMetaMediaUrl(url) {
    return url.includes('whatsapp.net') || url.includes('fbcdn.net') || url.includes('facebook.com');
}
/**
 * Obtém a URL pública da mídia (do MinIO ou da Meta)
 * @param templateId ID do template
 * @param userId ID do usuário
 * @param metaUrl URL da mídia na Meta (opcional)
 * @returns URL pública da mídia
 */
async function getPublicMediaUrl(templateId, userId, metaUrl) {
    try {
        // Verificar se existe URL pública no banco de dados
        const template = await db_1.db.template.findFirst({
            where: {
                whatsappOfficialInfo: {
                    metaTemplateId: templateId
                },
                createdById: userId
            },
            include: {
                whatsappOfficialInfo: true
            }
        });
        // Se já tiver URL pública, retorná-la
        if (template?.whatsappOfficialInfo?.components &&
            typeof template.whatsappOfficialInfo.components === 'object' &&
            'publicMediaUrl' in template.whatsappOfficialInfo.components) {
            return template.whatsappOfficialInfo.components.publicMediaUrl;
        }
        // Se foi fornecida uma URL da Meta, baixar e fazer upload
        if (metaUrl && isMetaMediaUrl(metaUrl)) {
            const templateName = template?.name || 'desconhecido';
            return await downloadMetaMediaAndUploadToMinio(metaUrl, templateId, templateName, userId);
        }
        return null;
    }
    catch (error) {
        console.error('[WhatsAppMedia] Erro ao obter URL pública:', error);
        return null;
    }
}
