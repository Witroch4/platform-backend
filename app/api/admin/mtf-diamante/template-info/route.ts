// app/api/admin/mtf-diamante/template-info/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { mtfDiamanteConfig } from '@/app/config/mtf-diamante';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();
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
 * @param templateId ID do template
 * @param userId ID do usuário
 * @param forceRefresh Se true, força o download da mídia mesmo se já existir no MinIO
 */
async function getWhatsAppTemplateDetailsFromAPI(templateId: string, userId: string, forceRefresh = false) {
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
  const existingTemplate = await prisma.template.findFirst({
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
  
  const headerComponent = templateFromApi.components.find(
    (c: any) => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)
  );
  
  if (headerComponent) {
    console.log(`[TemplateInfo] Header component encontrado para template ${templateFromApi.name}:`, JSON.stringify(headerComponent, null, 2));
    
    // Tentar múltiplas localizações para a URL da mídia
    const mediaUrlFromMeta = 
      headerComponent.example?.header_handle?.[0] ||
      headerComponent.example?.header_url?.[0] ||
      headerComponent.url ||
      headerComponent.example?.url ||
      null;
    
    console.log(`[TemplateInfo] URL de mídia extraída: ${mediaUrlFromMeta}`);
    
    // Verificar se existe URL pública válida no banco
    const existingPublicUrl = existingTemplate?.whatsappOfficialInfo?.components && 
        typeof existingTemplate.whatsappOfficialInfo.components === 'object' &&
        'publicMediaUrl' in existingTemplate.whatsappOfficialInfo.components
        ? existingTemplate.whatsappOfficialInfo.components.publicMediaUrl as string | null
        : null;
    
    // Se já existe uma URL pública válida no MinIO E não está sendo forçada atualização, usar ela
    if (existingPublicUrl && !isMetaMediaUrl(existingPublicUrl) && !forceRefresh) {
      publicMediaUrl = existingPublicUrl;
      console.log(`[TemplateInfo] Usando mídia já armazenada no MinIO: ${publicMediaUrl}`);
    }
    // Se forceRefresh OU (a URL é null OU é da Meta), tentar baixar e fazer upload
    else if (mediaUrlFromMeta && isMetaMediaUrl(mediaUrlFromMeta) && (forceRefresh || !existingPublicUrl || isMetaMediaUrl(existingPublicUrl))) {
      try {
        console.log(`[TemplateInfo] ${forceRefresh ? 'Refresh forçado,' : existingPublicUrl === null ? 'URL null detectada, tentando' : 'URL da Meta detectada,'} fazer download e upload para MinIO...`);
        publicMediaUrl = await downloadMetaMediaAndUploadToMinio(
          mediaUrlFromMeta,
          templateId,
          templateFromApi.name,
          userId
        );
        console.log(`[TemplateInfo] Mídia sincronizada para o MinIO: ${publicMediaUrl}`);
      } catch (e) {
        console.error('[TemplateInfo] Falha ao sincronizar mídia para o MinIO:', e);
        // Se falhar, manter a URL existente se houver e não for null
        if (existingPublicUrl) {
          publicMediaUrl = existingPublicUrl;
        }
      }
    }
    // Se não há URL da Meta mas existe URL externa válida, usar ela
    else if (mediaUrlFromMeta && !isMetaMediaUrl(mediaUrlFromMeta)) {
      publicMediaUrl = mediaUrlFromMeta;
      console.log(`[TemplateInfo] Usando mídia externa: ${publicMediaUrl}`);
    }
    // Se não há mediaUrlFromMeta, verificar se há URL salva (mesmo que null)
    else if (!mediaUrlFromMeta) {
      console.log(`[TemplateInfo] ⚠️ Nenhum header_handle encontrado no componente HEADER do template ${templateFromApi.name}`);
      publicMediaUrl = existingPublicUrl;
    }
  }
  // --- FIM DA LÓGICA OTIMIZADA ---
  
  try {
    // Atualizar ou criar o template no banco de dados
    const componentsWithMedia = {
      ...templateFromApi.components,
      publicMediaUrl: publicMediaUrl
    };
    
    if (existingTemplate) {
      // Atualizar template existente
      await prisma.template.update({
        where: { id: existingTemplate.id },
        data: {
          name: templateFromApi.name,
          status: templateFromApi.status as any,
          language: templateFromApi.language || 'pt_BR',
          whatsappOfficialInfo: {
            update: {
              status: templateFromApi.status,
              category: templateFromApi.category,
              components: componentsWithMedia,
            }
          }
        }
      });
    } else {
      // Criar novo template
      await prisma.template.create({
        data: {
          name: templateFromApi.name,
          status: templateFromApi.status as any,
          language: templateFromApi.language || 'pt_BR',
          type: 'WHATSAPP_OFFICIAL' as any,
          scope: 'PRIVATE' as any,
          createdById: userId,
          whatsappOfficialInfo: {
            create: {
              metaTemplateId: templateId,
              status: templateFromApi.status,
              category: templateFromApi.category,
              components: componentsWithMedia,
            }
          }
        }
      });
    }
    
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
 * 
 * Query params opcionais:
 * - forceRefresh: true para forçar atualização da mídia mesmo se já existir no MinIO
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
    const templateId = url.searchParams.get('templateId') || url.searchParams.get('template');
    const forceRefresh = url.searchParams.get('forceRefresh') === 'true';
    
    if (!templateId) {
      return NextResponse.json({ error: 'ID do template não fornecido' }, { status: 400 });
    }

    // Primeiro, tentar buscar do banco de dados local
    const localTemplate = await prisma.template.findUnique({
      where: { id: templateId },
      include: {
        whatsappOfficialInfo: true
      }
    });

    if (localTemplate && !forceRefresh) {
      return NextResponse.json({
        success: true,
        ...localTemplate,
        template: localTemplate // Para compatibilidade
      });
    }

    // Se não encontrar localmente OU se forceRefresh, buscar da API (comportamento original)
    const template = await getWhatsAppTemplateDetailsFromAPI(templateId, session.user.id, forceRefresh);
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
