// app/api/admin/mtf-diamante/template-info/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { mtfDiamanteConfig } from '@/app/config/mtf-diamante';
import prisma from '@/lib/prisma';
import { downloadMetaMediaAndUploadToMinio, isMetaMediaUrl } from '@/lib/whatsapp-media';

/**
 * Função auxiliar para obter as configurações da API do WhatsApp.
 * Certifique-se de definir as variáveis de ambiente:
 *  - FB_GRAPH_API_BASE (ex.: https://graph.facebook.com/v22.0)
 *  - WHATSAPP_BUSINESS_ID (deve ser o ID da conta do WhatsApp, WABA)
 *  - WHATSAPP_TOKEN (Token do System User com as permissões necessárias)
 */
function getWhatsAppApiConfig() {
  return {
    fbGraphApiBase:
      process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
    whatsappBusinessAccountId:
      process.env.WHATSAPP_BUSINESS_ID || '294585820394901',
    whatsappToken:
      process.env.WHATSAPP_TOKEN ||
      mtfDiamanteConfig.whatsappToken ||
      '',
  };
}

/**
 * Função para obter detalhes do template diretamente da API do WhatsApp
 * e sincronizá‑lo no banco de dados.
 */
async function getWhatsAppTemplateDetailsFromAPI(templateId: string, userId: string) {
  const config = getWhatsAppApiConfig();
  const url = `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates?fields=name,status,category,language,components,sub_category,quality_score,correct_category,cta_url_link_tracking_opted_out,library_template_name,message_send_ttl_seconds,parameter_format,previous_category&limit=1000`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json',
    }
  });
  if (!response.data || !response.data.data || response.data.data.length === 0) {
    throw new Error('Nenhum template encontrado na API');
  }
  const templateFromApi = response.data.data.find((t: any) => t.id === templateId);
  if (!templateFromApi) {
    throw new Error(`Template com ID ${templateId} não encontrado na API`);
  }
  // --- LÓGICA OTIMIZADA DE SINCRONIZAÇÃO DE MÍDIA ---
  let publicMediaUrl: string | null = null;
  
  // Primeiro, verificar se já existe uma URL pública no banco de dados
  const usuarioChatwit = await prisma.usuarioChatwit.findUnique({ where: { appUserId: userId } });
  if (!usuarioChatwit) throw new Error('Usuário Chatwit não encontrado');
  
  const existingTemplate = await prisma.whatsAppTemplate.findFirst({
    where: {
      templateId: templateId,
      usuarioChatwitId: usuarioChatwit.id,
    },
    select: { publicMediaUrl: true }
  });
  
  const headerComponent = templateFromApi.components.find(
    (c: any) => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)
  );
  
  if (headerComponent) {
    const mediaUrlFromMeta = headerComponent.example?.header_handle?.[0];
    
    // Se já existe uma URL pública no MinIO, usar ela
    if (existingTemplate?.publicMediaUrl && !isMetaMediaUrl(existingTemplate.publicMediaUrl)) {
      publicMediaUrl = existingTemplate.publicMediaUrl;
      console.log(`[TemplateInfo] Usando mídia já armazenada no MinIO: ${publicMediaUrl}`);
    }
    // Caso contrário, se a URL é da Meta, baixar e fazer upload
    else if (mediaUrlFromMeta && isMetaMediaUrl(mediaUrlFromMeta)) {
      try {
        publicMediaUrl = await downloadMetaMediaAndUploadToMinio(
          mediaUrlFromMeta,
          templateId,
          templateFromApi.name,
          userId
        );
        console.log(`[TemplateInfo] Mídia sincronizada para o MinIO: ${publicMediaUrl}`);
      } catch (e) {
        console.error('[TemplateInfo] Falha ao sincronizar mídia para o MinIO:', e);
        // Se falhar, manter a URL existente se houver
        if (existingTemplate?.publicMediaUrl) {
          publicMediaUrl = existingTemplate.publicMediaUrl;
        }
      }
    }
    // Se não é da Meta, usar a URL diretamente
    else if (mediaUrlFromMeta) {
      publicMediaUrl = mediaUrlFromMeta;
      console.log(`[TemplateInfo] Usando mídia externa: ${publicMediaUrl}`);
    }
  }
  // --- FIM DA LÓGICA OTIMIZADA ---
  try {
    const dataToSave = {
      name: templateFromApi.name,
      category: templateFromApi.category,
      status: templateFromApi.status,
      language: templateFromApi.language,
      components: templateFromApi.components,
      publicMediaUrl: publicMediaUrl,
      lastEdited: new Date(),
    };
    await prisma.whatsAppTemplate.upsert({
      where: {
        templateId_usuarioChatwitId: {
          templateId: templateId,
          usuarioChatwitId: usuarioChatwit.id,
        },
      },
      update: dataToSave,
      create: {
        templateId: templateId,
        usuarioChatwitId: usuarioChatwit.id,
        ...dataToSave,
      },
    });
    console.log(`Template ${templateFromApi.name} sincronizado no banco de dados.`);
  } catch (dbError) {
    console.error('Erro ao salvar template no banco:', dbError);
  }
  templateFromApi.publicMediaUrl = publicMediaUrl;
  return templateFromApi;
}

/**
 * Endpoint GET /api/admin/mtf-diamante/template-info
 * Recebe o parâmetro de query "template" (ID do template) e retorna os detalhes.
 * Apenas usuários autenticados com role ADMIN têm acesso.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
    const url = new URL(req.url);
    const templateId = url.searchParams.get('template');
    if (!templateId) {
      return NextResponse.json({ error: 'ID do template não fornecido' }, { status: 400 });
    }
    const template = await getWhatsAppTemplateDetailsFromAPI(templateId, session.user.id);
    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      template: {
        ...template,
        publicMediaUrl: template.publicMediaUrl,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar informações do template:', error);
    return NextResponse.json({ error: 'Erro ao buscar informações do template' }, { status: 500 });
  }
}
