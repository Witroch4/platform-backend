import axios from 'axios';
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@/app/lib';
import { uploadToMinIO } from './minio';
import { db } from '@/lib/db';

// Interface estendida para o WhatsAppTemplate com o campo publicMediaUrl
interface WhatsAppTemplateWithMedia {
  id: string;
  name: string;
  templateId: string;
  userId: string;
  publicMediaUrl?: string | null;
  [key: string]: any; // Para outros campos que possam existir
}

/**
 * Baixa uma mídia da Meta e faz upload para o MinIO
 * @param mediaUrl URL da mídia no servidor da Meta
 * @param templateId ID do template
 * @param templateName Nome do template
 * @param userId ID do usuário
 * @returns URL pública da mídia no MinIO
 */
export async function downloadMetaMediaAndUploadToMinio(
  mediaUrl: string,
  templateId: string,
  templateName: string,
  userId: string
): Promise<string> {
  try {
    console.log(`[WhatsAppMedia] Iniciando download e upload para MinIO: ${mediaUrl}`);
    
    // Verificar se já existe uma URL pública no banco de dados
    const template = await db.template.findFirst({
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
        !isMetaMediaUrl(template.whatsappOfficialInfo.components.publicMediaUrl as string)) {
      console.log(`[WhatsAppMedia] URL pública já existe no MinIO: ${template.whatsappOfficialInfo.components.publicMediaUrl}`);
      return template.whatsappOfficialInfo.components.publicMediaUrl as string;
    }
    
    // Obter configuração do WhatsApp para acessar a API da Meta
    const whatsappConfig = await getWhatsAppConfig(userId);
    
    // Baixar a mídia da Meta
    const response = await axios.get(mediaUrl, {
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
    const uploadResult = await uploadToMinIO(buffer, fileName, mimeType);
    
    // Atualizar o banco de dados com a URL pública
      if (template) {
        const existingComponents =
          (template.whatsappOfficialInfo?.components as Record<string, unknown>) || {};
        const componentsWithMedia = {
          ...existingComponents,
          publicMediaUrl: uploadResult.url
        };
      
      await db.template.update({
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
    
  } catch (error) {
    console.error('[WhatsAppMedia] Erro ao processar mídia:', error);
    throw new Error(`Falha ao processar mídia: ${error}`);
  }
}

/**
 * Verifica se uma URL é da Meta (whatsapp.net)
 * @param url URL para verificar
 * @returns true se for uma URL da Meta
 */
export function isMetaMediaUrl(url: string): boolean {
  return url.includes('whatsapp.net') || url.includes('fbcdn.net') || url.includes('facebook.com');
}

/**
 * Obtém a URL pública da mídia (do MinIO ou da Meta)
 * @param templateId ID do template
 * @param userId ID do usuário
 * @param metaUrl URL da mídia na Meta (opcional)
 * @returns URL pública da mídia
 */
export async function getPublicMediaUrl(
  templateId: string,
  userId: string,
  metaUrl?: string
): Promise<string | null> {
  try {
    // Verificar se existe URL pública no banco de dados
    const template = await db.template.findFirst({
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
      return template.whatsappOfficialInfo.components.publicMediaUrl as string;
    }
    
    // Se foi fornecida uma URL da Meta, baixar e fazer upload
    if (metaUrl && isMetaMediaUrl(metaUrl)) {
      const templateName = template?.name || 'desconhecido';
      return await downloadMetaMediaAndUploadToMinio(metaUrl, templateId, templateName, userId);
    }
    
    return null;
  } catch (error) {
    console.error('[WhatsAppMedia] Erro ao obter URL pública:', error);
    return null;
  }
} 