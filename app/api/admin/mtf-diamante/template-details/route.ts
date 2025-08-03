import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { getWhatsAppConfig } from '@/app/lib';
import { db } from "@/lib/db";

/**
 * Endpoint para obter detalhes de um template específico
 * GET /api/admin/mtf-diamante/template-details?name=TEMPLATE_NAME
 */
export async function GET(request: Request) {
  try {
    // Verificar autenticação
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Verificar se o usuário é admin
    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Obter o nome do template da query string
    const url = new URL(request.url);
    const templateName = url.searchParams.get('name');
    
    if (!templateName) {
      return NextResponse.json({ error: "Nome do template não especificado" }, { status: 400 });
    }

    // Obter configurações do WhatsApp
    const config = await getWhatsAppConfig(session.user.id);
    
    // Verificar se temos a configuração necessária
    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      return NextResponse.json({ 
        error: "Configuração do WhatsApp incompleta",
        config: {
          hasBusinessId: !!config.whatsappBusinessAccountId,
          hasToken: !!config.whatsappToken
        }
      }, { status: 400 });
    }

    // Resultados
    const results = {
      dbTemplate: null as null | {
        id: string;
        name: string;
        status: string;
        language: string;
        components: any;
        category: string;
      },
      apiTemplate: null
    };

    // 1. Verificar se o template existe no banco
    const dbTemplate = await db.template.findFirst({
      where: {
        name: templateName
      },
      include: {
        whatsappOfficialInfo: true
      }
    });

    if (dbTemplate) {
      results.dbTemplate = {
        id: dbTemplate.id,
        name: dbTemplate.name,
        status: dbTemplate.status,
        language: dbTemplate.language,
        components: dbTemplate.whatsappOfficialInfo?.components || null,
        category: dbTemplate.whatsappOfficialInfo?.category || dbTemplate.tags[0] || 'UTILITY',
      };
    }

    // 2. Buscar template diretamente na API do WhatsApp
    try {
      const templatesUrl = `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates?fields=name,status,category,language,components&name=${templateName}`;
      const response = await axios.get(templatesUrl, {
        headers: {
          'Authorization': `Bearer ${config.whatsappToken}`,
          'Content-Type': 'application/json',
        }
      });
      
      // Verificar se temos resultados
      if (response.data && response.data.data && response.data.data.length > 0) {
        // Encontrar o template específico (pode haver vários com nomes semelhantes)
        const apiTemplate = response.data.data.find((t: any) => t.name === templateName);
        
        if (apiTemplate) {
          results.apiTemplate = apiTemplate;
          
          // Atualizar o banco de dados com as informações mais recentes da API
          if (dbTemplate) {
            await db.template.update({
              where: { id: dbTemplate.id },
              data: {
                status: apiTemplate.status as any,
                simpleReplyText: JSON.stringify(apiTemplate.components),
                language: apiTemplate.language,
                type: apiTemplate.category as any,
                updatedAt: new Date()
              }
            });
          } else {
            // Criar o template no banco se ele não existir
            await db.template.create({
              data: {
                name: apiTemplate.name,
                status: apiTemplate.status as any,
                simpleReplyText: JSON.stringify(apiTemplate.components),
                language: apiTemplate.language,
                type: apiTemplate.category as any,
                createdById: session.user.id,
                isActive: true
              }
            });
          }
        }
      }
    } catch (apiError: any) {
      console.error("Erro ao buscar template na API:", apiError.response?.data || apiError.message);
      
      return NextResponse.json({ 
        error: "Erro ao buscar template na API do WhatsApp",
        details: apiError.response?.data?.error || apiError.message,
        templateName,
        results 
      }, { status: apiError.response?.status || 500 });
    }

    // Verificar se encontramos o template
    if (!results.dbTemplate && !results.apiTemplate) {
      return NextResponse.json({ 
        error: "Template não encontrado", 
        templateName 
      }, { status: 404 });
    }

    // Retornar resultados
    return NextResponse.json({
      success: true,
      templateName,
      results
    });

  } catch (error: any) {
    console.error("Erro ao buscar detalhes do template:", error);
    
    return NextResponse.json({ 
      error: "Erro ao buscar detalhes do template",
      details: error.message 
    }, { status: 500 });
  }
} 