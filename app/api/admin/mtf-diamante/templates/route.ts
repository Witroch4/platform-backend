// app/api/admin/mtf-diamante/templates/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { mtfDiamanteConfig } from '@/app/config/atendimento';
import prisma from '@/lib/prisma';

// Templates mockados para desenvolvimento (caso a API não retorne dados)
const mockTemplates = [
  {
    id: 'mock_consulta',
    name: 'consulta',
    status: 'APPROVED',
    category: 'MARKETING',
    language: 'pt_BR',
    components: [],
  },
  {
    id: 'mock_analise_paga',
    name: 'analise_paga',
    status: 'APPROVED',
    category: 'MARKETING',
    language: 'pt_BR',
    components: [],
  },
  {
    id: 'mock_satisfacao_oab',
    name: 'satisfacao_oab',
    status: 'APPROVED',
    category: 'MARKETING',
    language: 'pt_BR',
    components: [],
  },
  {
    id: 'mock_menu_novo',
    name: 'menu_novo',
    status: 'APPROVED',
    category: 'MARKETING',
    language: 'pt_BR',
    components: [],
  },
  {
    id: 'mock_hello_world',
    name: 'hello_world',
    status: 'APPROVED',
    category: 'UTILITY',
    language: 'en_US',
    components: [],
  },
];

/**
 * Função auxiliar para obter as configurações da API do WhatsApp.
 * As variáveis de ambiente devem conter:
 *  - FB_GRAPH_API_BASE (ex.: https://graph.facebook.com/v22.0)
 *  - WHATSAPP_BUSINESS_ID (deve ser o WABA ID, e não o Business ID)
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
      'EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc',
  };
}

/**
 * Função para salvar ou atualizar um template no banco de dados.
 * Ela mapeia os campos da API para os campos do modelo do Prisma.
 */
async function syncTemplateWithDatabase(template: any, userId: string) {
  try {
    // Verifica se já existe um template com o mesmo templateId
    const existingTemplate = await prisma.whatsAppTemplate.findFirst({
      where: { templateId: template.id.toString() },
    });

    // Mapeia os dados da API para os campos do modelo
    const data = {
      templateId: template.id.toString(),
      name: template.name,
      status: template.status,
      category: template.category || 'UTILITY',
      language: template.language || 'pt_BR',
      components: template.components || {},
      subCategory: template.sub_category || null,
      qualityScore: template.quality_score?.score || null,
      correctCategory: template.correct_category || null,
      ctaUrlLinkTrackingOptedOut:
        template.cta_url_link_tracking_opted_out || null,
      libraryTemplateName: template.library_template_name || null,
      messageSendTtlSeconds: template.message_send_ttl_seconds || null,
      parameterFormat: template.parameter_format || null,
      previousCategory: template.previous_category || null,
      // Atualizamos lastEdited para a data atual; em um fluxo real, pode-se
      // preservar um campo enviado pela API se disponível.
      lastEdited: new Date(),
      // Se houver histórico de edições, preservamos; caso contrário, deixamos nulo.
      editHistory: existingTemplate?.editHistory || undefined,
      userId: userId,
    };

    if (existingTemplate) {
      await prisma.whatsAppTemplate.update({
        where: { id: existingTemplate.id },
        data,
      });
      console.log(`Template ${template.name} atualizado no banco de dados`);
    } else {
      await prisma.whatsAppTemplate.create({
        data,
      });
      console.log(`Template ${template.name} criado no banco de dados`);
    }
    return true;
  } catch (error) {
    console.error(`Erro ao sincronizar template ${template.name}:`, error);
    return false;
  }
}

/**
 * Função para buscar os templates do WhatsApp com paginação e sincronizá‑los no banco.
 */
async function getWhatsAppTemplatesFromAPI(userId: string) {
  try {
    const config = getWhatsAppApiConfig();
    const fbGraphApiBase = 'https://graph.facebook.com/v22.0';

    console.log('Usando configurações da API:', {
      fbGraphApiBase,
      whatsappBusinessAccountId: config.whatsappBusinessAccountId,
      tokenLength: config.whatsappToken?.length,
      tokenStart: config.whatsappToken?.substring(0, 10) + '...',
    });

    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      throw new Error(
        'Credenciais da API do WhatsApp não configuradas. Configure WHATSAPP_BUSINESS_ID e WHATSAPP_TOKEN no .env.'
      );
    }

    // Incluímos na query os campos adicionais para armazenar no banco
    const url = `${fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates?fields=name,status,category,language,components,sub_category,quality_score,correct_category,cta_url_link_tracking_opted_out,library_template_name,message_send_ttl_seconds,parameter_format,previous_category&limit=1000`;
    console.log('Fazendo requisição para:', url);

    const headers = {
      Authorization: `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json',
    };

    console.log('Iniciando requisição para a API do WhatsApp...');
    const response = await axios.get(url, { headers });
    console.log('Resposta completa da API do WhatsApp:', JSON.stringify(response.data));

    if (!response.data) {
      throw new Error('Resposta da API do WhatsApp vazia');
    }
    if (!response.data.data) {
      if (response.data.error) {
        throw new Error(`Erro na API do WhatsApp: ${response.data.error.message}`);
      }
      console.log('Nenhum template real encontrado, usando templates mockados');
      return { templates: mockTemplates, real: false };
    }

    let templates = response.data.data;
    let nextPage = response.data.paging?.next;
    let pageCount = 1;
    const maxPages = 5;

    console.log(`Obtidos ${templates.length} templates na página 1`);
    while (nextPage && pageCount < maxPages) {
      console.log(`Buscando próxima página de templates: ${pageCount + 1}`);
      const nextPageResponse = await axios.get(nextPage, { headers });
      if (nextPageResponse.data && nextPageResponse.data.data) {
        templates = [...templates, ...nextPageResponse.data.data];
        nextPage = nextPageResponse.data.paging?.next;
        pageCount++;
        console.log(`Obtidos ${nextPageResponse.data.data.length} templates na página ${pageCount}`);
      } else {
        break;
      }
    }

    // Mapeia os templates para incluir os campos extras
    const processedTemplates = templates.map((template: any) => {
      console.log(`Processando template: ${template.name}, status: ${template.status}`);
      return {
        id: template.id,
        name: template.name,
        status: template.status,
        category: template.category || 'UTILITY',
        language: template.language || 'pt_BR',
        components: template.components || {},
        sub_category: template.sub_category,
        quality_score: template.quality_score,
        correct_category: template.correct_category,
        cta_url_link_tracking_opted_out: template.cta_url_link_tracking_opted_out,
        library_template_name: template.library_template_name,
        message_send_ttl_seconds: template.message_send_ttl_seconds,
        parameter_format: template.parameter_format,
        previous_category: template.previous_category,
      };
    });

    if (processedTemplates.length === 0) {
      console.log('API retornou array vazio, usando templates mockados');
      return { templates: mockTemplates, real: false };
    }

    // Sincroniza cada template com o banco de dados
    console.log('Sincronizando templates com o banco de dados...');
    for (const template of processedTemplates) {
      await syncTemplateWithDatabase(template, userId);
    }
    console.log(`Obtidos ${processedTemplates.length} templates reais`);
    return { templates: processedTemplates, real: true };
  } catch (error: any) {
    console.error('Erro ao buscar templates do WhatsApp - Detalhes completos:', error);
    if (error.response) {
      console.error('Erro da API do WhatsApp - Resposta:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: JSON.stringify(error.response.data),
        error: error.response.data?.error,
        headers: error.response.headers,
      });
    }
    console.log('Erro ao buscar templates reais, usando templates mockados');
    return { templates: mockTemplates, real: false };
  }
}

/**
 * GET /api/admin/mtf-diamante/templates
 * Retorna os templates do WhatsApp do banco de dados, ou sincroniza com a API da Meta se solicitado.
 * Parâmetros:
 * - refresh: Se true, busca os templates da API da Meta e sincroniza com o banco
 * - category: Filtra por categoria
 * - language: Filtra por idioma
 * - mock: Se true, retorna templates mockados
 */
export async function GET(request: Request) {
  try {
    // Autenticação para obter o userId
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const language = searchParams.get('language');
    const useMock = searchParams.get('mock') === 'true';
    const refresh = searchParams.get('refresh') === 'true';

    console.log('Parâmetros da requisição:', { category, language, useMock, refresh });

    if (useMock) {
      console.log('Usando templates mockados por parâmetro de URL');
      return NextResponse.json({
        success: true,
        templates: mockTemplates,
        isRealData: false,
      });
    }

    // Se refresh for true, busca da API e sincroniza com o banco
    if (refresh) {
      console.log('Refresh solicitado, buscando templates da API Meta...');
      const { templates, real } = await getWhatsAppTemplatesFromAPI(userId);
      console.log(`Após busca da API, obtidos ${templates.length} templates (real: ${real})`);
      
      // Filtra templates por categoria e idioma se informados
      let filteredTemplates = templates;
      if (category && category !== 'all') {
        filteredTemplates = filteredTemplates.filter(
          (template: any) =>
            template.category?.toUpperCase() === category.toUpperCase()
        );
      }
      if (language && language !== 'all') {
        filteredTemplates = filteredTemplates.filter(
          (template: any) =>
            template.language?.toLowerCase() === language.toLowerCase()
        );
      }

      console.log(`Após filtragem, retornando ${filteredTemplates.length} templates da API`);
      return NextResponse.json({
        success: true,
        templates: filteredTemplates.map((template: any) => ({
          id: template.id,
          name: template.name,
          status: template.status,
          category: template.category,
          language: template.language,
        })),
        isRealData: real,
        fromApi: true,
      });
    }
    
    // Caso contrário, busca apenas do banco de dados
    console.log('Buscando templates do banco de dados...');
    
    // Construir a condição de filtro com base nos parâmetros
    const filterCondition: any = { userId };
    if (category && category !== 'all') {
      filterCondition.category = category;
    }
    if (language && language !== 'all') {
      filterCondition.language = language;
    }
    
    // Buscar os templates do banco de dados
    const dbTemplates = await prisma.whatsAppTemplate.findMany({
      where: filterCondition,
      select: {
        id: true,
        templateId: true,
        name: true,
        status: true,
        category: true,
        language: true,
      },
      orderBy: { name: 'asc' },
    });
    
    console.log(`Encontrados ${dbTemplates.length} templates no banco de dados`);
    
    // Se não encontrou nenhum template e não temos filtros, verificamos se a tabela está vazia
    if (dbTemplates.length === 0 && !category && !language) {
      const totalCount = await prisma.whatsAppTemplate.count();
      if (totalCount === 0) {
        console.log('Banco de dados vazio, buscando templates da API para a primeira carga...');
        // Se o banco estiver vazio, buscamos da API para a primeira carga
        const { templates, real } = await getWhatsAppTemplatesFromAPI(userId);
        
        console.log(`Primeira carga: obtidos ${templates.length} templates da API`);
        return NextResponse.json({
          success: true,
          templates: templates.map((template: any) => ({
            id: template.id,
            name: template.name,
            status: template.status,
            category: template.category,
            language: template.language,
          })),
          isRealData: real,
          fromApi: true,
          firstLoad: true,
        });
      }
    }
    
    // Formatar os resultados do banco para o formato esperado pelo frontend
    const formattedTemplates = dbTemplates.map(template => ({
      id: template.templateId,
      name: template.name,
      status: template.status,
      category: template.category,
      language: template.language,
    }));
    
    return NextResponse.json({
      success: true,
      templates: formattedTemplates,
      isRealData: true,
      fromDatabase: true,
    });
  } catch (error: any) {
    console.error('Erro ao obter templates:', error);
    return NextResponse.json({
      success: true,
      templates: mockTemplates,
      isRealData: false,
      _error: error.message,
    });
  }
}

/**
 * Função para fazer upload de mídia usando a API de Carregamento Retomável da Meta
 * Esta função implementa o processo descrito na documentação da Meta para carregar arquivos grandes
 * @param mediaUrl URL do arquivo de mídia a ser carregado
 * @param mediaType Tipo MIME do arquivo (ex: 'video/mp4', 'image/jpeg')
 * @param appId ID do aplicativo da Meta (opcional, usa o padrão do ambiente)
 * @returns O identificador de mídia (media_handle) para uso no template
 */
async function uploadMediaToMeta(mediaUrl: string, mediaType: string, appId?: string): Promise<{id: string, publicUrl?: string}> {
  try {
    // Verificamos se a mídia já está no MinIO
    if (mediaUrl.includes('objstoreapi.witdev.com.br') || mediaUrl.includes('objstore.witdev.com.br')) {
      console.log(`[uploadMediaToMeta] A mídia já está no MinIO: ${mediaUrl}`);
      // Retorna apenas a URL pública, pois não precisamos fazer upload para a Meta
      return { id: mediaUrl, publicUrl: mediaUrl };
    }

    // Configuração do WhatsApp
    const config = getWhatsAppApiConfig();
    const { whatsappToken, whatsappBusinessAccountId } = config;
    
    // Determinar o endpoint correto para upload baseado no tipo de mídia
    const mediaEndpoint = `/${appId || whatsappBusinessAccountId}/media`;
    
    // Fazer download da mídia se for uma URL externa
    let fileData: Buffer;
    let fileName: string;
    let contentType: string;
    
    if (mediaUrl.startsWith('http')) {
      console.log(`[uploadMediaToMeta] Baixando mídia de URL externa: ${mediaUrl}`);
      const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
      fileData = Buffer.from(response.data, 'binary');
      contentType = response.headers['content-type'] || `${mediaType}/*`;
      fileName = `whatsapp_media_${Date.now()}.${contentType.split('/')[1] || 'bin'}`;
    } else {
      // Suponhamos que seja um base64 ou outro formato
      throw new Error('Formato de mídia não suportado para upload');
    }
    
    // Upload para o MinIO para armazenamento persistente
    const { uploadToMinIO } = await import('@/lib/minio');
    console.log(`[uploadMediaToMeta] Fazendo upload para MinIO: ${fileName}`);
    const minioResult = await uploadToMinIO(fileData, fileName, contentType);
    const publicUrl = minioResult.url;
    console.log(`[uploadMediaToMeta] URL pública do MinIO: ${publicUrl}`);
    
    // Upload para a API da Meta
    console.log(`[uploadMediaToMeta] Fazendo upload para Meta API: ${mediaEndpoint}`);
    const formData = new FormData();
    const blob = new Blob([fileData], { type: contentType });
    formData.append('file', blob, fileName);
    
    // Fazer o upload
    const uploadResponse = await axios.post(
      `${config.fbGraphApiBase}${mediaEndpoint}`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${whatsappToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    console.log(`[uploadMediaToMeta] Resposta da Meta API:`, uploadResponse.data);
    
    return { 
      id: uploadResponse.data.id,
      publicUrl: publicUrl 
    };
  } catch (error) {
    console.error('[uploadMediaToMeta] Erro:', error);
    throw error;
  }
}

/**
 * Função auxiliar para extrair a URL da mídia de um componente
 */
function getMediaUrl(component: any): string | null {
  if (component.type === 'HEADER' && component.example?.header_url) {
    return component.example.header_url;
  } else if (component.type === 'HEADER' && component.example?.header_handle && component.example.header_handle.length > 0) {
    // Caso especial para os handles de mídia já processados pelo MetaMediaUpload
    return component.example.header_handle[0];
  } else if (component.type === 'IMAGE' && component.example?.image_url) {
    return component.example.image_url;
  } else if (component.type === 'VIDEO' && component.example?.video_url) {
    return component.example.video_url;
  } else if (component.type === 'DOCUMENT' && component.example?.document_url) {
    return component.example.document_url;
  }
  return null;
}

/**
 * POST /api/admin/mtf-diamante/templates
 * Cria um novo template na API do WhatsApp.
 */
export async function POST(request: Request) {
  try {
    // Verificar autenticação
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const config = getWhatsAppApiConfig();
    const fbGraphApiBase = 'https://graph.facebook.com/v22.0';

    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      throw new Error(
        'Credenciais inválidas. Verifique WHATSAPP_BUSINESS_ID e WHATSAPP_TOKEN.'
      );
    }

    const body = await request.json();
    console.log('Criando novo template:', body);

    // Validar payload
    if (!body.name || !body.category || !body.language || !body.components) {
      return NextResponse.json(
        {
          success: false,
          error: 'Dados incompletos. Necessário: name, category, language, components.',
        },
        { status: 400 }
      );
    }

    // Extrair a URL pública da mídia dos componentes, se disponível
    let publicMediaUrl = null;

    // Procurar URL em componentes de cabeçalho
    const mediaComponents = body.components.filter((component: any) => {
      return (
        (component.type === 'HEADER' && ['IMAGE', 'VIDEO'].includes(component.format))
      );
    });

    if (mediaComponents.length > 0) {
      const mediaComponent = mediaComponents[0];
      
      // Verificar se temos o campo especial _minioUrl enviado pelo frontend
      if (mediaComponent.example?._minioUrl) {
        publicMediaUrl = mediaComponent.example._minioUrl;
        console.log(`URL de mídia encontrada no campo _minioUrl: ${publicMediaUrl}`);
        
        // Remover o campo _minioUrl antes de salvar no WhatsApp
        if (typeof mediaComponent.example === 'object') {
          // Use spread operator para criar uma cópia sem o campo _minioUrl
          const { _minioUrl, ...exampleWithoutMinioUrl } = mediaComponent.example;
          mediaComponent.example = exampleWithoutMinioUrl;
        }
      }
      // Verificar se temos uma URL direta no header_url (usado internamente)
      else if (mediaComponent.example?.header_url) {
        publicMediaUrl = mediaComponent.example.header_url;
        console.log(`URL de mídia encontrada diretamente em header_url: ${publicMediaUrl}`);
        
        // Remover o campo header_url antes de enviar para o WhatsApp
        if (typeof mediaComponent.example === 'object') {
          const { header_url, ...exampleWithoutUrl } = mediaComponent.example;
          mediaComponent.example = exampleWithoutUrl;
        }
      }
      // Se não encontramos na URL direta, vamos tentar extrair de metadados ou outros campos
      else if (mediaComponent.example?.header_handle && 
          typeof mediaComponent.example.header_handle[0] === 'string') {
        const mediaHandle = mediaComponent.example.header_handle[0];
        
        // Verificar se o próprio handle é uma URL do MinIO (pode acontecer em ambientes de teste)
        if (mediaHandle.includes('objstoreapi.witdev.com.br') || 
            mediaHandle.includes('objstore.witdev.com.br')) {
          publicMediaUrl = mediaHandle;
          console.log(`URL do MinIO encontrada no media handle: ${publicMediaUrl}`);
        }
      }
    }

    // Montar o payload para a API do WhatsApp
    const templatePayload = {
      name: body.name,
      category: body.category,
      language: body.language,
      components: body.components,
    };

    // Log final antes de enviar para a API
    console.log("✅ URL da mídia para salvar no banco:", publicMediaUrl);
    console.log("✅ Payload final para API WhatsApp:", JSON.stringify(templatePayload, null, 2));

    // Enviar para a API
    console.log('Enviando template para WhatsApp API');
    const templateResponse = await createWhatsAppTemplate(templatePayload);
    
    // Salvar no banco de dados, incluindo a URL pública da mídia
    try {
      console.log('Salvando template no banco de dados com URL pública:', publicMediaUrl);
      
      // Primeiro criamos o template no banco de dados
      const createdTemplate = await prisma.whatsAppTemplate.create({
        data: {
          templateId: templateResponse.id,
          name: body.name,
          category: body.category,
          subCategory: body.sub_category || null,
          status: templateResponse.status || 'PENDING',
          language: body.language,
          components: body.components,
          userId: session.user.id,
          // Adicionar a URL pública da mídia, se disponível
          ...(publicMediaUrl ? { publicMediaUrl } : {})
        },
      });
      
      console.log(`Template salvo no banco de dados com sucesso. ID: ${createdTemplate.id}`);
      console.log(`URL pública da mídia salva: ${publicMediaUrl || 'Nenhuma'}`);
    } catch (dbError) {
      console.error('Erro ao salvar template no banco:', dbError);
      // Não falha se não conseguir salvar no banco
    }

    return NextResponse.json({
      success: true,
      result: templateResponse,
      template: {
        id: templateResponse.id,
        name: body.name,
        status: 'PENDING',
      },
    });
  } catch (error: any) {
    if (error.response) {
      console.error('Erro ao criar template - API WhatsApp:', {
        status: error.response.status,
        data: error.response.data,
      });
      if (error.response.data?.error) {
        const metaError = error.response.data.error;
        return NextResponse.json(
          {
            success: false,
            error: `Erro API Meta: [${metaError.code}] ${metaError.message}`,
          },
          { status: error.response.status }
        );
      }
    }
    console.error('Erro ao criar template:', error.message || error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erro desconhecido ao criar template',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/mtf-diamante/templates
 * Exclui um template. Informe via body o "name" ou "hsm_id" do template.
 */
export async function DELETE(request: Request) {
  try {
    const config = getWhatsAppApiConfig();
    const fbGraphApiBase = 'https://graph.facebook.com/v22.0';

    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      throw new Error(
        'Credenciais inválidas. Verifique WHATSAPP_BUSINESS_ID e WHATSAPP_TOKEN.'
      );
    }

    const body = await request.json().catch(() => ({}));
    const { name, hsm_id } = body;

    if (!name && !hsm_id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'É necessário informar o "name" ou "hsm_id" do template para deletar.',
        },
        { status: 400 }
      );
    }

    let url = `${fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates`;
    if (hsm_id) {
      url += `?hsm_id=${hsm_id}`;
    }

    const headers = {
      Authorization: `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json',
    };

    const payload = name ? { name } : {};
    const response = await axios.delete(url, { headers, data: payload });
    return NextResponse.json({
      success: true,
      result: response.data || 'Template deletado com sucesso',
    });
  } catch (error: any) {
    if (error.response) {
      console.error('Erro ao deletar template - API WhatsApp:', {
        status: error.response.status,
        data: error.response.data,
      });
      if (error.response.data?.error) {
        const metaError = error.response.data.error;
        return NextResponse.json(
          {
            success: false,
            error: `Erro API Meta: [${metaError.code}] ${metaError.message}`,
          },
          { status: error.response.status }
        );
      }
    }
    console.error('Erro ao deletar template:', error.message || error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erro desconhecido ao deletar template',
      },
      { status: 500 }
    );
  }
}

// Função para enviar o template para a API do WhatsApp
async function createWhatsAppTemplate(template: any) {
  try {
    const whatsappBusinessId = process.env.WHATSAPP_BUSINESS_ID;
    const whatsappToken = process.env.WHATSAPP_TOKEN;
    
    if (!whatsappBusinessId || !whatsappToken) {
      throw new Error("Credenciais do WhatsApp não configuradas");
    }
    
    console.log("Enviando template para WhatsApp API:", JSON.stringify(template, null, 2));
    
    /* IMPORTANTE: Cabeçalhos de vídeo devem usar o formato correto
     * Se estiver recebendo o erro 2388273, isso geralmente indica um problema com o formato do cabeçalho de vídeo.
     * De acordo com a documentação oficial do WhatsApp:
     * 1. O vídeo deve ser primeiro carregado usando a API de Carregamento Retomável (Resumable Upload API)
     * 2. O identificador retornado (media asset handle) deve ser usado no campo header_handle
     * 3. O formato correto é:
     *    {
     *      "type": "HEADER",
     *      "format": "VIDEO",
     *      "example": {
     *        "header_handle": [
     *          "<MEDIA_ASSET_HANDLE>"
     *        ]
     *      }
     *    }
     * 4. Usar URLs diretas não é suportado oficialmente e pode causar erros
     */
    
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${whatsappBusinessId}/message_templates`,
      template,
      {
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    console.log("Resposta da WhatsApp API:", response.data);
    
    // Verificar se a resposta tem um ID
    if (!response.data || !response.data.id) {
      throw new Error("Resposta da API não contém ID do template");
    }
    
    return {
      id: response.data.id,
      status: response.data.status || 'PENDING'
    };
  } catch (error: any) {
    console.error("Erro ao criar template no WhatsApp:", error.response?.data || error.message);
    throw error;
  }
}