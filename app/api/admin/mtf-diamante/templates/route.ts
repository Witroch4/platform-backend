import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { mtfDiamanteConfig } from '@/app/config/mtf-diamante';
import { getPrismaInstance } from '@/lib/connections';
import { VariableConverter, type MtfDiamanteVariavel } from '@/app/lib/variable-converter';

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
 * Primeiro tenta buscar do banco de dados (configuração do usuário),
 * depois das variáveis de ambiente como fallback.
 */
async function getWhatsAppApiConfig(userId: string) {
  try {
    // Buscar configuração do usuário no banco
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
      where: { appUserId: userId },
      include: {
        configuracaoGlobalWhatsApp: true
      }
    });

    if (usuarioChatwit?.configuracaoGlobalWhatsApp) {
      const config = usuarioChatwit.configuracaoGlobalWhatsApp;
      return {
        fbGraphApiBase: config.graphApiBaseUrl,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        whatsappToken: config.whatsappApiKey,
      };
    }

    // Fallback para variáveis de ambiente
    return {
      fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
      whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '294585820394901',
      whatsappToken: process.env.WHATSAPP_TOKEN || mtfDiamanteConfig.whatsappToken,
    };
  } catch (error) {
    console.error('Erro ao buscar configuração do WhatsApp:', error);
    // Fallback para variáveis de ambiente em caso de erro
    return {
      fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
      whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '294585820394901',
      whatsappToken: process.env.WHATSAPP_TOKEN || mtfDiamanteConfig.whatsappToken,
    };
  }
}

/**
 * Função para buscar as variáveis do usuário para conversão de templates
 */
async function getUserVariables(userId: string): Promise<MtfDiamanteVariavel[]> {
  try {
    // Busca ou cria a configuração do MTF Diamante
    let config = await getPrismaInstance().mtfDiamanteConfig.findFirst({
      where: { userId },
      include: { variaveis: true }
    });

    if (!config) {
      // Cria configuração padrão com variáveis iniciais
      config = await getPrismaInstance().mtfDiamanteConfig.create({
        data: {
          userId,
          variaveis: {
            create: [
              { chave: "chave_pix", valor: "57944155000101" },
              { chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" }
            ]
          }
        },
        include: { variaveis: true }
      });
    }

    return config.variaveis.map(v => ({
      id: v.id,
      chave: v.chave,
      valor: String(v.valor || ''),
    }));
  } catch (error) {
    console.error('Erro ao buscar variáveis do usuário:', error);
    // Retorna variáveis padrão em caso de erro
    return [
      { chave: "chave_pix", valor: "57944155000101" },
      { chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" }
    ];
  }
}

/**
 * Função para salvar ou atualizar um template no banco de dados.
 */
async function syncTemplateWithDatabase(template: any, userId: string) {
  try {
    // Verifica se já existe um template com o mesmo nome
    const existingTemplate = await getPrismaInstance().template.findFirst({
      where: { 
        name: template.name,
        createdById: userId
      },
    });

    // Mapeia os dados da API para os campos do modelo
    const data = {
      name: template.name,
      status: template.status as any,
      language: template.language || 'pt_BR',
      tags: [template.category || 'UTILITY'],
      type: 'WHATSAPP_OFFICIAL' as any,
      scope: 'PRIVATE' as any,
      createdById: userId,
      whatsappOfficialInfo: {
        create: {
          metaTemplateId: template.id.toString(),
          status: template.status,
          category: template.category || 'UTILITY',
          components: template.components || {},
        }
      }
    };

    if (existingTemplate) {
      await getPrismaInstance().template.update({
        where: { id: existingTemplate.id },
        data: {
          ...data,
          whatsappOfficialInfo: {
            upsert: {
              create: {
                metaTemplateId: template.id.toString(),
                status: template.status,
                category: template.category || 'UTILITY',
                components: template.components || {},
              },
              update: {
                metaTemplateId: template.id.toString(),
                status: template.status,
                category: template.category || 'UTILITY',
                components: template.components || {},
              }
            }
          }
        },
      });
      console.log(`Template ${template.name} atualizado no banco de dados`);
    } else {
      await getPrismaInstance().template.create({
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
 * Função para buscar os templates do WhatsApp com paginação e sincronizá-los no banco.
 */
async function getWhatsAppTemplatesFromAPI(userId: string) {
  try {
    const config = await getWhatsAppApiConfig(userId);
    
    console.log('Usando configurações da API:', {
      fbGraphApiBase: config.fbGraphApiBase,
      whatsappBusinessAccountId: config.whatsappBusinessAccountId,
      tokenLength: config.whatsappToken?.length,
      tokenStart: config.whatsappToken?.substring(0, 10) + '...',
    });

    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      throw new Error('Credenciais da API do WhatsApp não configuradas. Configure as credenciais nas configurações globais.');
    }

    // Incluímos na query os campos adicionais para armazenar no banco
    const url = `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates?fields=name,status,category,language,components,sub_category,quality_score,correct_category,cta_url_link_tracking_opted_out,library_template_name,message_send_ttl_seconds,parameter_format,previous_category&limit=1000`;
    
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
 */
export async function GET(request: Request) {
  try {
    // Autenticação para obter o userId
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = session.user.id;

    // Buscar o UsuarioChatwit do usuário logado
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
      where: { appUserId: userId },
      select: { id: true }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ 
        error: 'Usuário Chatwit não encontrado. Configure seu token primeiro.' 
      }, { status: 404 });
    }


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
        filteredTemplates = filteredTemplates.filter((template: any) =>
          template.category?.toUpperCase() === category.toUpperCase()
        );
      }
      if (language && language !== 'all') {
        filteredTemplates = filteredTemplates.filter((template: any) =>
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
    const filterCondition: any = { createdById: userId };
    if (category && category !== 'all') {
      filterCondition.tags = { has: category };
    }
    if (language && language !== 'all') {
      filterCondition.language = language;
    }

    // Buscar os templates do banco de dados
    const dbTemplates = await getPrismaInstance().template.findMany({
      where: filterCondition,
      include: {
        whatsappOfficialInfo: true
      },
      orderBy: { name: 'asc' },
    });

    console.log(`Encontrados ${dbTemplates.length} templates no banco de dados`);

    // Se não encontrou nenhum template e não temos filtros, verificamos se a tabela está vazia
    if (dbTemplates.length === 0 && !category && !language) {
      const totalCount = await getPrismaInstance().template.count({
        where: { createdById: userId }
      });

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
      id: template.whatsappOfficialInfo?.metaTemplateId || template.id,
      name: template.name,
      status: template.status,
      category: template.tags[0] || 'UTILITY',
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

    const config = await getWhatsAppApiConfig(session.user.id);

    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      throw new Error('Credenciais inválidas. Configure as credenciais do WhatsApp nas configurações globais.');
    }

    const body = await request.json();
    console.log('Criando novo template:', body);

    // Validar payload
    if (!body.name || !body.category || !body.language || !body.components) {
      return NextResponse.json({
        success: false,
        error: 'Dados incompletos. Necessário: name, category, language, components.',
      }, { status: 400 });
    }

    // Buscar variáveis do usuário para conversão
    const userVariables = await getUserVariables(session.user.id);
    console.log('Variáveis do usuário carregadas:', userVariables);

    // Inicializar conversor de variáveis
    const variableConverter = new VariableConverter();

    // Validar template antes da conversão
    let allTemplateText = '';
    body.components.forEach((component: any) => {
      if (component.text) {
        allTemplateText += component.text + ' ';
      }
    });

    const validation = variableConverter.validateTemplate(allTemplateText);
    if (!validation.isValid) {
      return NextResponse.json({
        success: false,
        error: `Erro de validação de variáveis: ${validation.errors.join(', ')}`,
      }, { status: 400 });
    }

    // Converter variáveis nos componentes do template
    const convertedComponents = [];
    let allParameterArrays: string[] = [];
    let hasPixVariable = false;

    try {
      for (const component of body.components) {
        const convertedComponent = { ...component };

        // Converter variáveis em componentes de texto
        if (component.text) {
          const conversion = variableConverter.convertToMetaFormat(component.text, userVariables);
          convertedComponent.text = conversion.convertedText;
          
          // Adicionar parâmetros ao array geral
          allParameterArrays = [...allParameterArrays, ...conversion.parameterArray];
          
          // Verificar se contém variável PIX
          if (conversion.mapping.some(m => m.customName === 'chave_pix')) {
            hasPixVariable = true;
          }

          console.log(`Componente ${component.type} convertido:`, {
            original: component.text,
            converted: conversion.convertedText,
            parameters: conversion.parameterArray,
            mapping: conversion.mapping
          });
        }

        convertedComponents.push(convertedComponent);
      }
    } catch (conversionError: any) {
      console.error('Erro na conversão de variáveis:', conversionError);
      return NextResponse.json({
        success: false,
        error: `Erro na conversão de variáveis: ${conversionError.message}`,
      }, { status: 400 });
    }

    // Extrair a URL pública da mídia dos componentes, se disponível
    let publicMediaUrl = null;
    
    // Procurar URL em componentes de cabeçalho
    const mediaComponents = convertedComponents.filter((component: any) => {
      return ((component.type === 'HEADER' && ['IMAGE', 'VIDEO'].includes(component.format)));
    });

    if (mediaComponents.length > 0) {
      const mediaComponent = mediaComponents[0];
      
      // Verificar se temos o campo especial _minioUrl enviado pelo frontend
      if (mediaComponent.example?._minioUrl) {
        publicMediaUrl = mediaComponent.example._minioUrl;
        console.log(`URL de mídia encontrada no campo _minioUrl: ${publicMediaUrl}`);
        
        // Remover o campo _minioUrl antes de salvar no WhatsApp
        if (typeof mediaComponent.example === 'object') {
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
    }

    // Montar o payload para a API do WhatsApp com componentes convertidos
    const templatePayload: any = {
      name: body.name,
      category: body.category,
      language: body.language,
      components: convertedComponents,
    };

    // Se o template contém variável PIX, garantir que o PIX code está incluído no payload
    // Nota: O PIX code será incluído nos parâmetros dos componentes, não como campo separado
    if (hasPixVariable) {
      const pixVariable = userVariables.find(v => v.chave === 'chave_pix');
      if (pixVariable) {
        console.log('Template PIX detectado, PIX code incluído nos parâmetros:', pixVariable.valor);
      }
    }

    // Log dos parâmetros para debug (os parâmetros já estão incluídos nos componentes convertidos)
    if (allParameterArrays.length > 0) {
      console.log('Parâmetros de variáveis detectados:', allParameterArrays);
    }

    console.log("✅ URL da mídia para salvar no banco:", publicMediaUrl);
    console.log("✅ Payload final para API WhatsApp (com variáveis convertidas):", JSON.stringify(templatePayload, null, 2));

    // Enviar para a API
    console.log('Enviando template para WhatsApp API');
    const templateResponse = await createWhatsAppTemplate(templatePayload, config);

    // Salvar no banco de dados, incluindo a URL pública da mídia
    try {
      console.log('Salvando template no banco de dados com URL pública:', publicMediaUrl);
      
      // Primeiro criamos o template no banco de dados
      const createdTemplate = await getPrismaInstance().template.create({
        data: {
          name: body.name,
          status: templateResponse.status || 'PENDING',
          language: body.language,
          tags: [body.category],
          type: 'WHATSAPP_OFFICIAL',
          scope: 'PRIVATE',
          createdById: session.user.id,
          whatsappOfficialInfo: {
            create: {
              metaTemplateId: templateResponse.id,
              status: templateResponse.status || 'PENDING',
              category: body.category,
              components: body.components,
            }
          }
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
        return NextResponse.json({
          success: false,
          error: `Erro API Meta: [${metaError.code}] ${metaError.message}`,
        }, { status: error.response.status });
      }
    }

    console.error('Erro ao criar template:', error.message || error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Erro desconhecido ao criar template',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/mtf-diamante/templates
 * Exclui um template. Informe via body o "name" ou "hsm_id" do template.
 */
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const config = await getWhatsAppApiConfig(session.user.id);

    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      throw new Error('Credenciais inválidas. Configure as credenciais do WhatsApp nas configurações globais.');
    }

    const body = await request.json().catch(() => ({}));
    const { name, hsm_id } = body;

    if (!name && !hsm_id) {
      return NextResponse.json({
        success: false,
        error: 'É necessário informar o "name" ou "hsm_id" do template para deletar.',
      }, { status: 400 });
    }

    let url = `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates`;
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
        return NextResponse.json({
          success: false,
          error: `Erro API Meta: [${metaError.code}] ${metaError.message}`,
        }, { status: error.response.status });
      }
    }

    console.error('Erro ao deletar template:', error.message || error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Erro desconhecido ao deletar template',
    }, { status: 500 });
  }
}

// Função para enviar o template para a API do WhatsApp
async function createWhatsAppTemplate(template: any, config: any) {
  try {
    console.log("Enviando template para WhatsApp API:", JSON.stringify(template, null, 2));

    const response = await axios.post(
      `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates`,
      template,
      {
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`,
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